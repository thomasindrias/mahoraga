# mahoraga-cli

[![npm](https://img.shields.io/npm/v/mahoraga-cli.svg)](https://www.npmjs.com/package/mahoraga-cli)

CLI for [Mahoraga](https://github.com/thomasindrias/mahoraga) — self-evolving frontend intelligence.

## Install

```bash
# npm
npm install -g mahoraga-cli

# pnpm
pnpm add -g mahoraga-cli

# Or run directly
npx mahoraga-cli --help
```

## Quick Start

```bash
# Generate mahoraga.config.ts interactively
mahoraga init

# Preview detected issues (no agents dispatched)
mahoraga analyze --dry-run

# Run full pipeline: pull → analyze → dispatch → PR
mahoraga analyze
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Generate configuration file and initialize database |
| `analyze` | Pull events, detect issues, dispatch agents |
| `analyze --dry-run` | Detect issues without dispatching agents |
| `inspect events\|issues` | Query stored events or detected issue groups |
| `status` | Show pipeline status and dispatch history |
| `gc` | Clean up events older than `retentionDays` |
| `map` | Rebuild code-to-event index |
| `dismiss <fingerprint>` | Suppress false-positive issues |
| `create-rule` | Scaffold a custom detection rule |

## Configuration

Create `mahoraga.config.ts` in your project root (or run `mahoraga init`):

```typescript
import { defineConfig } from 'mahoraga-core';

export default defineConfig({
  sources: [
    {
      adapter: 'amplitude',
      apiKey: process.env.MAHORAGA_AMPLITUDE_API_KEY!,
      secretKey: process.env.MAHORAGA_AMPLITUDE_SECRET_KEY!,
    },
  ],
  agent: {
    provider: 'opencode',
    allowedPaths: ['src/**/*.tsx', 'src/**/*.ts'],
    deniedPaths: ['src/admin/**', '**/*.test.ts'],
    confidenceThreshold: 0.7,
  },
  storage: {
    retentionDays: 30,
  },
});
```

## Credentials

Store in `.mahoraga.env` (automatically gitignored) or set as environment variables:

| Variable | Source |
|----------|--------|
| `MAHORAGA_AMPLITUDE_API_KEY` | Amplitude |
| `MAHORAGA_AMPLITUDE_SECRET_KEY` | Amplitude |
| `MAHORAGA_POSTHOG_API_KEY` | PostHog |
| `MAHORAGA_POSTHOG_PROJECT_ID` | PostHog |
| `MAHORAGA_SENTRY_DSN` | Sentry (planned) |

## License

[MIT](https://github.com/thomasindrias/mahoraga/blob/main/LICENSE)
