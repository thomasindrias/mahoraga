---
name: mahoraga-custom-rules
description: Write custom detection rules for Mahoraga's analysis engine. Use when the user wants to create a new detection rule, detect a custom UI pattern (e.g., broken images, excessive scrolling), scaffold a rule with create-rule, or implement the DetectionRule interface.
---

# Mahoraga Custom Rules

Detection rules analyze normalized events from Mahoraga's data pipeline and produce Issues with severity, evidence, and suggested actions. Rules run during `mahoraga analyze` and generate GitHub PRs or issues based on detected patterns.

## Quick Start

Scaffold a new rule interactively:

```bash
npx mahoraga-cli create-rule
```

This generates a TypeScript file with the `DetectionRule` interface pre-implemented.

## Core Pattern

Every rule implements:

```typescript
export interface DetectionRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly requiredEventTypes: EventType[];
  analyze(context: AnalysisContext): Promise<Issue[]>;
}
```

The `analyze()` method receives an `AnalysisContext` with:
- `eventStore`: query events via `query({ type, start, end, sessionId, limit })`
- `timeWindow`: current analysis period (start/end timestamps)
- `previousWindow`: previous period for comparison (e.g., error spikes)
- `thresholds?`: per-rule threshold overrides from config (read via `context.thresholds?.['my-rule'] ?? DEFAULT`)
- `routePatterns?`: URL normalization patterns (e.g., `'/products/:id'`)

## Implementation Recipe

1. **Query events**: `context.eventStore.query({ type: 'click', start: context.timeWindow.start, end: context.timeWindow.end })`
2. **Group by key**: Map events by `sessionId + selector`, `url`, or `errorMessage`
3. **Apply thresholds**: Read from `context.thresholds?.['my-rule-id'] ?? DEFAULT_VALUE`, filter groups by count, frequency, or ratio
4. **Create issues**: Use `createFingerprint(ruleId, selector, url)` for deduplication, map severity based on session ratio, include evidence with `eventSummaries`

## Severity Mapping

Use ratio-based thresholds for consistency:

- **critical**: >= 25% of sessions/users affected
- **high**: >= 10%
- **medium**: >= 5%
- **low**: < 5%

## Testing & Registration

Test with in-memory SQLite and factories from `mahoraga-core/testing`:

```typescript
const events = createRageClickSequence('button.submit', 5, 500);
const session = createSession(events);
eventStore.insertBatch(session);

const issues = await rule.analyze({
  eventStore,
  timeWindow: { start: Date.now() - 60000, end: Date.now() },
  previousWindow: { start: Date.now() - 120000, end: Date.now() - 60000 }
});
```

Register in `mahoraga.config.ts`:

```typescript
import { defineConfig } from 'mahoraga-core';

export default defineConfig({
  sources: [/* ... */],
  analysis: {
    customRules: [new MyCustomRule()]
  }
});
```

## Common Mistakes

- **Missing fingerprint**: Without `createFingerprint()`, duplicate issues are created on every run
- **Empty requiredEventTypes**: Prevents efficient event filtering
- **Testing with single session**: Many patterns require 2+ sessions to trigger
- **Not grouping by session**: Session-level patterns (rage clicks, error loops) need per-session analysis first

## Reference

See `@references/api-reference.md` for full type signatures.

See `@references/existing-rules.md` for patterns from Mahoraga's 7 built-in rules.
