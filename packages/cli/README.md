# mahoraga-cli

CLI entry point for Mahoraga - self-evolving frontend intelligence.

## Installation

```bash
# Global installation
npm install -g mahoraga-cli

# Or use directly with npx
npx mahoraga-cli
```

## Quick Start

```bash
# Initialize configuration
mahoraga init

# Run analysis (dry-run to preview issues)
mahoraga analyze --dry-run

# Run full analysis with agent dispatch
mahoraga analyze

# Inspect specific issue
mahoraga inspect <issue-id>

# Check pipeline status
mahoraga status

# Clean up old data
mahoraga gc

# Map selector to source file
mahoraga map "button.submit-form"
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize Mahoraga configuration and database |
| `analyze` | Run the full pipeline: pull events, detect issues, dispatch agents |
| `analyze --dry-run` | Preview detected issues without dispatching agents |
| `inspect <id>` | Show detailed information about a specific issue |
| `status` | Display pipeline status and statistics |
| `gc` | Clean up old events based on retention policy |
| `map <selector>` | Map a CSS selector to source file location |

## Configuration

Create `mahoraga.config.ts` in your project root:

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
    provider: 'claude-code',
    allowedPaths: ['src/**/*.tsx', 'src/**/*.ts'],
    deniedPaths: ['src/admin/**', '**/*.test.ts'],
    confidenceThreshold: 0.7,
  },
  storage: {
    retentionDays: 30,
  },
});
```

## Environment Variables

Credentials can be provided via environment variables:

- `MAHORAGA_AMPLITUDE_API_KEY`
- `MAHORAGA_AMPLITUDE_SECRET_KEY`
- `MAHORAGA_POSTHOG_API_KEY` (future)
- `MAHORAGA_SENTRY_DSN` (future)

## License

MIT

## Links

- [Main repository](https://github.com/thomasindrias/mahoraga)
- [Documentation](https://github.com/thomasindrias/mahoraga#readme)
