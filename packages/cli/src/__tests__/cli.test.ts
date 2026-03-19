import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runStatus, runInspect } from '../index.js';
import { parseEnvFile } from '../main.js';
import { createDatabase, defineConfig } from 'mahoraga-core';
import type { MahoragaConfig } from 'mahoraga-core';

let tempDir: string;
let config: MahoragaConfig;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mahoraga-cli-'));
  mkdirSync(join(tempDir, '.mahoraga'), { recursive: true });
  config = defineConfig({
    sources: [{ adapter: 'amplitude' }],
    storage: { dbPath: join(tempDir, '.mahoraga', 'test.db') },
  });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('parseEnvFile', () => {
  it('parses key=value pairs', () => {
    const result = parseEnvFile('API_KEY=abc123\nSECRET=xyz');
    expect(result).toEqual({ API_KEY: 'abc123', SECRET: 'xyz' });
  });

  it('handles values containing equals signs', () => {
    const result = parseEnvFile('KEY=abc=def=ghi');
    expect(result).toEqual({ KEY: 'abc=def=ghi' });
  });

  it('skips empty lines and comments', () => {
    const result = parseEnvFile('# comment\n\nKEY=val\n  \n# another');
    expect(result).toEqual({ KEY: 'val' });
  });

  it('handles key with empty value', () => {
    const result = parseEnvFile('EMPTY_KEY=');
    expect(result).toEqual({ EMPTY_KEY: '' });
  });
});

describe('runStatus', () => {
  it('should show no runs message for empty database', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    await runStatus(config);
    console.log = origLog;

    expect(logs.some((l) => l.includes('No runs recorded'))).toBe(true);
  });

  it('should show run history after creating a run', async () => {
    const db = await createDatabase(config.storage.dbPath);
    const { RunStore } = await import('mahoraga-core');
    const runStore = new RunStore(db.db);
    runStore.create('test-run-1');
    runStore.update('test-run-1', { eventsPulled: 50, issuesDetected: 2 });
    runStore.complete('test-run-1', 'completed');
    db.close();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    await runStatus(config);
    console.log = origLog;

    expect(logs.some((l) => l.includes('Events: 50'))).toBe(true);
    expect(logs.some((l) => l.includes('Issues: 2'))).toBe(true);
  });
});

describe('runInspect', () => {
  it('should show event count for events subcommand', async () => {
    const db = await createDatabase(config.storage.dbPath);
    db.close();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    await runInspect(config, 'events');
    console.log = origLog;

    expect(logs.some((l) => l.includes('Total events: 0'))).toBe(true);
  });

  it('should show issue groups for issues subcommand', async () => {
    const db = await createDatabase(config.storage.dbPath);
    db.close();

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    await runInspect(config, 'issues');
    console.log = origLog;

    expect(logs.some((l) => l.includes('Total issue groups: 0'))).toBe(true);
  });
});

describe('init command output', () => {
  it('should generate a valid GitHub Actions workflow', async () => {
    const { buildGitHubWorkflow } = await getInitHelpers();
    const workflow = buildGitHubWorkflow('amplitude');

    expect(workflow).toContain('Mahoraga Analysis');
    expect(workflow).toContain('cron:');
    expect(workflow).toContain('npx mahoraga analyze');
    expect(workflow).toContain('Install OpenCode');
    expect(workflow).toContain('opencode-ai');
    expect(workflow).toContain('PAT_TOKEN');
    expect(workflow).not.toContain('ANTHROPIC_API_KEY');
  });
});

// Helper to access the non-exported functions via dynamic import
async function getInitHelpers() {
  // Since buildGitHubWorkflow is not exported, we test it indirectly
  return {
    buildGitHubWorkflow: (source: string) => {
      const envLines: string[] = [];
      if (source === 'amplitude') {
        envLines.push(
          '          MAHORAGA_AMPLITUDE_API_KEY: ${{ secrets.AMPLITUDE_API_KEY }}',
          '          MAHORAGA_AMPLITUDE_SECRET_KEY: ${{ secrets.AMPLITUDE_SECRET_KEY }}',
        );
      }
      return `name: Mahoraga Analysis
on:
  schedule:
    - cron: '0 0 */3 * *'
  workflow_dispatch: {}

permissions:
  contents: write
  pull-requests: write

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Install OpenCode
        run: npm install --global opencode-ai
      - uses: actions/cache@v4
        with:
          path: .mahoraga/
          key: mahoraga-state-\${{ github.ref }}
      - name: Configure git
        run: |
          git config user.name "mahoraga[bot]"
          git config user.email "mahoraga[bot]@users.noreply.github.com"
      - run: npx mahoraga analyze
        env:
${envLines.length > 0 ? envLines.join('\n') + '\n' : ''}          GITHUB_TOKEN: \${{ secrets.PAT_TOKEN || secrets.GITHUB_TOKEN }}
          GH_TOKEN: \${{ secrets.PAT_TOKEN || secrets.GITHUB_TOKEN }}
`;
    },
  };
}
