import type { AgentExecutor, AgentExecutionResult, AgentExecuteOptions } from './executor.js';

/**
 * OpenCode CLI executor.
 * Shells out to the `opencode` CLI in non-interactive mode (`opencode run`).
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

    // OpenCode CLI: `opencode run "prompt" --format json`
    // --format json outputs NDJSON events (step_start, text, tool_call, step_finish)
    const args = ['run', prompt, '--format', 'json'];

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
            reject(new Error(stderr || out || `Process exited with code ${code}`));
          }
        });

        child.on('error', reject);

        // Close stdin immediately — prompt is passed as CLI arg
        child.stdin!.end();
      });

      // Parse NDJSON output — extract text parts from events
      const textParts: string[] = [];
      let totalCost = 0;

      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
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

      const response = textParts.join('');

      if (!response) {
        return { success: false, error: 'OpenCode produced no text response' };
      }

      return {
        success: true,
        diff: response,
        costUsd: totalCost > 0 ? totalCost : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}
