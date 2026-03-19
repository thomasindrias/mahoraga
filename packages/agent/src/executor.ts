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
  async execute(
    _prompt: string,
    _workDir: string,
    _options?: AgentExecuteOptions,
  ): Promise<AgentExecutionResult> {
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
