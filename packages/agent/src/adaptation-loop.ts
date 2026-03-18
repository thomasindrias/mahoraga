import type { IssueGroup } from 'mahoraga-core';
import type { AgentExecutor, AgentExecutionResult, AgentExecuteOptions } from './executor.js';
import { generateTest, type GeneratedTest } from './test-generator.js';

/**
 * Result of the adaptation loop.
 */
export interface AdaptationResult {
  /** Whether the fix passed the generated test */
  success: boolean;
  /** Number of attempts made */
  attempts: number;
  /** The generated test details */
  generatedTest: GeneratedTest;
  /** The final agent execution result */
  executionResult: AgentExecutionResult;
  /** Errors from failed attempts */
  attemptErrors: string[];
}

/**
 * Options for the adaptation loop.
 */
export interface AdaptationOptions {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Agent execution options */
  executeOptions?: AgentExecuteOptions;
  /** Function to run the generated test. Returns null if passed, error message if failed. */
  testRunner?: (test: GeneratedTest) => Promise<string | null>;
}

/**
 * Execute the Mahoraga adaptation loop.
 * 1. Agent writes fix
 * 2. Generate a localized test mimicking the user journey
 * 3. Run the test
 * 4. If test fails → feed error back to agent → retry
 * 5. Only succeed if test passes
 * @param executor - AI agent executor
 * @param prompt - Initial prompt for the agent
 * @param issue - Issue being fixed
 * @param workDir - Working directory (git worktree)
 * @param options - Loop options
 * @returns Adaptation result
 */
export async function runAdaptationLoop(
  executor: AgentExecutor,
  prompt: string,
  issue: IssueGroup,
  workDir: string,
  options: AdaptationOptions = {},
): Promise<AdaptationResult> {
  const maxRetries = options.maxRetries ?? 3;
  const testRunner = options.testRunner ?? defaultTestRunner;
  const attemptErrors: string[] = [];

  // Generate the test for this issue
  const generatedTest = generateTest(issue, workDir);

  let currentPrompt = prompt;
  let lastResult: AgentExecutionResult = { success: false, error: 'Not executed' };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Execute the agent
    lastResult = await executor.execute(
      currentPrompt,
      workDir,
      options.executeOptions,
    );

    if (!lastResult.success) {
      attemptErrors.push(
        `Attempt ${attempt + 1}: Agent failed — ${lastResult.error}`,
      );
      continue;
    }

    // Run the generated test
    let testError: string | null;
    try {
      testError = await testRunner(generatedTest);
    } catch (error) {
      testError = error instanceof Error ? error.message : String(error);
    }

    if (testError === null) {
      // Test passed — fix is verified
      return {
        success: true,
        attempts: attempt + 1,
        generatedTest,
        executionResult: lastResult,
        attemptErrors,
      };
    }

    // Test failed — build retry prompt with error feedback
    attemptErrors.push(
      `Attempt ${attempt + 1}: Test failed — ${testError}`,
    );

    if (attempt < maxRetries) {
      currentPrompt = buildRetryPrompt(prompt, testError, attempt + 1, maxRetries);
    }
  }

  return {
    success: false,
    attempts: maxRetries + 1,
    generatedTest,
    executionResult: lastResult,
    attemptErrors,
  };
}

function buildRetryPrompt(
  originalPrompt: string,
  testError: string,
  attempt: number,
  maxRetries: number,
): string {
  return `${originalPrompt}

## Previous Attempt Failed (${attempt}/${maxRetries + 1})

The generated verification test failed with the following error:

\`\`\`
${testError}
\`\`\`

Please analyze the test failure and adjust your fix. The test must pass for the fix to be accepted.
Focus on the root cause indicated by the test error.`;
}

async function defaultTestRunner(test: GeneratedTest): Promise<string | null> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  try {
    await exec('npx', ['vitest', 'run', test.testPath], {
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    return null; // Test passed
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
