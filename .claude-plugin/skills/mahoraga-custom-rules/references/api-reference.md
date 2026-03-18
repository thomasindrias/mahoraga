# API Reference for Custom Detection Rules

## Core Interfaces

### DetectionRule

```typescript
/**
 * A detection rule that analyzes events and produces issues.
 */
export interface DetectionRule {
  /** Unique identifier (kebab-case, e.g., 'rage-clicks') */
  readonly id: string;

  /** Human-readable name (e.g., 'Rage Clicks') */
  readonly name: string;

  /** Brief description of what the rule detects */
  readonly description: string;

  /** Event types required for this rule (enables filtering) */
  readonly requiredEventTypes: EventType[];

  /**
   * Analyze events and return detected issues.
   * @param context - Analysis context with event store and time windows
   * @returns Array of issues (empty if no patterns detected)
   */
  analyze(context: AnalysisContext): Promise<Issue[]>;
}
```

### AnalysisContext

```typescript
/**
 * Context provided to detection rules during analysis.
 */
export interface AnalysisContext {
  /** Event store for querying normalized events */
  eventStore: EventStore;

  /** Current time window being analyzed */
  timeWindow: TimeRange;

  /** Previous time window (for comparison-based rules) */
  previousWindow: TimeRange;
}

export interface TimeRange {
  /** Start timestamp (Unix milliseconds) */
  start: number;

  /** End timestamp (Unix milliseconds) */
  end: number;
}
```

## Event Store

### query()

```typescript
/**
 * Query events with optional filters.
 * @param options - Query filters
 * @returns Array of matching events (ordered by timestamp ASC)
 */
query(options: {
  /** Filter by event type */
  type?: EventType;

  /** Start timestamp (inclusive) */
  start?: number;

  /** End timestamp (inclusive) */
  end?: number;

  /** Filter by session ID */
  sessionId?: string;

  /** Maximum number of results */
  limit?: number;
}): MahoragaEvent[]
```

## Issue Schema

```typescript
export interface Issue {
  /** Unique ID (UUID v4) */
  id: string;

  /** Rule ID that generated this issue */
  ruleId: string;

  /** Deterministic hash for deduplication (use createFingerprint) */
  fingerprint: string;

  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Short title (e.g., "Rage clicks on button.submit") */
  title: string;

  /** Detailed explanation */
  description: string;

  /** Supporting evidence */
  evidence: Evidence[];

  /** Affected UI elements */
  affectedElements: Array<{
    selector: string;
    url: string;
    componentName?: string;
  }>;

  /** Optional fix suggestion */
  suggestedAction?: string;

  /** Event count or occurrence frequency */
  frequency: number;
}
```

## Evidence Schema

```typescript
export interface Evidence {
  /** Evidence category */
  type: 'event_cluster' | 'frequency_spike' | 'pattern_match' |
        'error_loop' | 'abandonment_rate' | 'poor_cls' | 'slow_transitions';

  /** Human-readable description */
  description: string;

  /** Sample events supporting this evidence */
  eventSummaries: EventSummary[];
}

export interface EventSummary {
  eventId: string;
  type: EventType;
  timestamp: number;
  url: string;
  summary: string;
}
```

## Event Types

```typescript
/**
 * Normalized event type taxonomy.
 */
export type EventType = 'click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom';
```

## Utilities

### createFingerprint()

```typescript
/**
 * Create deterministic SHA-256 hash for issue deduplication.
 * @param parts - String components (ruleId, selector, url, etc.)
 * @returns 64-character hex digest
 * @example createFingerprint('rage-clicks', 'button.submit', '/checkout')
 */
export function createFingerprint(...parts: string[]): string;
```

## Test Factories (mahoraga-core/testing)

### Event Factories

```typescript
/**
 * Create a base event with defaults.
 * @param overrides - Partial event properties to override
 */
export function createEvent(overrides?: Partial<MahoragaEvent>): MahoragaEvent;

/**
 * Wrap events in a shared session.
 * @param events - Partial events to group
 * @returns Events with identical sessionId
 */
export function createSession(events: Partial<MahoragaEvent>[]): MahoragaEvent[];

/**
 * Create a rage click sequence.
 * @param selector - Target element selector
 * @param count - Number of clicks
 * @param withinMs - Time span (default: 800ms)
 */
export function createRageClickSequence(
  selector: string,
  count: number,
  withinMs?: number
): MahoragaEvent[];

/**
 * Create an error event.
 * @param message - Error message
 * @param frequency - Number of sessions affected (default: 1)
 */
export function createErrorEvent(
  message: string,
  frequency?: number
): MahoragaEvent;

/**
 * Create a navigation event.
 * @param from - Source URL
 * @param to - Destination URL
 * @param duration - Navigation duration in ms (optional)
 */
export function createNavigationEvent(
  from: string,
  to: string,
  duration?: number
): MahoragaEvent;

/**
 * Create a form interaction event.
 * @param formSelector - Form element selector
 * @param action - 'focus' | 'blur' | 'submit' | 'abandon'
 */
export function createFormEvent(
  formSelector: string,
  action: 'focus' | 'blur' | 'submit' | 'abandon'
): MahoragaEvent;

/**
 * Create a performance metric event.
 * @param metric - Metric type (e.g., 'cls', 'lcp', 'fid')
 * @param value - Metric value
 * @param rating - 'good' | 'needs-improvement' | 'poor'
 */
export function createPerformanceEvent(
  metric: string,
  value: number,
  rating: 'good' | 'needs-improvement' | 'poor'
): MahoragaEvent;

/**
 * Reset global event ID counter (call in beforeEach).
 */
export function resetEventCounter(): void;
```
