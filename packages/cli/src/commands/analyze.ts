import {
  createDatabase,
  EventStore,
  CheckpointStore,
  IssueStore,
  RunStore,
} from 'mahoraga-core';
import type { MahoragaConfig, TimeRange, RunError } from 'mahoraga-core';
import { PipelineRunner, AmplitudeAdapter } from 'mahoraga-sources';
import type { SourceAdapter } from 'mahoraga-sources';
import { AnalysisEngine, RageClickRule, ErrorSpikeRule, DeadClickRule, FormAbandonmentRule, SlowNavigationRule, LayoutShiftRule, ErrorLoopRule } from 'mahoraga-analyzer';
import { AgentDispatcher, ClaudeCodeExecutor, createWorktree, cleanupWorktree } from 'mahoraga-agent';
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
        const adapter = getAdapterByName(sourceConfig.adapter);
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
    });

    runStore.update(runId, { issuesDetected: issues.length });
    console.log(`Detected ${issues.length} issue(s)`);

    // Persist detected issues
    for (const issue of issues) {
      issueStore.upsert(issue);
    }

    if (options.dryRun) {
      console.log('\n--- Dry Run Results ---');
      for (const issue of issues) {
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
    if (issues.length === 0) {
      console.log('No issues to dispatch.');
      runStore.complete(runId, 'completed', errors);
      dbManager.close();
      return;
    }

    const executor = new ClaudeCodeExecutor();
    const dispatcher = new AgentDispatcher(executor, null, config.agent);

    const actionableIssues = issueStore.getByStatus('detected');
    let prsCreated = 0;

    for (const issue of actionableIssues.slice(0, config.agent.maxDispatchesPerRun)) {
      const branchName = `mahoraga/fix-${issue.ruleId}-${Date.now()}`;
      let worktreePath: string | null = null;

      try {
        // Create isolated git worktree — main is never directly modified
        worktreePath = await createWorktree(cwd, branchName, config.agent.baseBranch);
        console.log(`Created worktree: ${worktreePath}`);

        const result = await dispatcher.dispatch([issue], worktreePath);
        if (result.status === 'pr_created') {
          prsCreated++;
          issueStore.updateStatus(issue.id, 'pr_created', result.prUrl);
          console.log(`PR created: ${result.prUrl}`);
        } else {
          issueStore.updateStatus(issue.id, 'no_fix');
          console.log(`No fix: ${result.summary}`);
        }
      } catch (error) {
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

function getAdapterByName(name: string): SourceAdapter | null {
  switch (name) {
    case 'amplitude':
      return new AmplitudeAdapter();
    default:
      return null;
  }
}
