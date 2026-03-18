import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createWorktree, cleanupWorktree } from '../dispatcher.js';

const describeIntegration = process.env.MAHORAGA_INTEGRATION_TESTS
  ? describe
  : describe.skip;

describeIntegration('Git worktree operations', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'mahoraga-wt-'));
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'initial'], { cwd: repoDir });
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('creates a worktree on a new branch', async () => {
    const wtPath = await createWorktree(repoDir, 'mahoraga/fix-test', 'main');

    expect(existsSync(wtPath)).toBe(true);

    const branch = execFileSync('git', ['branch', '--show-current'], {
      cwd: wtPath,
      encoding: 'utf-8',
    }).trim();
    expect(branch).toBe('mahoraga/fix-test');

    await cleanupWorktree(repoDir, wtPath);
  });

  it('worktree is isolated from main repo', async () => {
    const wtPath = await createWorktree(repoDir, 'mahoraga/isolated', 'main');

    writeFileSync(join(wtPath, 'test-file.txt'), 'hello');
    expect(existsSync(join(repoDir, 'test-file.txt'))).toBe(false);

    await cleanupWorktree(repoDir, wtPath);
    expect(existsSync(wtPath)).toBe(false);
  });
});
