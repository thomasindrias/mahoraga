import type { AgentExecutor, AgentExecutionResult, AgentExecuteOptions } from './executor.js';

/**
 * OpenCode CLI executor.
 * Shells out to the `opencode` CLI in non-interactive mode.
 * OpenCode is provider-agnostic — it supports OpenAI, Anthropic, Gemini,
 * Groq, OpenRouter, AWS Bedrock, and Azure via its own config (.opencode.json).
 *
 * Supports both v0.x (`-p "prompt" -f json -q`) and v1.x (`opencode run "prompt" --format json`).
 * Version is auto-detected at runtime.
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

    // Detect version to determine correct flags
    const version = await this.detectVersion(workDir);
    const args = version === 'v1'
      ? ['run', prompt, '--format', 'json']
      : ['-p', prompt, '-f', 'json', '-q'];

    console.log(`[OpenCode] version=${version}, args[0..2]=${args.slice(0, 3).join(' ')}, prompt length=${prompt.length}, cwd=${workDir}`);

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

          console.log(`[OpenCode] exit code=${code}, stdout length=${out.length}, stderr length=${stderr.length}`);
          if (stderr) console.warn(`[OpenCode] stderr: ${stderr.slice(0, 500)}`);
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

      return this.parseOutput(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Detect OpenCode version to determine correct CLI flags.
   * v1.x has `opencode run` subcommand, v0.x uses `-p` flag.
   */
  private async detectVersion(cwd: string): Promise<'v0' | 'v1'> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    try {
      const { stdout } = await exec('opencode', ['--version'], { cwd, timeout: 5_000 });
      const ver = stdout.trim();
      // v1.x versions are >= 1.0.0
      const major = parseInt(ver.split('.')[0] ?? '0', 10);
      return major >= 1 ? 'v1' : 'v0';
    } catch {
      return 'v0'; // Default to v0 flags if detection fails
    }
  }

  /**
   * Parse OpenCode output, supporting both v0.x single JSON and v1.x NDJSON.
   */
  private parseOutput(stdout: string): AgentExecutionResult {
    // Try v0.x format first: single JSON object with { response: "..." }
    try {
      const parsed = JSON.parse(stdout.trim());
      if (parsed.response) {
        return { success: true, diff: parsed.response };
      }
    } catch {
      // Not single JSON — try NDJSON
    }

    // Try v1.x NDJSON format: multiple JSON lines with type=text events
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

    if (textParts.length > 0) {
      return {
        success: true,
        diff: textParts.join(''),
        costUsd: totalCost > 0 ? totalCost : undefined,
      };
    }

    // If we got here with non-empty output, return it as-is
    if (stdout.trim()) {
      return { success: true, diff: stdout.trim() };
    }

    return { success: false, error: 'OpenCode produced no text response' };
  }
}
