import type { IssueGroup, AgentConfig, DispatchResult } from 'mahoraga-core';
import type { AgentExecutor } from './executor.js';
import type { SourceLocation } from 'mahoraga-core';
import { buildPrompt } from './prompt-builder.js';
import { runAdaptationLoop } from './adaptation-loop.js';
import { createPR } from './pr-creator.js';
import { checkGovernance, checkDiffSize, checkDiffPaths } from './governance.js';

/**
 * Code mapper interface for resolving selectors to source locations.
 */
export interface CodeMapperLike {
  resolve(selector: string, url?: string): SourceLocation[];
}

/**
 * Orchestrates the full agent dispatch pipeline:
 * group issues → resolve code locations → build prompt → adaptation loop → PR
 */
export class AgentDispatcher {
  /**
   * Create an agent dispatcher.
   * @param executor - AI agent executor
   * @param codeMapper - Code-to-event mapper (nullable if not built)
   * @param config - Agent configuration
   */
  constructor(
    private readonly executor: AgentExecutor,
    private readonly codeMapper: CodeMapperLike | null,
    private readonly config: AgentConfig,
  ) {}

  /**
   * Dispatch the agent to fix a group of related issues.
   * @param issues - Issues to fix
   * @param workDir - Working directory (git worktree)
   * @param runCostSoFar - Cost already spent in this run
   * @returns Dispatch result
   */
  async dispatch(
    issues: IssueGroup[],
    workDir: string,
    runCostSoFar = 0,
  ): Promise<DispatchResult> {
    if (issues.length === 0) {
      return {
        issueIds: [],
        status: 'error',
        summary: 'No issues provided',
        adaptationAttempts: 0,
      };
    }

    const issueIds = issues.map((i) => i.id);

    // Governance check on the first/primary issue
    const primaryIssue = issues[0]!;
    const governance = checkGovernance(primaryIssue, this.config, runCostSoFar);

    if (!governance.allowed) {
      return {
        issueIds,
        status: 'cost_exceeded',
        summary: governance.reason ?? 'Governance check failed',
        adaptationAttempts: 0,
      };
    }

    // Resolve code locations for all affected elements
    const codeLocations = new Map<string, SourceLocation[]>();
    if (this.codeMapper) {
      for (const issue of issues) {
        for (const element of issue.affectedElements) {
          if (!codeLocations.has(element.selector)) {
            const locations = this.codeMapper.resolve(
              element.selector,
              element.url,
            );
            codeLocations.set(element.selector, locations);
          }
        }
      }
    }

    // Build the prompt
    const prompt = buildPrompt({
      issues,
      codeLocations,
      baseBranch: this.config.baseBranch,
    });

    // Run the adaptation loop
    const adaptationResult = await runAdaptationLoop(
      this.executor,
      prompt,
      primaryIssue,
      workDir,
      {
        maxRetries: this.config.maxRetries,
        executeOptions: {
          timeoutMs: this.config.timeoutMs,
          maxCostUsd: this.config.maxCostPerIssue,
          claudeMdPath: this.config.claudeMdPath,
          skills: this.config.skills,
          mcpServers: this.config.mcpServers,
        },
      },
    );

    if (!adaptationResult.success) {
      const lastError = adaptationResult.attemptErrors.at(-1) ?? 'Unknown error';
      return {
        issueIds,
        status: 'no_fix_found',
        summary: `Agent failed after ${adaptationResult.attempts} attempts. Last: ${lastError}`,
        adaptationAttempts: adaptationResult.attempts,
        generatedTestPath: adaptationResult.generatedTest.testPath,
      };
    }

    // Post-agent validation: build, test, diff checks
    const postCheckResult = await this.runPostChecks(workDir);
    if (postCheckResult) {
      return {
        issueIds,
        status: postCheckResult.status as DispatchResult['status'],
        summary: postCheckResult.summary,
        adaptationAttempts: adaptationResult.attempts,
        costUsd: adaptationResult.executionResult.costUsd,
        generatedTestPath: adaptationResult.generatedTest.testPath,
      };
    }

    // Governance: create PR or issue based on confidence
    if (governance.action === 'create_issue') {
      return {
        issueIds,
        status: 'issue_created',
        summary: `Low confidence — created issue instead of PR`,
        adaptationAttempts: adaptationResult.attempts,
        costUsd: adaptationResult.executionResult.costUsd,
        generatedTestPath: adaptationResult.generatedTest.testPath,
      };
    }

    // Create PR if configured
    if (!this.config.createPR) {
      return {
        issueIds,
        status: 'pr_created',
        summary: 'Fix applied locally (PR creation disabled)',
        adaptationAttempts: adaptationResult.attempts,
        costUsd: adaptationResult.executionResult.costUsd,
        generatedTestPath: adaptationResult.generatedTest.testPath,
      };
    }

    // Get the current branch name from the worktree (set by analyze.ts)
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFn = promisify(execFile);
    const { stdout: branchOut } = await execFn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workDir,
      timeout: 10_000,
    });
    const branchName = branchOut.trim();
    const prResult = await createPR(branchName, issues, adaptationResult, {
      baseBranch: this.config.baseBranch,
      draft: this.config.draftPR,
      workDir,
    });

    if (prResult.error) {
      return {
        issueIds,
        status: 'error',
        summary: `PR creation failed: ${prResult.error}`,
        adaptationAttempts: adaptationResult.attempts,
        costUsd: adaptationResult.executionResult.costUsd,
        generatedTestPath: adaptationResult.generatedTest.testPath,
      };
    }

    return {
      issueIds,
      status: 'pr_created',
      prUrl: prResult.prUrl,
      branchName,
      summary: `PR created: ${prResult.prUrl}`,
      adaptationAttempts: adaptationResult.attempts,
      costUsd: adaptationResult.executionResult.costUsd,
      generatedTestPath: adaptationResult.generatedTest.testPath,
    };
  }

  /**
   * Run post-agent validation checks: build, test, diff size, diff paths.
   * @param workDir - Working directory with agent changes
   * @returns Failure result if checks fail, null if all pass
   */
  private async runPostChecks(
    workDir: string,
  ): Promise<{ status: string; summary: string } | null> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    // Check diff size
    try {
      const { stdout } = await exec('git', ['diff', '--stat', 'HEAD'], {
        cwd: workDir,
        timeout: 30_000,
      });
      const diffLines = stdout.split('\n').length;
      const sizeCheck = checkDiffSize(
        diffLines,
        this.config.postChecks.maxDiffLines,
      );
      if (!sizeCheck.allowed) {
        return { status: 'diff_too_large', summary: sizeCheck.reason! };
      }

      // Check diff paths against governance
      const { stdout: filesOut } = await exec(
        'git',
        ['diff', '--name-only', 'HEAD'],
        { cwd: workDir, timeout: 30_000 },
      );
      const changedFiles = filesOut
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
      if (changedFiles.length > 0) {
        const pathCheck = checkDiffPaths(changedFiles, this.config);
        if (!pathCheck.allowed) {
          return { status: 'error', summary: pathCheck.reason! };
        }
      }
    } catch {
      // git diff may fail if not in a git repo — skip check
    }

    // Run build check
    if (this.config.postChecks.build) {
      try {
        await exec('npm', ['run', 'build', '--if-present'], {
          cwd: workDir,
          timeout: 120_000,
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        return { status: 'build_failed', summary: `Build failed: ${msg}` };
      }
    }

    // Run test check
    if (this.config.postChecks.test) {
      try {
        await exec('npm', ['test', '--if-present'], {
          cwd: workDir,
          timeout: 120_000,
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        return {
          status: 'build_failed',
          summary: `Tests failed: ${msg}`,
        };
      }
    }

    return null;
  }
}

/**
 * Create a git worktree for isolated agent work.
 * @param repoDir - Path to the main git repository
 * @param branchName - Branch name for the worktree
 * @param baseBranch - Base branch to create from
 * @returns Path to the created worktree
 */
export async function createWorktree(
  repoDir: string,
  branchName: string,
  baseBranch: string,
): Promise<string> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { join } = await import('node:path');
  const exec = promisify(execFile);

  const worktreePath = join(repoDir, '.mahoraga', 'worktrees', branchName);

  await exec('git', ['worktree', 'add', worktreePath, '-b', branchName, baseBranch], {
    cwd: repoDir,
    timeout: 30_000,
  });

  return worktreePath;
}

/**
 * Remove a git worktree after agent work is complete.
 * @param repoDir - Path to the main git repository
 * @param worktreePath - Path to the worktree to remove
 */
export async function cleanupWorktree(
  repoDir: string,
  worktreePath: string,
): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  try {
    await exec('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: repoDir,
      timeout: 30_000,
    });
  } catch {
    // Best-effort cleanup
  }
}
