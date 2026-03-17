# mahoraga-sources

Pluggable source adapters for analytics platforms.

## Installation

```bash
npm install mahoraga-sources
```

## Features

- **SourceAdapter interface** for pluggable data sources
- **Async iterable batch pulling** for efficient data ingestion
- **V1 adapter**: Amplitude (user behavior analytics)
- **Contract tests** with MSW for reliable API mocking

## Usage

```typescript
import { AmplitudeAdapter } from 'mahoraga-sources';

const adapter = new AmplitudeAdapter({
  apiKey: process.env.AMPLITUDE_API_KEY,
  secretKey: process.env.AMPLITUDE_SECRET_KEY,
});

for await (const batch of adapter.pull({ startTime, endTime })) {
  // Process normalized events
  console.log(batch);
}
```

## Supported Sources

- **Amplitude** - User behavior analytics (V1)
- PostHog - Planned
- Sentry - Planned

## License

MIT

## Links

- [Main repository](https://github.com/thomasindrias/mahoraga)
- [Documentation](https://github.com/thomasindrias/mahoraga#readme)
