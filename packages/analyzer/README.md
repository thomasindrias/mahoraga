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

const db = createDatabase('.mahoraga/mahoraga.db');
const engine = new AnalysisEngine([
  new RageClickRule(db),
  new ErrorSpikeRule(db),
]);

const issues = await engine.analyze({
  windowStart: Date.now() - 3 * 86400000,
  windowEnd: Date.now(),
});

console.log(issues);
// [{ type: 'rage-click', selector: '.btn-submit', confidence: 0.92, severity: 'high', ... }]
```

## Built-in Rules

| Rule | Detects |
|------|---------|
| `RageClickRule` | Excessive clicks on the same element in a short timespan |
| `ErrorSpikeRule` | Abnormal increase in JavaScript errors |

## Writing a Custom Rule

Implement the `DetectionRule` interface:

```typescript
import type { DetectionRule } from 'mahoraga-analyzer';
import type { AnalysisContext } from 'mahoraga-analyzer';
import type { Issue } from 'mahoraga-core';

export class MyRule implements DetectionRule {
  name = 'my-rule';

  async analyze(context: AnalysisContext): Promise<Issue[]> {
    // Query events, detect patterns, return issues
    return [];
  }
}
```

## License

[MIT](https://github.com/thomasindrias/mahoraga/blob/main/LICENSE)
