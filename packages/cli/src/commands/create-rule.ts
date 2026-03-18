import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';

/**
 * Options for the create-rule command.
 */
export interface CreateRuleOptions {
  /** Human-readable rule name */
  name: string;
  /** Kebab-case rule ID */
  id: string;
  /** Rule description */
  description: string;
  /** Event types the rule consumes */
  eventTypes: string[];
}

/**
 * Generate a custom detection rule scaffold.
 * Creates a rule class file and a test file in the output directory.
 * @param outputDir - Directory to write generated files
 * @param options - Rule configuration options
 */
export async function runCreateRule(
  outputDir: string,
  options: CreateRuleOptions,
): Promise<void> {
  const { name, id, description, eventTypes } = options;
  const className = toClassName(name);
  const eventTypesStr = eventTypes.map((t) => `'${t}'`).join(', ');

  // Generate rule class file
  const ruleContent = `import type { Issue } from 'mahoraga-core';
import { createFingerprint } from 'mahoraga-core';
import type { DetectionRule, AnalysisContext } from 'mahoraga-analyzer';

/**
 * ${description}
 */
export class ${className}Rule implements DetectionRule {
  readonly id = '${id}';
  readonly name = '${name}';
  readonly description = '${description}';
  readonly requiredEventTypes: ('click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom')[] = [${eventTypesStr}];

  /**
   * Analyze events to detect issues.
   * @param context - Analysis context with event store and time windows
   * @returns Detected issues
   */
  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const events = context.eventStore.query({
      type: this.requiredEventTypes[0]!,
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });

    if (events.length === 0) return [];

    // TODO: Implement detection logic
    // 1. Group events by a meaningful key
    // 2. Apply thresholds
    // 3. Create issues with fingerprints for deduplication

    return [];
  }
}
`;

  // Generate test file
  const testContent = `import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, EventStore } from 'mahoraga-core';
import type { DatabaseManager } from 'mahoraga-core';
import { createEvent, resetEventCounter } from 'mahoraga-core/testing';
import { ${className}Rule } from './${id}.js';

let dbManager: DatabaseManager;
let eventStore: EventStore;

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

const timeWindow = { start: NOW - HOUR, end: NOW };
const previousWindow = { start: NOW - 2 * HOUR, end: NOW - HOUR };

beforeEach(() => {
  resetEventCounter();
  dbManager = createDatabase(':memory:');
  eventStore = new EventStore(dbManager.db);
});

describe('${className}Rule', () => {
  const rule = new ${className}Rule();

  it('should detect issues', async () => {
    // TODO: Add test events and verify detection
    const issues = await rule.analyze({ eventStore, timeWindow, previousWindow });
    expect(issues).toHaveLength(0); // Update after implementing detection logic
  });
});
`;

  writeFileSync(join(outputDir, `${id}.ts`), ruleContent);
  writeFileSync(join(outputDir, `${id}.test.ts`), testContent);
}

/**
 * Interactive create-rule command using `@clack/prompts`.
 * @param cwd - Working directory
 */
export async function interactiveCreateRule(cwd: string): Promise<void> {
  p.intro('Create a Custom Detection Rule');

  const name = await p.text({
    message: 'Rule name:',
    placeholder: 'e.g., Broken Image Detector',
  });
  if (p.isCancel(name)) {
    p.cancel('Cancelled.');
    return;
  }

  const id = await p.text({
    message: 'Rule ID (kebab-case):',
    initialValue: toKebabCase(name as string),
  });
  if (p.isCancel(id)) {
    p.cancel('Cancelled.');
    return;
  }

  const description = await p.text({
    message: 'Description:',
    placeholder: 'What does this rule detect?',
  });
  if (p.isCancel(description)) {
    p.cancel('Cancelled.');
    return;
  }

  const eventTypes = await p.multiselect({
    message: 'Event types to consume:',
    options: [
      { value: 'click', label: 'Click' },
      { value: 'error', label: 'Error' },
      { value: 'navigation', label: 'Navigation' },
      { value: 'performance', label: 'Performance' },
      { value: 'form', label: 'Form' },
      { value: 'custom', label: 'Custom' },
    ],
  });
  if (p.isCancel(eventTypes)) {
    p.cancel('Cancelled.');
    return;
  }

  const outputDir = join(cwd, 'src', 'rules');
  await runCreateRule(outputDir, {
    name: name as string,
    id: id as string,
    description: description as string,
    eventTypes: eventTypes as string[],
  });

  p.outro(`Rule scaffolded! Next steps:
  1. Export from src/index.ts: export * from './rules/${id}.js';
  2. Add '${id}' to your mahoraga.config.ts rules array
  3. Register in analyze.ts switch statement`);
}

/**
 * Convert a name to PascalCase class name.
 * @param name - Human-readable name
 * @returns PascalCase string
 */
function toClassName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert a string to kebab-case.
 * @param str - Input string
 * @returns Kebab-case string
 */
function toKebabCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}
