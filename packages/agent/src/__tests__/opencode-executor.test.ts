import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter, Readable, Writable } from 'node:stream';

// Mock child_process
const mockSpawn = vi.fn();
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFile: (...args: unknown[]) => mockExecFile(...args),
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

/** Mock execFile to simulate version detection */
function mockVersionDetection(version: string) {
  mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string }) => void) => {
    if (cb) {
      cb(null, { stdout: version });
      return;
    }
    // promisify compatibility
    return { stdout: version };
  });
}

describe('OpenCodeExecutor', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExecFile.mockReset();
    // Default: simulate v0.x detection
    mockVersionDetection('0.0.55');
  });

  describe('constructor', () => {
    it('sets provider to "opencode"', () => {
      const executor = new OpenCodeExecutor();
      expect(executor.provider).toBe('opencode');
    });
  });

  describe('execute with v0.x', () => {
    it('spawns opencode with -p flag for v0.x', async () => {
      const jsonOutput = JSON.stringify({ response: 'Fixed the bug' });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput, 0));

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix the null error', '/tmp/work');

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['-p', 'Fix the null error', '-f', 'json', '-q'],
        expect.objectContaining({
          cwd: '/tmp/work',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });

    it('parses v0.x single JSON response', async () => {
      const jsonOutput = JSON.stringify({ response: 'Added null check' });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.diff).toBe('Added null check');
    });
  });

  describe('execute with v1.x', () => {
    beforeEach(() => {
      mockVersionDetection('1.2.10');
    });

    it('spawns opencode run with --format json for v1.x', async () => {
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
    it('returns failure when no text in output', async () => {
      mockSpawn.mockReturnValue(createMockProcess('', 0));

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
    });

    it('uses custom timeout from options', async () => {
      const jsonOutput = JSON.stringify({ response: 'done' });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput, 0));

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix it', '/tmp/work', { timeoutMs: 60_000 });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.any(Array),
        expect.objectContaining({ timeout: 60_000 }),
      );
    });

    it('uses default 5-minute timeout when not specified', async () => {
      const jsonOutput = JSON.stringify({ response: 'done' });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput, 0));

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
      mockVersionDetection('1.2.10');
      const output = 'some debug log\n' + buildNdjson(['Fixed the bug']);
      mockSpawn.mockReturnValue(createMockProcess(output, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.diff).toBe('Fixed the bug');
    });

    it('defaults to v0 flags when version detection fails', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) {
          cb(new Error('ENOENT'));
          return;
        }
        throw new Error('ENOENT');
      });

      const jsonOutput = JSON.stringify({ response: 'done' });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput, 0));

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix it', '/tmp/work');

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['-p', 'Fix it', '-f', 'json', '-q'],
        expect.any(Object),
      );
    });
  });
});
