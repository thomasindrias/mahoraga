# API Reference: Source Adapters

## SourceAdapter Interface

```typescript
/**
 * Contract that all source adapters must implement.
 * Adapters transform vendor-specific event formats into MahoragaEvent.
 */
export interface SourceAdapter {
  /** Human-readable adapter name (used as checkpoint key) */
  readonly name: string;

  /**
   * Pull events from the source in batches.
   * @param config - Adapter-specific configuration (API keys, etc.)
   * @param timeRange - Time window to pull events from
   * @param cursor - Optional resume cursor from a previous run
   * @returns AsyncIterable of PullBatch
   */
  pull(
    config: AdapterConfig,
    timeRange: TimeRange,
    cursor?: Cursor,
  ): AsyncIterable<PullBatch>;

  /**
   * Validate that the adapter configuration is complete and correct.
   * @param config - Configuration to validate
   * @returns Validation result with any errors
   */
  validate(config: AdapterConfig): Promise<ValidationResult>;
}
```

## AdapterConfig

```typescript
/** Adapter-specific configuration passed to pull() and validate() */
export interface AdapterConfig {
  [key: string]: unknown;
}
```

Contains vendor-specific credentials (API keys, secret keys, project IDs, etc.).

## ValidationResult

```typescript
/** Result of validating an adapter configuration */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
```

## PullBatch

```typescript
/** A batch of events yielded by an adapter's pull() method */
export interface PullBatch {
  events: MahoragaEvent[];
  cursor: Cursor;
}
```

## PullResult

```typescript
/** Outcome of a full pull run */
export type PullResult =
  | { status: 'ok'; eventCount: number }
  | { status: 'partial'; eventCount: number; error: Error }
  | { status: 'failed'; error: Error };
```

Used by the CLI to report pull status after consuming the async iterable.

## MahoragaEvent Schema

```typescript
/**
 * Normalized event schema — the foundation of the entire pipeline.
 * All source adapters must transform their native format into this schema.
 * Validated by Zod at the ingestion boundary.
 */
export interface MahoragaEvent {
  /** Idempotency key — deterministic hash of (source, rawEventType, sessionId, timestamp, selector/message) */
  id: string;
  /** Schema version for forward compatibility */
  schemaVersion: 1;
  /** Ephemeral session identifier — anonymous, no user correlation */
  sessionId: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Normalized event type */
  type: EventType;
  /** Page URL where the event occurred */
  url: string;
  /** Type-specific payload */
  payload: EventPayload;
  /** Source provenance metadata */
  metadata: {
    /** Which adapter produced this event */
    source: string;
    /** Original event name in the source platform */
    rawEventType: string;
  };
}
```

## EventType

```typescript
export type EventType = 'click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom';
```

## EventPayload (Discriminated Union)

```typescript
export type EventPayload =
  | ClickPayload
  | ErrorPayload
  | NavigationPayload
  | PerformancePayload
  | FormPayload
  | CustomPayload;
```

### ClickPayload

```typescript
export interface ClickPayload {
  type: 'click';
  selector: string;
  text?: string;
  coordinates: { x: number; y: number };
  isRageClick: boolean;
}
```

### ErrorPayload

```typescript
export interface ErrorPayload {
  type: 'error';
  message: string;
  stack?: string;
  componentName?: string;
  frequency: number; // int, non-negative
}
```

### NavigationPayload

```typescript
export interface NavigationPayload {
  type: 'navigation';
  from: string;
  to: string;
  duration?: number; // non-negative
}
```

### PerformancePayload

```typescript
export interface PerformancePayload {
  type: 'performance';
  metric: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}
```

### FormPayload

```typescript
export interface FormPayload {
  type: 'form';
  formSelector: string;
  action: 'focus' | 'blur' | 'submit' | 'abandon';
  fieldSelector?: string;
  duration?: number; // non-negative
}
```

### CustomPayload

```typescript
export interface CustomPayload {
  type: 'custom';
  name: string;
  properties: Record<string, unknown>;
}
```

## TimeRange

```typescript
export interface TimeRange {
  start: number; // Unix ms
  end: number;   // Unix ms
}
```

## Cursor

```typescript
export interface Cursor {
  value: string;    // Opaque cursor value (often last timestamp or pagination token)
  updatedAt: number; // Unix ms
}
```

## Utility: createIdempotencyKey

```typescript
/**
 * Generate a deterministic SHA-256 hash for event deduplication.
 * @param parts - String components to hash (source, rawEventType, sessionId, timestamp, discriminative field)
 * @returns Hex-encoded SHA-256 hash
 */
export function createIdempotencyKey(...parts: string[]): string;
```

Example usage:

```typescript
import { createIdempotencyKey } from 'mahoraga-core';

const id = createIdempotencyKey(
  'amplitude',
  rawEventType,
  sessionId,
  String(timestamp),
  selector, // or message for errors, or eventType for other types
);
```

Re-pulling the same events produces the same IDs, enabling `INSERT OR IGNORE` deduplication in SQLite.
