# mahoraga-sources

[![npm](https://img.shields.io/npm/v/mahoraga-sources.svg)](https://www.npmjs.com/package/mahoraga-sources)

Pluggable source adapters for analytics platforms, used by [Mahoraga](https://github.com/thomasindrias/mahoraga).

## Install

```bash
npm install mahoraga-sources
```

## Usage

```typescript
import { AmplitudeAdapter, PipelineRunner } from 'mahoraga-sources';
import { createDatabase, EventStore, CheckpointStore } from 'mahoraga-core';

const db = createDatabase('.mahoraga/mahoraga.db');
const runner = new PipelineRunner(new EventStore(db), new CheckpointStore(db));

const adapter = new AmplitudeAdapter();
const result = await runner.run(adapter, {
  apiKey: process.env.MAHORAGA_AMPLITUDE_API_KEY!,
  secretKey: process.env.MAHORAGA_AMPLITUDE_SECRET_KEY!,
}, { start: Date.now() - 86400000, end: Date.now() });

console.log(result);
// { status: 'ok', eventCount: 1234 }
```

## Supported Sources

| Source | Status | Adapter |
|--------|--------|---------|
| Amplitude | Available | `AmplitudeAdapter` |
| PostHog | Planned | — |
| Sentry | Planned | — |

## Writing a Custom Adapter

Implement the `SourceAdapter` interface:

```typescript
import type { SourceAdapter, AdapterConfig, EventBatch } from 'mahoraga-sources';

export class MyAdapter implements SourceAdapter {
  name = 'my-source';

  async *pull(config: AdapterConfig, timeRange: TimeRange, cursor?: string) {
    // Yield batches of normalized events
    yield { events: [...], cursor: 'next-page-token' };
  }
}
```

## License

[MIT](https://github.com/thomasindrias/mahoraga/blob/main/LICENSE)
