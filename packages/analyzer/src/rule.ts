import type { EventType, Issue, TimeRange } from '@mahoraga/core';
import type { EventStore } from '@mahoraga/core';

/**
 * Context passed to each detection rule during analysis.
 */
export interface AnalysisContext {
  /** Event store for querying normalized events */
  eventStore: EventStore;
  /** Current analysis time window */
  timeWindow: TimeRange;
  /** Previous time window for comparison (e.g., spike detection) */
  previousWindow: TimeRange;
}

/**
 * A pluggable detection rule that analyzes events and produces issues.
 */
export interface DetectionRule {
  /** Unique identifier for this rule */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Description of what this rule detects */
  readonly description: string;
  /** Event types this rule needs to operate */
  readonly requiredEventTypes: EventType[];
  /**
   * Analyze events in the given context and return detected issues.
   * @param context - Analysis context with event store and time windows
   * @returns Detected issues
   */
  analyze(context: AnalysisContext): Promise<Issue[]>;
}
