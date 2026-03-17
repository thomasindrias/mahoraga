import type { IssueGroup, DispatchResult } from '@mahoraga/core';

/**
 * Result from a single agent execution (before post-checks).
 */
export interface AgentExecutionResult {
  /** Whether the agent produced a fix */
  success: boolean;
  /** The diff produced by the agent */
  diff?: string;
  /** Agent's implementation plan */
  plan?: string;
  /** Cost in USD */
  costUsd?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Interface for executing AI agent commands.
 * Supports multiple model providers.
 */
export interface AgentExecutor {
  /** Provider name */
  readonly provider: string;

  /**
   * Execute the agent with the given prompt in the specified working directory.
   * @param prompt - Full structured prompt for the agent
   * @param workDir - Working directory (typically a git worktree)
   * @param options - Execution options
   * @returns Execution result
   */
  execute(
    prompt: string,
    workDir: string,
    options?: AgentExecuteOptions,
  ): Promise<AgentExecutionResult>;
}

/**
 * Options for agent execution.
 */
export interface AgentExecuteOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum cost in USD */
  maxCostUsd?: number;
  /** Path to CLAUDE.md */
  claudeMdPath?: string;
  /** Skills to enable */
  skills?: string[];
  /** MCP servers to enable */
  mcpServers?: string[];
}

/**
 * Claude Code CLI executor.
 * Shells out to the `claude` CLI in headless mode.
 */
export class ClaudeCodeExecutor implements AgentExecutor {
  readonly provider = 'claude-code';

  /** @inheritdoc */
  async execute(
    prompt: string,
    workDir: string,
    options?: AgentExecuteOptions,
  ): Promise<AgentExecutionResult> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    const args = ['--print', '--output-format', 'json'];

    if (options?.claudeMdPath) {
      args.push('--claude-md', options.claudeMdPath);
    }

    if (options?.maxCostUsd) {
      args.push('--max-cost', String(options.maxCostUsd));
    }

    try {
      const { stdout } = await exec('claude', [...args, prompt], {
        cwd: workDir,
        timeout: options?.timeoutMs ?? 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const result = JSON.parse(stdout);
      return {
        success: true,
        diff: result.diff,
        plan: result.plan,
        costUsd: result.cost_usd,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
      };
    }
  }
}

/**
 * Mock agent executor for testing.
 * Returns predetermined results based on configuration.
 */
export class MockAgentExecutor implements AgentExecutor {
  readonly provider = 'mock';
  private callCount = 0;
  private readonly results: AgentExecutionResult[];

  /**
   * Create a mock executor.
   * @param results - Results to return in order. Cycles if more calls than results.
   */
  constructor(results: AgentExecutionResult[]) {
    this.results = results;
  }

  /** @inheritdoc */
  async execute(): Promise<AgentExecutionResult> {
    const result = this.results[this.callCount % this.results.length]!;
    this.callCount++;
    return result;
  }

  /**
   * Get the number of times execute was called.
   * @returns Call count
   */
  getCallCount(): number {
    return this.callCount;
  }
}
