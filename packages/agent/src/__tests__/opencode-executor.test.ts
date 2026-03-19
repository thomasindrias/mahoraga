import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter, Readable, Writable } from 'node:stream';

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import { OpenCodeExecutor } from '../opencode-executor.js';

/** Build NDJSON output mimicking OpenCode's --format json output */
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

  describe('execute', () => {
    it('spawns opencode run with correct args', async () => {
      mockSpawn.mockReturnValue(createMockProcess(
        buildNdjson(['Fixed it']), 0,
      ));

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix the null error', '/tmp/work');

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['run', 'Fix the null error', '--format', 'json'],
        expect.objectContaining({
          cwd: '/tmp/work',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });

    it('closes stdin immediately (prompt is passed as CLI arg)', async () => {
      const writtenChunks: string[] = [];
      const proc = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      let stdinEnded = false;
      const stdin = new Writable({
        write(chunk, _enc, cb) {
          writtenChunks.push(chunk.toString());
          cb();
        },
        final(cb) {
          stdinEnded = true;
          cb();
        },
      });

      (proc as unknown as Record<string, unknown>).stdout = stdout;
      (proc as unknown as Record<string, unknown>).stderr = stderr;
      (proc as unknown as Record<string, unknown>).stdin = stdin;

      setTimeout(() => {
        stdout.push(Buffer.from(buildNdjson(['done'])));
        stdout.push(null);
        stderr.push(null);
        proc.emit('close', 0);
      }, 0);

      mockSpawn.mockReturnValue(proc);

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix it', '/tmp/work');

      expect(writtenChunks).toHaveLength(0);
      expect(stdinEnded).toBe(true);
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

    it('returns failure when no text events in output', async () => {
      const output = JSON.stringify({ type: 'step_start', part: {} }) + '\n' +
        JSON.stringify({ type: 'step_finish', part: { cost: 0 } }) + '\n';
      mockSpawn.mockReturnValue(createMockProcess(output, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(false);
      expect(result.error).toContain('no text response');
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

    it('returns failure when spawn emits error (e.g. opencode not installed)', async () => {
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

    it('prefers stderr over stdout for error messages on failure', async () => {
      mockSpawn.mockReturnValue(
        createMockProcess('some stdout', 1, 'fatal: something broke'),
      );

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(false);
      expect(result.error).toContain('fatal: something broke');
    });

    it('handles non-JSON lines in output gracefully', async () => {
      const output = 'some debug log\n' + buildNdjson(['Fixed the bug']);
      mockSpawn.mockReturnValue(createMockProcess(output, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.diff).toBe('Fixed the bug');
    });
  });
});
