# mahoraga-analyzer

[![npm](https://img.shields.io/npm/v/mahoraga-analyzer.svg)](https://www.npmjs.com/package/mahoraga-analyzer)

Detection rules engine for UI issues, used by [Mahoraga](https://github.com/thomasindrias/mahoraga).

## Install

```bash
npm install mahoraga-analyzer
```

## Usage

```typescript
import { AnalysisEngine, RageClickRule, ErrorSpikeRule } from 'mahoraga-analyzer';
import { createDatabase, EventStore } from 'mahoraga-core';

const dbManager = createDatabase('.mahoraga/mahoraga.db');
const eventStore = new EventStore(dbManager.db);

const engine = new AnalysisEngine();
engine.registerRule(new RageClickRule());
engine.registerRule(new ErrorSpikeRule());

const now = Date.now();
const issues = await engine.analyze({
  eventStore,
  timeWindow: { start: now - 3 * 86400000, end: now },
  previousWindow: { start: now - 6 * 86400000, end: now - 3 * 86400000 },
});

console.log(issues);
// [{ ruleId: 'rage-clicks', title: 'Rage clicks detected on ".btn-submit"', severity: 'high', ... }]
```

## Built-in Rules

| Rule | Detects |
|------|---------|
| `RageClickRule` | 3+ clicks on the same element within 1 second |
| `ErrorSpikeRule` | Abnormal increase in JavaScript errors vs previous window |

## Writing a Custom Rule

Implement the `DetectionRule` interface:

```typescript
import type { DetectionRule, AnalysisContext } from 'mahoraga-analyzer';
import type { Issue } from 'mahoraga-core';

export class MyRule implements DetectionRule {
  readonly id = 'my-rule';
  readonly name = 'My Custom Rule';
  readonly description = 'Detects a custom pattern';
  readonly requiredEventTypes = ['click'] as const;

  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const events = context.eventStore.query({
      type: 'click',
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });
    // Detect patterns, return issues
    return [];
  }
}
```

## License

[MIT](https://github.com/thomasindrias/mahoraga/blob/main/LICENSE)
