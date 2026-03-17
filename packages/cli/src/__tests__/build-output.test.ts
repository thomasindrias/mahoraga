import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(import.meta.dirname, '../../dist');

describe('CLI build output', () => {
  it('main.js should have shebang as first line', () => {
    const content = readFileSync(resolve(distDir, 'main.js'), 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('index.js should NOT have shebang', () => {
    const content = readFileSync(resolve(distDir, 'index.js'), 'utf-8');
    expect(content.startsWith('#!')).toBe(false);
  });
});
