---
name: mahoraga-source-adapters
description: Write source adapters that pull events from analytics platforms into Mahoraga. Use when the user wants to integrate a new analytics source, implement the SourceAdapter interface, transform vendor events to MahoragaEvent format, or add support for a platform beyond Amplitude and PostHog.
---

# Mahoraga Source Adapters

## Overview

Source adapters pull vendor-specific events from analytics platforms and transform them into Mahoraga's normalized `MahoragaEvent` format. Adapters implement a standard interface, enabling the pipeline to pull from any analytics platform.

The adapter's job: fetch vendor events → transform to `MahoragaEvent` → validate with Zod → yield in batches.

## Core Pattern

```typescript
export interface SourceAdapter {
  readonly name: string;
  pull(config: AdapterConfig, timeRange: TimeRange, cursor?: Cursor): AsyncIterable<PullBatch>;
  validate(config: AdapterConfig): Promise<ValidationResult>;
}
```

## Implementation Recipe

### 1. Implement `validate(config)`

```typescript
async validate(config: AdapterConfig): Promise<ValidationResult> {
  const errors: string[] = [];
  if (!config.apiKey) errors.push('apiKey is required');
  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}
```

### 2. Implement `pull(config, timeRange, cursor?)`

Use an async generator to stream events in batches:

```typescript
async *pull(config: AdapterConfig, timeRange: TimeRange, cursor?: Cursor): AsyncIterable<PullBatch> {
  const response = await fetch(vendorUrl, { headers: { Authorization: `Bearer ${config.apiKey}` } });
  const data = await response.json();

  let batch: MahoragaEvent[] = [];
  for (const rawEvent of data.events) {
    const event = transformEvent(rawEvent);
    if (!event) continue;
    batch.push(event);

    if (batch.length >= BATCH_SIZE) {
      yield { events: batch, cursor: { value: lastCursor, updatedAt: Date.now() } };
      batch = [];
    }
  }
  if (batch.length > 0) {
    yield { events: batch, cursor: { value: lastCursor, updatedAt: Date.now() } };
  }
}
```

### 3. Write `transformEvent(vendorEvent)`

Map vendor fields to `MahoragaEvent`. Always validate with Zod:

```typescript
function transformEvent(raw: unknown): MahoragaEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const event = raw as Record<string, unknown>;
  const payload = mapPayload(String(event.event_type), event.properties);
  const id = createIdempotencyKey('vendor', eventType, sessionId, timestamp, distinctiveField);

  return MahoragaEventSchema.parse({
    id, schemaVersion: 1, sessionId, timestamp, type: payload.type,
    url: String(event.url || 'unknown'), payload,
    metadata: { source: 'vendor', rawEventType: String(event.event_type) },
  });
}
```

### 4. Generate Deterministic IDs

```typescript
import { createIdempotencyKey } from 'mahoraga-core';
const id = createIdempotencyKey('amplitude', rawEventType, sessionId, String(timestamp), selector);
```

Re-pulling the same time range deduplicates automatically via `INSERT OR IGNORE`.

## Key Patterns from AmplitudeAdapter

- **Authentication:** Basic auth (base64-encoded `apiKey:secretKey`)
- **Response format:** GZIP-compressed NDJSON
- **Type mapping:** Keyword-based — event name includes "click"/"error"/"navigate"
- **Batch size:** 1000 events
- **Cursor:** Last event timestamp

## Testing

Use MSW for contract tests with recorded HTTP fixtures in `__fixtures__/`. Test happy path and edge cases.

## Reference

See `@references/api-reference.md` for full type signatures.

## Common Mistakes

- **Not validating with Zod** — Invalid events logged and skipped, never silently dropped
- **Forgetting cursor** — Breaks resume capability
- **Loading all into memory** — Use async generators
- **Hardcoding distinctive field** — Use selector for clicks, message for errors
