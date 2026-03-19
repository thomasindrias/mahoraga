import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter, Readable, Writable } from 'node:stream';

// Mock child_process
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import { OpenCodeExecutor } from '../opencode-executor.js';

/** Build NDJSON output mimicking OpenCode v1.x --format json output */
function buildNdjson(textParts: string[], cost = 0): string {
  const lines: string[] = [];
  lines.push(JSON.stringify({
    type: 'step_start',
    sessionID: 'ses_test',
    part: { type: 'step-start' },
  }));
  for (const text of textParts) {
    lines.push(JSON.stringify({
      type: 'text',
      sessionID: 'ses_test',
      part: { type: 'text', text },
    }));
  }
  lines.push(JSON.stringify({
    type: 'step_finish',
    sessionID: 'ses_test',
    part: { type: 'step-finish', reason: 'stop', cost },
  }));
  return lines.join('\n') + '\n';
}

/** Build NDJSON error event */
function buildNdjsonWithError(errorMsg: string): string {
  return JSON.stringify({
    type: 'error',
    sessionID: 'ses_test',
    part: { type: 'error', error: errorMsg },
  }) + '\n';
}

function createMockProcess(
  stdoutData: string,
  exitCode: number,
  stderrData = '',
): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });

  (proc as unknown as Record<string, unknown>).stdout = stdout;
  (proc as unknown as Record<string, unknown>).stderr = stderr;
  (proc as unknown as Record<string, unknown>).stdin = stdin;

  setTimeout(() => {
    if (stdoutData) stdout.push(Buffer.from(stdoutData));
    stdout.push(null);
    if (stderrData) stderr.push(Buffer.from(stderrData));
    stderr.push(null);
    proc.emit('close', exitCode);
  }, 0);

  return proc;
}

describe('OpenCodeExecutor', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  describe('constructor', () => {
    it('sets provider to "opencode"', () => {
      const executor = new OpenCodeExecutor();
      expect(executor.provider).toBe('opencode');
    });
  });

  describe('execute with v1.x', () => {
    it('spawns opencode run with --format json before prompt', async () => {
      mockSpawn.mockReturnValue(createMockProcess(
        buildNdjson(['Fixed it']), 0,
      ));

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix the null error', '/tmp/work');

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['run', '--format', 'json', 'Fix the null error'],
        expect.objectContaining({
          cwd: '/tmp/work',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });

    it('extracts text from NDJSON events', async () => {
      const output = buildNdjson(['Added null check', ' for character.createdAt']);
      mockSpawn.mockReturnValue(createMockProcess(output, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix null error', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.diff).toBe('Added null check for character.createdAt');
    });

    it('extracts cost from step_finish events', async () => {
      const output = buildNdjson(['Fixed'], 0.05);
      mockSpawn.mockReturnValue(createMockProcess(output, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.costUsd).toBe(0.05);
    });

    it('returns no costUsd when cost is 0', async () => {
      const output = buildNdjson(['Fixed'], 0);
      mockSpawn.mockReturnValue(createMockProcess(output, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.costUsd).toBeUndefined();
    });
  });

  describe('common behavior', () => {
    it('returns failure when no output is produced', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(false);
      expect(result.error).toContain('no output');
    });

    it('returns failure on non-zero exit code', async () => {
      mockSpawn.mockReturnValue(
        createMockProcess('', 1, 'Error: opencode crashed'),
      );

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(false);
      expect(result.error).toContain('opencode crashed');
    });

    it('returns failure when spawn emits ENOENT error', async () => {
      const proc = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      const stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });

      (proc as unknown as Record<string, unknown>).stdout = stdout;
      (proc as unknown as Record<string, unknown>).stderr = stderr;
      (proc as unknown as Record<string, unknown>).stdin = stdin;

      setTimeout(() => {
        proc.emit('error', new Error('spawn opencode ENOENT'));
      }, 0);

      mockSpawn.mockReturnValue(proc);

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
      expect(result.error).toContain('spawn error');
    });

    it('uses custom timeout from options', async () => {
      mockSpawn.mockReturnValue(createMockProcess(buildNdjson(['done']), 0));

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix it', '/tmp/work', { timeoutMs: 60_000 });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.any(Array),
        expect.objectContaining({ timeout: 60_000 }),
      );
    });

    it('uses default 5-minute timeout when not specified', async () => {
      mockSpawn.mockReturnValue(createMockProcess(buildNdjson(['done']), 0));

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix it', '/tmp/work');

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.any(Array),
        expect.objectContaining({ timeout: 300_000 }),
      );
    });

    it('returns raw non-JSON output as diff', async () => {
      mockSpawn.mockReturnValue(createMockProcess('Fix applied successfully', 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.diff).toBe('Fix applied successfully');
    });

    it('handles non-JSON lines in NDJSON output gracefully', async () => {
      const output = 'some debug log\n' + buildNdjson(['Fixed the bug']);
      mockSpawn.mockReturnValue(createMockProcess(output, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.diff).toBe('Fixed the bug');
    });
  });

  describe('NDJSON error events', () => {
    it('returns failure when NDJSON contains error event', async () => {
      const ndjson = buildNdjsonWithError('API rate limit exceeded');
      mockSpawn.mockReturnValue(createMockProcess(ndjson, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit exceeded');
    });

    it('returns failure with error even if text events exist', async () => {
      const ndjson = buildNdjson(['Starting...']) + buildNdjsonWithError('Provider returned 403');
      mockSpawn.mockReturnValue(createMockProcess(ndjson, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Provider returned 403');
    });

    it('handles error event with text field instead of error field', async () => {
      const ndjson = JSON.stringify({
        type: 'error',
        sessionID: 'ses_test',
        part: { type: 'error', text: 'Something went wrong' },
      }) + '\n';
      mockSpawn.mockReturnValue(createMockProcess(ndjson, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Something went wrong');
    });
  });
});
