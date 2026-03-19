import * as path from 'node:path';
import {
  createDatabase,
  EventStore,
  CheckpointStore,
  IssueStore,
  RunStore,
  SuppressionStore,
} from 'mahoraga-core';
import type { MahoragaConfig, TimeRange, RunError, SourceConfig } from 'mahoraga-core';
import { PipelineRunner, AmplitudeAdapter, PostHogAdapter } from 'mahoraga-sources';
import type { SourceAdapter } from 'mahoraga-sources';
import { AnalysisEngine, RageClickRule, ErrorSpikeRule, DeadClickRule, FormAbandonmentRule, SlowNavigationRule, LayoutShiftRule, ErrorLoopRule } from 'mahoraga-analyzer';
import { AgentDispatcher, ClaudeCodeExecutor, CostTracker, createWorktree, cleanupWorktree } from 'mahoraga-agent';
import { randomUUID } from 'node:crypto';

/**
 * Options for the analyze command.
 */
export interface AnalyzeOptions {
  /** Run in dry-run mode (pull + analyze only, no dispatch) */
  dryRun?: boolean;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Full pipeline command: pull → analyze → dispatch.
 * @param config - Mahoraga configuration
 * @param cwd - Working directory
 * @param options - Command options
 */
export async function runAnalyze(
  config: MahoragaConfig,
  cwd: string,
  options: AnalyzeOptions = {},
): Promise<void> {
  const dbManager = createDatabase(config.storage.dbPath);
  const eventStore = new EventStore(dbManager.db);
  const checkpointStore = new CheckpointStore(dbManager.db);
  const issueStore = new IssueStore(dbManager.db);
  const runStore = new RunStore(dbManager.db);

  const runId = randomUUID();
  runStore.create(runId);

  const errors: RunError[] = [];
  const now = Date.now();

  try {
    // Phase 1: Data retention cleanup
    const retentionCutoff = now - config.storage.retentionDays * 24 * 60 * 60 * 1000;
    const deleted = eventStore.deleteOlderThan(retentionCutoff);
    if (deleted > 0 && options.verbose) {
      console.log(`Cleaned up ${deleted} expired events`);
    }

    // Phase 2: Pull events from sources
    const runner = new PipelineRunner(eventStore, checkpointStore);
    let totalPulled = 0;

    const windowMs = config.analysis.windowDays * 24 * 60 * 60 * 1000;
    const timeRange: TimeRange = {
      start: now - windowMs,
      end: now,
    };

    for (const sourceConfig of config.sources) {
      try {
        const adapter = await getAdapter(sourceConfig, cwd);
        if (!adapter) {
          console.warn(`Unknown adapter: ${sourceConfig.adapter}`);
          continue;
        }

        const result = await runner.run(adapter, sourceConfig, timeRange);
        if (result.status === 'ok' || result.status === 'partial') {
          totalPulled += result.eventCount;
        }
        if (result.status === 'partial' || result.status === 'failed') {
          errors.push({
            phase: 'pull',
            message: `${sourceConfig.adapter}: ${result.error.message}`,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        errors.push({
          phase: 'pull',
          message: `${sourceConfig.adapter}: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: Date.now(),
        });
      }
    }

    runStore.update(runId, { eventsPulled: totalPulled });
    console.log(`Pulled ${totalPulled} events from ${config.sources.length} source(s)`);

    // Phase 3: Analyze events
    const engine = new AnalysisEngine();

    for (const ruleId of config.analysis.rules) {
      switch (ruleId) {
        case 'rage-clicks':
          engine.registerRule(new RageClickRule());
          break;
        case 'error-spikes':
          engine.registerRule(new ErrorSpikeRule());
          break;
        case 'dead-clicks':
          engine.registerRule(new DeadClickRule());
          break;
        case 'form-abandonment':
          engine.registerRule(new FormAbandonmentRule());
          break;
        case 'slow-navigation':
          engine.registerRule(new SlowNavigationRule());
          break;
        case 'layout-shifts':
          engine.registerRule(new LayoutShiftRule());
          break;
        case 'error-loops':
          engine.registerRule(new ErrorLoopRule());
          break;
      }
    }

    const previousWindow: TimeRange = {
      start: timeRange.start - windowMs,
      end: timeRange.start,
    };

    const issues = await engine.analyze({
      eventStore,
      timeWindow: timeRange,
      previousWindow,
      thresholds: config.analysis.thresholds,
      routePatterns: config.analysis.routePatterns,
    });

    runStore.update(runId, { issuesDetected: issues.length });

    // Filter suppressed issues
    const suppressionStore = new SuppressionStore(dbManager.db);
    const suppressed = suppressionStore.filterSuppressed(issues.map((i) => i.fingerprint));
    const activeIssues = issues.filter((i) => !suppressed.has(i.fingerprint));

    if (suppressed.size > 0) {
      console.log(`Detected ${issues.length} issue(s), ${suppressed.size} suppressed, ${activeIssues.length} active`);
    } else {
      console.log(`Detected ${issues.length} issue(s)`);
    }

    // Persist all detected issues (suppressed ones get 'suppressed' status)
    for (const issue of issues) {
      issueStore.upsert(issue);
      if (suppressed.has(issue.fingerprint)) {
        issueStore.updateStatus(issue.id, 'suppressed');
      }
    }

    if (options.dryRun) {
      console.log('\n--- Dry Run Results ---');
      for (const issue of activeIssues) {
        console.log(
          `  [${issue.severity.toUpperCase()}] ${issue.title} (${issue.frequency} sessions)`,
        );
        for (const el of issue.affectedElements) {
          console.log(`    → ${el.selector} on ${el.url}`);
        }
      }
      runStore.complete(runId, 'completed', errors);
      dbManager.close();
      return;
    }

    // Phase 4: Dispatch agent
    if (activeIssues.length === 0) {
      console.log('No issues to dispatch.');
      runStore.complete(runId, 'completed', errors);
      dbManager.close();
      return;
    }

    const executor = new ClaudeCodeExecutor();
    const dispatcher = new AgentDispatcher(executor, null, config.agent);

    const actionableIssues = issueStore.getByStatus('detected');
    let prsCreated = 0;
    const costTracker = new CostTracker();

    for (const issue of actionableIssues) {
      const check = costTracker.canDispatch(config.agent.maxCostPerRun, config.agent.maxDispatchesPerRun);
      if (!check.allowed) {
        console.log(`Stopping dispatches: ${check.reason}`);
        break;
      }

      const branchName = `mahoraga/fix-${issue.ruleId}-${Date.now()}`;
      let worktreePath: string | null = null;

      try {
        // Create isolated git worktree — main is never directly modified
        worktreePath = await createWorktree(cwd, branchName, config.agent.baseBranch);
        console.log(`Created worktree: ${worktreePath}`);

        const result = await dispatcher.dispatch([issue], worktreePath);
        costTracker.recordDispatch(result.costUsd ?? 1.0);

        if (result.status === 'pr_created') {
          prsCreated++;
          issueStore.updateStatus(issue.id, 'pr_created', result.prUrl);
          console.log(`PR created: ${result.prUrl}`);
        } else {
          issueStore.updateStatus(issue.id, 'no_fix');
          console.log(`No fix: ${result.summary}`);
        }
      } catch (error) {
        costTracker.recordDispatch(1.0); // Count failed dispatch against budget
        errors.push({
          phase: 'dispatch',
          message: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        });
      } finally {
        // Always clean up the worktree
        if (worktreePath) {
          await cleanupWorktree(cwd, worktreePath);
        }
      }
    }

    const summary = costTracker.getSummary();
    if (options.verbose) {
      console.log(`Dispatch summary: ${summary.dispatchCount} dispatches, $${summary.totalCostUsd.toFixed(2)} total`);
    }

    runStore.update(runId, { prsCreated });
    runStore.complete(runId, errors.length > 0 ? 'failed' : 'completed', errors);
  } catch (error) {
    errors.push({
      phase: 'analyze',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: Date.now(),
    });
    runStore.complete(runId, 'failed', errors);
    throw error;
  } finally {
    dbManager.close();
  }
}

/** Resolve a source adapter by name, supporting custom modules via dynamic import. */
export async function getAdapter(
  sourceConfig: SourceConfig,
  cwd: string,
): Promise<SourceAdapter | null> {
  switch (sourceConfig.adapter) {
    case 'amplitude':
      return new AmplitudeAdapter();
    case 'posthog':
      return new PostHogAdapter();
    case 'custom': {
      if (!sourceConfig.module) {
        console.warn('Custom adapter requires a "module" field');
        return null;
      }
      const modulePath = path.resolve(cwd, sourceConfig.module);
      const mod = await import(modulePath);
      const AdapterClass = mod.default ?? mod.adapter;
      if (!AdapterClass) {
        console.warn(`Module ${sourceConfig.module} does not export default or adapter`);
        return null;
      }
      return typeof AdapterClass === 'function' ? new AdapterClass() : AdapterClass;
    }
    default:
      return null;
  }
}
