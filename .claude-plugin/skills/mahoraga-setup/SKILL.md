---
name: mahoraga-setup
description: Set up and configure Mahoraga in a frontend project. Use when the user asks to initialize Mahoraga, configure analytics sources (Amplitude, PostHog), set up automated UI issue detection, or run their first analysis. Also use when troubleshooting Mahoraga configuration or credentials.
---

# Mahoraga Setup

## Overview

Mahoraga is NOT a tracker — it's the brain that sits on top of existing analytics platforms. It ingests user behavior data from Amplitude or PostHog, detects UI issues through automated analysis, and dispatches AI agents to fix them via pull requests. Pipeline: Sources → Normalize → Analyze → Map → Dispatch → PR.

## Prerequisites

- Node.js >=20
- Analytics credentials (Amplitude API key/secret key OR PostHog project API key)
- `gh` CLI installed and authenticated (for creating PRs)
- `opencode-ai` CLI installed (`npm install --global opencode-ai`)
- `.opencode.json` with AI provider configuration

## Quick Start

Run the interactive setup wizard:

```bash
npx mahoraga-cli init
```

This generates `mahoraga.config.ts`, `.mahoraga.env`, and updates `.gitignore`.

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
  analysis: {
    windowDays: 3,
    rules: ['rage-clicks', 'error-spikes', 'dead-clicks', 'form-abandonment', 'slow-navigation', 'layout-shifts', 'error-loops'],
  },
  agent: {
    provider: 'opencode',
    baseBranch: 'main',
    draftPR: true,
    maxCostPerIssue: 2,
    maxCostPerRun: 20,
    confidenceThreshold: 0.7,
    allowedPaths: ['src/**'],
    deniedPaths: ['src/generated/**'],
  },
  storage: {
    dbPath: '.mahoraga/mahoraga.db',
    retentionDays: 30,
  },
});
```

## Credentials

Credentials are resolved in priority order:

1. Environment variables
2. `.mahoraga.env` file (gitignored)
3. Config file via `process.env`

**Convention:** `MAHORAGA_AMPLITUDE_API_KEY`, `MAHORAGA_AMPLITUDE_SECRET_KEY`, `MAHORAGA_POSTHOG_API_KEY`.

Never commit credentials to version control. The `.mahoraga.env` file is automatically gitignored.

## First Run

Preview issues without dispatching agents:

```bash
npx mahoraga-cli analyze --dry-run
```

Then run the full pipeline:

```bash
npx mahoraga-cli analyze
```

## CLI Commands

| Command | Purpose |
|---------|---------|
| `init` | Interactive setup wizard |
| `analyze` | Full pipeline (pull + detect + dispatch) |
| `analyze --dry-run` | Preview issues without dispatching |
| `inspect events\|issues` | Query local SQLite data |
| `status` | Pipeline run history |
| `gc` | Manual data cleanup |
| `map <selector>` | CSS selector to source mapping |
| `dismiss <issue-id>` | Suppress false positives |
| `create-rule` | Scaffold custom detection rule |

## Cross-References

- For custom rules, use **mahoraga-custom-rules**
- For agent tuning, use **mahoraga-agent-config**

## Common Mistakes

- Forgetting to add credentials to `.mahoraga.env`
- Not having `gh` CLI installed or authenticated
- Running full `analyze` without testing `--dry-run` first
- Missing `.opencode.json` provider configuration
