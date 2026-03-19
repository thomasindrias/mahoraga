import type { AgentExecutor, AgentExecutionResult, AgentExecuteOptions } from './executor.js';

/**
 * OpenCode CLI executor.
 * Shells out to the `opencode` CLI in non-interactive mode.
 * OpenCode is provider-agnostic — it supports OpenAI, Anthropic, Gemini,
 * Groq, OpenRouter, AWS Bedrock, and Azure via its own config (.opencode.json).
 *
 * Supports both v0.x (`-p "prompt" -f json -q`) and v1.x (`opencode run --format json "prompt"`).
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
    const { version, raw: versionRaw } = await this.detectVersion(workDir);
    // v1.x: flags MUST come before the variadic message argument
    const args = version === 'v1'
      ? ['run', '--format', 'json', prompt]
      : ['-p', prompt, '-f', 'json', '-q'];

    const diagnostics: string[] = [
      `version=${version}(${versionRaw})`,
      `args[0..2]=${args.slice(0, 3).join(' ')}`,
      `promptLen=${prompt.length}`,
      `cwd=${workDir}`,
    ];

    try {
      const { stdout, stderr, exitCode } = await new Promise<{
        stdout: string;
        stderr: string;
        exitCode: number | null;
      }>((resolve, reject) => {
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
          resolve({
            stdout: Buffer.concat(chunks).toString('utf-8'),
            stderr: Buffer.concat(errChunks).toString('utf-8'),
            exitCode: code,
          });
        });

        child.on('error', reject);

        // Close stdin immediately — prompt is passed as CLI arg
        child.stdin!.end();
      });

      diagnostics.push(`exit=${exitCode}`, `stdoutLen=${stdout.length}`, `stderrLen=${stderr.length}`);

      if (exitCode !== 0) {
        const errorDetail = stderr || stdout || `exit code ${exitCode}`;
        return {
          success: false,
          error: `[${diagnostics.join(', ')}] ${errorDetail.slice(0, 1000)}`,
        };
      }

      return this.parseOutput(stdout, diagnostics);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `[${diagnostics.join(', ')}] spawn error: ${message}`,
      };
    }
  }

  /**
   * Detect OpenCode version to determine correct CLI flags.
   * v1.x has `opencode run` subcommand, v0.x uses `-p` flag.
   */
  private async detectVersion(cwd: string): Promise<{ version: 'v0' | 'v1'; raw: string }> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    try {
      const { stdout } = await exec('opencode', ['--version'], { cwd, timeout: 5_000 });
      const raw = stdout.trim();
      const major = parseInt(raw.split('.')[0] ?? '0', 10);
      return { version: major >= 1 ? 'v1' : 'v0', raw };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { version: 'v0', raw: `detect-failed:${msg.slice(0, 100)}` };
    }
  }

  /**
   * Parse OpenCode output, supporting both v0.x single JSON and v1.x NDJSON.
   */
  private parseOutput(stdout: string, diagnostics: string[]): AgentExecutionResult {
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

    return {
      success: false,
      error: `[${diagnostics.join(', ')}] OpenCode produced no text response. Raw output: ${stdout.slice(0, 500)}`,
    };
  }
}
