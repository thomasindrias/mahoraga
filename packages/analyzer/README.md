# mahoraga-analyzer

Detection rules engine for UI issues.

## Installation

```bash
npm install mahoraga-analyzer
```

## Features

- **DetectionRule interface** for pluggable issue detection
- **SQLite-powered queries** for efficient pattern analysis
- **V1 detection rules**:
  - Rage click detector (excessive clicks in short timespan)
  - Error spike detector (abnormal error rate increases)

## Usage

```typescript
import { RageClickDetector } from 'mahoraga-analyzer';

const detector = new RageClickDetector({
  clickThreshold: 5,
  timeWindowMs: 2000,
});

const issues = await detector.analyze(storage);
console.log(issues);
// [{ type: 'rage-click', selector: 'button.broken', confidence: 0.92, ... }]
```

## Detection Rules

Each rule implements the `DetectionRule` interface:

```typescript
interface DetectionRule {
  analyze(storage: MahoragaStorage): Promise<Issue[]>;
}
```

## License

MIT

## Links

- [Main repository](https://github.com/thomasindrias/mahoraga)
- [Documentation](https://github.com/thomasindrias/mahoraga#readme)
