import type { Issue } from '@mahoraga/core';
import type { DetectionRule, AnalysisContext } from './rule.js';

/**
 * Runs registered detection rules against an event store.
 * Errors in individual rules are caught and logged, not propagated.
 */
export class AnalysisEngine {
  private rules: DetectionRule[] = [];

  /**
   * Register a detection rule with the engine.
   * @param rule - The detection rule to register
   */
  registerRule(rule: DetectionRule): void {
    this.rules.push(rule);
  }

  /**
   * Run all registered rules against the given context.
   * @param context - Analysis context with event store and time windows
   * @returns All issues detected across all rules
   */
  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const allIssues: Issue[] = [];

    for (const rule of this.rules) {
      try {
        const issues = await rule.analyze(context);
        allIssues.push(...issues);
      } catch (error) {
        console.error(
          `Rule "${rule.id}" failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return allIssues;
  }
}
