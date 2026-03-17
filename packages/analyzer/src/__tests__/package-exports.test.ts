import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const pkgDir = resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf-8'));

describe('package exports', () => {
  it('should have required npm metadata', () => {
    expect(pkg.name).toBe('mahoraga-analyzer');
    expect(pkg.license).toBe('MIT');
    expect(pkg.version).toBeDefined();
    expect(pkg.files).toContain('dist');
    expect(pkg.publishConfig?.access).toBe('public');
  });

  it('main export files should exist after build', () => {
    const mainExport = pkg.exports['.'];
    expect(existsSync(resolve(pkgDir, mainExport.import))).toBe(true);
    expect(existsSync(resolve(pkgDir, mainExport.types))).toBe(true);
  });

  it('workspace dependencies should use workspace protocol', () => {
    const internalDeps = Object.entries(pkg.dependencies as Record<string, string>)
      .filter(([name]) => name.startsWith('mahoraga-'));
    expect(internalDeps.length).toBeGreaterThan(0);
    for (const [name, version] of internalDeps) {
      expect(version, `${name} should use workspace:*`).toBe('workspace:*');
    }
  });

  it('LICENSE file should exist', () => {
    expect(existsSync(resolve(pkgDir, 'LICENSE'))).toBe(true);
  });

  it('README.md should exist', () => {
    expect(existsSync(resolve(pkgDir, 'README.md'))).toBe(true);
  });
});
