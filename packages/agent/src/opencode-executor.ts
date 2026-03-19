import type { AgentExecutor, AgentExecutionResult, AgentExecuteOptions } from './executor.js';

/**
 * OpenCode CLI executor.
 * Shells out to the `opencode` CLI in non-interactive mode (-p).
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

    const args = ['-p', '-', '-f', 'json', '-q'];

    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn('opencode', args, {
          cwd: workDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: options?.timeoutMs ?? 300_000,
        });

        const chunks: Buffer[] = [];
        const errChunks: Buffer[] = [];

        child.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
        child.stderr!.on('data', (chunk: Buffer) => errChunks.push(chunk));

        child.on('close', (code) => {
          const out = Buffer.concat(chunks).toString('utf-8');
          const stderr = Buffer.concat(errChunks).toString('utf-8');

          if (code === 0) {
            resolve(out);
          } else {
            // On failure, try to extract response from JSON stdout
            try {
              const parsed = JSON.parse(out);
              if (parsed.response) {
                reject(new Error(parsed.response));
                return;
              }
            } catch {
              // Not JSON — fall through
            }
            reject(new Error(stderr || out || `Process exited with code ${code}`));
          }
        });

        child.on('error', reject);

        child.stdin!.write(prompt);
        child.stdin!.end();
      });

      // Parse JSON output — OpenCode returns { response: "..." } with -f json
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.response) {
          return { success: true, diff: parsed.response };
        }
      } catch {
        // Not JSON — use raw output
      }

      return { success: true, diff: stdout };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}
