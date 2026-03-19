import type { AgentExecutor, AgentExecutionResult, AgentExecuteOptions } from './executor.js';

/**
 * OpenCode CLI executor.
 * Shells out to the `opencode` CLI in non-interactive mode.
 * OpenCode is provider-agnostic — it supports OpenAI, Anthropic, Gemini,
 * Groq, OpenRouter, AWS Bedrock, and Azure via its own config (.opencode.json).
 */
export class OpenCodeExecutor implements AgentExecutor {
  readonly provider = 'opencode';

  /** @inheritdoc */
  async execute(
    prompt: string,
    workDir: string,
    options?: AgentExecuteOptions,
  ): Promise<AgentExecutionResult> {
    const { spawn } = await import('node:child_process');
    const args = ['run', '--format', 'json', prompt];

    try {
      const { stdout, stderr, exitCode } = await new Promise<{
        stdout: string;
        stderr: string;
        exitCode: number | null;
      }>((resolve, reject) => {
        const env = { ...process.env };
        delete env.GITHUB_TOKEN;

        const child = spawn('opencode', args, {
          cwd: workDir,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: options?.timeoutMs ?? 300_000,
        });

        const chunks: Buffer[] = [];
        const errChunks: Buffer[] = [];

        child.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
        child.stderr!.on('data', (chunk: Buffer) => errChunks.push(chunk));

        child.on('close', (code) => {
          resolve({
            stdout: Buffer.concat(chunks).toString('utf-8'),
            stderr: Buffer.concat(errChunks).toString('utf-8'),
            exitCode: code,
          });
        });

        child.on('error', reject);

        child.stdin!.end();
      });

      if (exitCode !== 0) {
        return {
          success: false,
          error: (stderr || stdout || `exit code ${exitCode}`).slice(0, 1000),
        };
      }

      return this.parseOutput(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `spawn error: ${message}` };
    }
  }

  /**
   * Parse OpenCode NDJSON output.
   * @param stdout - Raw stdout from OpenCode process
   * @returns Parsed execution result
   */
  private parseOutput(stdout: string): AgentExecutionResult {
    const textParts: string[] = [];
    const errors: string[] = [];
    let totalCost = 0;

    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === 'error') {
          errors.push(event.part?.error ?? event.part?.text ?? 'Unknown error');
        }
        if (event.type === 'text' && event.part?.text) {
          textParts.push(event.part.text);
        }
        if (event.type === 'step_finish' && typeof event.part?.cost === 'number') {
          totalCost += event.part.cost;
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    // Error events take priority
    if (errors.length > 0) {
      return { success: false, error: errors.join('; ') };
    }

    if (textParts.length > 0) {
      return {
        success: true,
        diff: textParts.join(''),
        costUsd: totalCost > 0 ? totalCost : undefined,
      };
    }

    // Non-empty raw output as fallback
    if (stdout.trim()) {
      return { success: true, diff: stdout.trim() };
    }

    return {
      success: false,
      error: `OpenCode produced no output. Raw: ${stdout.slice(0, 500)}`,
    };
  }
}
