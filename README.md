<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
  <img alt="Mahoraga" src="docs/assets/logo-light.svg" width="120" height="120">
</picture>

# Mahoraga

**Self-evolving frontend intelligence.**

Ingests user behavior data from your existing analytics stack, detects UI issues through automated analysis, and dispatches AI agents to fix them — creating pull requests automatically.

[![License: MIT](https://img.shields.io/badge/License-MIT-D4A336.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-333.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-333.svg)](https://www.typescriptlang.org)

</div>

---

Mahoraga is **not** a tracker. It is the brain that sits on top of your existing analytics data and turns behavioral signals into code improvements. Named after the [Jujutsu Kaisen character](https://jujutsu-kaisen.fandom.com/wiki/Mahoraga) that adapts after every encounter.

## How It Works

```
Sources (Amplitude, PostHog, Sentry)
    | pull via API adapters
Normalize (common event schema, Zod-validated)
    | persist to SQLite
Analyze (pluggable detection rules)
    | produce Issue reports
Map (AST-based selector-to-source-file resolution)
    | resolve CSS selectors to source locations
Dispatch (Claude Code CLI agent)
    | create PR with plan + fix
Human Review -> Merge
```

## Features

- **Source adapters** — Pull behavioral data from Amplitude, PostHog, Sentry (V1: Amplitude)
- **Detection rules** — Pluggable analysis engine (V1: rage clicks, error spikes)
- **Code mapper** — AST-based resolution from CSS selectors to exact source file locations
- **Agent dispatcher** — Generates fixes, writes tests, validates via build/test/diff, and opens draft PRs
- **Adaptation loop** — If a generated test fails, the agent retries with error context (up to 3 attempts)
- **Blast radius control** — Allowed/denied paths, confidence thresholds, cost budgets, diff size limits
- **Agent isolation** — Operates in fresh git worktrees; `main` is never directly modified

## Quick Start

### Prerequisites

- Node.js >= 20
- [pnpm](https://pnpm.io) >= 9
- An [Amplitude](https://amplitude.com) account (V1 source)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (for agent dispatch)
- [GitHub CLI](https://cli.github.com) (`gh`) for PR creation

### Installation

```bash
git clone https://github.com/thomasindrias/mahoraga.git
cd mahoraga
pnpm install
pnpm turbo build
```

### Configuration

Create a `mahoraga.config.ts` in your target project:

```typescript
import { defineConfig } from "@mahoraga/cli";

export default defineConfig({
  sources: {
    amplitude: {
      apiKey: process.env.AMPLITUDE_API_KEY!,
      secretKey: process.env.AMPLITUDE_SECRET_KEY!,
    },
  },
  analysis: {
    rules: ["rage-click", "error-spike"],
    confidenceThreshold: 0.7,
  },
  agent: {
    model: "claude",
    maxRetries: 3,
    maxDiffLines: 500,
    allowedPaths: ["src/**"],
    deniedPaths: ["src/generated/**"],
  },
  governance: {
    costPerIssue: 2,
    costPerRun: 20,
    maxDispatchesPerRun: 5,
    cooldownDays: 7,
  },
  storage: {
    retentionDays: 30,
  },
});
```

Store credentials in `.mahoraga.env` (gitignored):

```bash
MAHORAGA_AMPLITUDE_API_KEY=your-api-key
MAHORAGA_AMPLITUDE_SECRET_KEY=your-secret-key
```

### Usage

```bash
# Initialize Mahoraga in your project
npx mahoraga init

# Run analysis (pulls data, detects issues, dispatches agents)
npx mahoraga analyze

# Dry run — detect issues without dispatching agents
npx mahoraga analyze --dry-run

# Inspect stored events and sessions
npx mahoraga inspect

# Check status of dispatched agents
npx mahoraga status

# Map a CSS selector to source file location
npx mahoraga map ".btn-submit"

# Clean up old data
npx mahoraga gc
```

## Packages

| Package | Description |
|---|---|
| [`@mahoraga/core`](packages/core) | Zod schemas, SQLite storage, types, utilities |
| [`@mahoraga/sources`](packages/sources) | Pluggable source adapters (V1: Amplitude) |
| [`@mahoraga/analyzer`](packages/analyzer) | Detection rules engine |
| [`@mahoraga/mapper`](packages/mapper) | AST-based selector-to-source-file mapping |
| [`@mahoraga/agent`](packages/agent) | Agent dispatcher with adaptation loop |
| [`@mahoraga/cli`](packages/cli) | CLI entry point |

### Dependency Graph

```
cli -> agent -> analyzer -> sources -> core
         |         |           |
       mapper     core        core
         |
        core
```

## Development

```bash
pnpm turbo build         # Build all packages
pnpm turbo test          # Run all tests
pnpm turbo lint          # Lint all packages
pnpm turbo typecheck     # Type-check all packages
pnpm turbo clean         # Clean all dist/ outputs

# Work on a specific package
pnpm --filter @mahoraga/core test
pnpm --filter @mahoraga/analyzer build
```

## License

[MIT](LICENSE) - Thomas Indrias
