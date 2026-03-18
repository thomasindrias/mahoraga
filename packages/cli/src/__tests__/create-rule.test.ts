import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCreateRule } from '../commands/create-rule.js';

describe('create-rule', () => {
  it('generates a valid TypeScript rule class file', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'rule-'));
    try {
      await runCreateRule(tmpDir, {
        name: 'Broken Image',
        id: 'broken-image',
        description: 'Detects broken images',
        eventTypes: ['click'],
      });
      const content = readFileSync(join(tmpDir, 'broken-image.ts'), 'utf-8');
      expect(content).toContain('implements DetectionRule');
      expect(content).toContain("id = 'broken-image'");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('generates a valid test file', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'rule-'));
    try {
      await runCreateRule(tmpDir, {
        name: 'Broken Image',
        id: 'broken-image',
        description: 'Detects broken images',
        eventTypes: ['click'],
      });
      const content = readFileSync(
        join(tmpDir, 'broken-image.test.ts'),
        'utf-8',
      );
      expect(content).toContain('describe');
      expect(content).toContain('BrokenImageRule');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('sanitizes rule ID by stripping invalid characters', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'rule-'));
    try {
      await runCreateRule(tmpDir, {
        name: 'My Rule!@#',
        id: 'my-rule',
        description: 'test',
        eventTypes: ['click'],
      });
      const content = readFileSync(join(tmpDir, 'my-rule.ts'), 'utf-8');
      expect(content).toContain("id = 'my-rule'");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
