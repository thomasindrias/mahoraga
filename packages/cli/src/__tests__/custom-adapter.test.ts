import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getAdapter } from '../commands/analyze.js';
import type { SourceConfig } from 'mahoraga-core';
import { AmplitudeAdapter, PostHogAdapter } from 'mahoraga-sources';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mahoraga-adapter-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('getAdapter', () => {
  describe('built-in adapters', () => {
    it('returns AmplitudeAdapter for amplitude adapter', async () => {
      const config: SourceConfig = { adapter: 'amplitude' };
      const adapter = await getAdapter(config, tempDir);

      expect(adapter).toBeInstanceOf(AmplitudeAdapter);
    });

    it('returns PostHogAdapter for posthog adapter', async () => {
      const config: SourceConfig = { adapter: 'posthog' };
      const adapter = await getAdapter(config, tempDir);

      expect(adapter).toBeInstanceOf(PostHogAdapter);
    });

    it('returns null for unknown adapter name', async () => {
      const config = { adapter: 'unknown-adapter' } as SourceConfig;
      const adapter = await getAdapter(config, tempDir);

      expect(adapter).toBeNull();
    });
  });

  describe('custom adapters', () => {
    it('returns null when custom adapter has no module field', async () => {
      const logs: string[] = [];
      const origWarn = console.warn;
      console.warn = (...args: unknown[]) => logs.push(args.join(' '));

      const config: SourceConfig = { adapter: 'custom' };
      const adapter = await getAdapter(config, tempDir);

      console.warn = origWarn;

      expect(adapter).toBeNull();
      expect(logs.some((l) => l.includes('Custom adapter requires a "module" field'))).toBe(true);
    });

    it('loads custom adapter from module with default export', async () => {
      const adapterPath = join(tempDir, 'custom-adapter.mjs');
      writeFileSync(
        adapterPath,
        `
export default class CustomAdapter {
  get name() { return 'custom'; }
  async *pull() {}
}
`,
      );

      const config: SourceConfig = {
        adapter: 'custom',
        module: './custom-adapter.mjs',
      };
      const adapter = await getAdapter(config, tempDir);

      expect(adapter).not.toBeNull();
      expect(adapter?.name).toBe('custom');
    });

    it('loads custom adapter from module with named adapter export', async () => {
      const adapterPath = join(tempDir, 'named-adapter.mjs');
      writeFileSync(
        adapterPath,
        `
export class adapter {
  get name() { return 'named'; }
  async *pull() {}
}
`,
      );

      const config: SourceConfig = {
        adapter: 'custom',
        module: './named-adapter.mjs',
      };
      const adapter = await getAdapter(config, tempDir);

      expect(adapter).not.toBeNull();
      expect(adapter?.name).toBe('named');
    });

    it('instantiates adapter class from module export', async () => {
      const adapterPath = join(tempDir, 'class-adapter.mjs');
      writeFileSync(
        adapterPath,
        `
export default class MyAdapter {
  constructor() {
    this.initialized = true;
  }
  get name() { return 'initialized'; }
  async *pull() {}
}
`,
      );

      const config: SourceConfig = {
        adapter: 'custom',
        module: './class-adapter.mjs',
      };
      const adapter = await getAdapter(config, tempDir);

      expect(adapter).not.toBeNull();
      expect((adapter as unknown as { initialized: boolean }).initialized).toBe(true);
    });

    it('returns adapter instance directly if already instantiated', async () => {
      const adapterPath = join(tempDir, 'instance-adapter.mjs');
      writeFileSync(
        adapterPath,
        `
class MyAdapter {
  get name() { return 'instance'; }
  async *pull() {}
}
export default new MyAdapter();
`,
      );

      const config: SourceConfig = {
        adapter: 'custom',
        module: './instance-adapter.mjs',
      };
      const adapter = await getAdapter(config, tempDir);

      expect(adapter).not.toBeNull();
      expect(adapter?.name).toBe('instance');
    });

    it('returns null when module does not export default or adapter', async () => {
      const logs: string[] = [];
      const origWarn = console.warn;
      console.warn = (...args: unknown[]) => logs.push(args.join(' '));

      const adapterPath = join(tempDir, 'no-export-adapter.mjs');
      writeFileSync(
        adapterPath,
        `
export class SomeOtherClass {
  get name() { return 'wrong'; }
}
`,
      );

      const config: SourceConfig = {
        adapter: 'custom',
        module: './no-export-adapter.mjs',
      };
      const adapter = await getAdapter(config, tempDir);

      console.warn = origWarn;

      expect(adapter).toBeNull();
      expect(logs.some((l) => l.includes('does not export default or adapter'))).toBe(true);
    });

    it('throws when module path is invalid', async () => {
      const config: SourceConfig = {
        adapter: 'custom',
        module: './non-existent-module.mjs',
      };

      await expect(getAdapter(config, tempDir)).rejects.toThrow();
    });

    it('resolves module path relative to cwd', async () => {
      const nestedDir = join(tempDir, 'adapters');
      mkdirSync(nestedDir, { recursive: true });

      const adapterPath = join(nestedDir, 'nested-adapter.mjs');
      writeFileSync(
        adapterPath,
        `
export default class NestedAdapter {
  get name() { return 'nested'; }
  async *pull() {}
}
`,
      );

      const config: SourceConfig = {
        adapter: 'custom',
        module: './adapters/nested-adapter.mjs',
      };
      const adapter = await getAdapter(config, tempDir);

      expect(adapter).not.toBeNull();
      expect(adapter?.name).toBe('nested');
    });
  });
});
