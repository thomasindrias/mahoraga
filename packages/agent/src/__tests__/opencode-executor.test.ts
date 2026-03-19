import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter, Readable, Writable } from 'node:stream';

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import { OpenCodeExecutor } from '../opencode-executor.js';

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

  // Emit data + close asynchronously
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
    it('spawns opencode with correct args for non-interactive mode', async () => {
      const jsonOutput = JSON.stringify({ response: 'Fixed the bug by adding null check' });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput, 0));

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix the null error', '/tmp/work');

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['-p', '-', '-f', 'json', '-q']),
        expect.objectContaining({
          cwd: '/tmp/work',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });

    it('passes prompt via stdin', async () => {
      const writtenChunks: string[] = [];
      const proc = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      const stdin = new Writable({
        write(chunk, _enc, cb) {
          writtenChunks.push(chunk.toString());
          cb();
        },
      });

      (proc as unknown as Record<string, unknown>).stdout = stdout;
      (proc as unknown as Record<string, unknown>).stderr = stderr;
      (proc as unknown as Record<string, unknown>).stdin = stdin;

      setTimeout(() => {
        stdout.push(Buffer.from(JSON.stringify({ response: 'done' })));
        stdout.push(null);
        stderr.push(null);
        proc.emit('close', 0);
      }, 0);

      mockSpawn.mockReturnValue(proc);

      const executor = new OpenCodeExecutor();
      await executor.execute('Fix the bug in Cart.tsx', '/tmp/work');

      expect(writtenChunks.join('')).toBe('Fix the bug in Cart.tsx');
    });

    it('returns success with response text on exit code 0', async () => {
      const jsonOutput = JSON.stringify({
        response: 'Added null check for character.createdAt',
      });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix null error', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.diff).toBe('Added null check for character.createdAt');
    });

    it('returns success with plain text when JSON has no response field', async () => {
      const jsonOutput = JSON.stringify({ message: 'some other format' });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput, 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.diff).toBe(jsonOutput);
    });

    it('returns success with raw output when stdout is not valid JSON', async () => {
      mockSpawn.mockReturnValue(createMockProcess('Fix applied successfully', 0));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(true);
      expect(result.diff).toBe('Fix applied successfully');
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

    it('returns error text from JSON response field on non-zero exit', async () => {
      const errorJson = JSON.stringify({ response: 'Could not find the file' });
      mockSpawn.mockReturnValue(createMockProcess(errorJson, 1));

      const executor = new OpenCodeExecutor();
      const result = await executor.execute('Fix it', '/tmp/work');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Could not find the file');
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
  });
});
