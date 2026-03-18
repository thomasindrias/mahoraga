<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
  <img alt="Mahoraga" src="docs/assets/logo-light.svg" width="120" height="120">
</picture>

# Mahoraga

**Self-evolving frontend intelligence.**

Ingests user behavior data from your existing analytics stack, detects UI issues through automated analysis, and dispatches AI agents to fix them — creating pull requests automatically.

[![npm](https://img.shields.io/npm/v/mahoraga-cli.svg)](https://www.npmjs.com/package/mahoraga-cli)
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
- An [Amplitude](https://amplitude.com) account (V1 source)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (for agent dispatch)
- [GitHub CLI](https://cli.github.com) (`gh`) for PR creation

### Install

```bash
# npm
npm install mahoraga-cli mahoraga-core

# pnpm
pnpm add mahoraga-cli mahoraga-core

# Or try it without installing
npx mahoraga-cli --help
```

### Configure

Create `mahoraga.config.ts` in your project root:

```typescript
import { defineConfig } from "mahoraga-core";

export default defineConfig({
  sources: [
    {
      adapter: "amplitude",
      apiKey: process.env.MAHORAGA_AMPLITUDE_API_KEY!,
      secretKey: process.env.MAHORAGA_AMPLITUDE_SECRET_KEY!,
    },
  ],
  analysis: {
    rules: ["rage-clicks", "error-spikes"],
  },
  agent: {
    provider: "claude-code",
    allowedPaths: ["src/**"],
    deniedPaths: ["src/generated/**"],
  },
});
```

Or generate one interactively:

```bash
npx mahoraga-cli init
```

Store credentials in `.mahoraga.env` (automatically gitignored):

```env
MAHORAGA_AMPLITUDE_API_KEY=your-api-key
MAHORAGA_AMPLITUDE_SECRET_KEY=your-secret-key
```

### Run

```bash
# Preview detected issues without dispatching agents
npx mahoraga-cli analyze --dry-run

# Run full pipeline: pull → analyze → dispatch → PR
npx mahoraga-cli analyze

# Inspect stored events and sessions
npx mahoraga-cli inspect

# Check agent dispatch status
npx mahoraga-cli status

# Map a CSS selector to its source file
npx mahoraga-cli map ".btn-submit"

# Clean up old data
npx mahoraga-cli gc
```

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [`mahoraga-core`](packages/core) | [![npm](https://img.shields.io/npm/v/mahoraga-core.svg?label=)](https://www.npmjs.com/package/mahoraga-core) | Zod schemas, SQLite storage, types, utilities |
| [`mahoraga-sources`](packages/sources) | [![npm](https://img.shields.io/npm/v/mahoraga-sources.svg?label=)](https://www.npmjs.com/package/mahoraga-sources) | Pluggable source adapters (V1: Amplitude) |
| [`mahoraga-analyzer`](packages/analyzer) | [![npm](https://img.shields.io/npm/v/mahoraga-analyzer.svg?label=)](https://www.npmjs.com/package/mahoraga-analyzer) | Detection rules engine |
| [`mahoraga-mapper`](packages/mapper) | [![npm](https://img.shields.io/npm/v/mahoraga-mapper.svg?label=)](https://www.npmjs.com/package/mahoraga-mapper) | AST-based selector-to-source mapping |
| [`mahoraga-agent`](packages/agent) | [![npm](https://img.shields.io/npm/v/mahoraga-agent.svg?label=)](https://www.npmjs.com/package/mahoraga-agent) | Agent dispatcher with adaptation loop |
| [`mahoraga-cli`](packages/cli) | [![npm](https://img.shields.io/npm/v/mahoraga-cli.svg?label=)](https://www.npmjs.com/package/mahoraga-cli) | CLI entry point |

### Dependency Graph

```
cli (composition root)
 ├── agent ─── core, mapper
 ├── analyzer ── core
 ├── sources ─── core
 ├── mapper ──── core
 └── core
```

## Configuration Reference

All options with their defaults:

```typescript
defineConfig({
  // Required: at least one source
  sources: [
    { adapter: "amplitude", apiKey: "...", secretKey: "..." },
  ],

  // Analysis (all optional)
  analysis: {
    windowDays: 3,                    // Days of data to analyze
    rules: ["rage-clicks", "error-spikes"],
    customRules: [],                  // Custom DetectionRule implementations
  },

  // Agent (all optional)
  agent: {
    provider: "claude-code",          // "claude-code" | "gemini" | "openai"
    baseBranch: "main",
    draftPR: true,                    // Create PRs as drafts
    maxRetries: 3,                    // Adaptation loop retries
    maxCostPerIssue: 2,               // USD budget per issue
    maxCostPerRun: 20,                // USD budget per run
    maxDispatchesPerRun: 5,
    confidenceThreshold: 0.7,         // Below this → issue instead of PR
    allowedPaths: [],                 // Glob patterns the agent can modify
    deniedPaths: [],                  // Glob patterns the agent must not modify
    postChecks: {
      build: true,
      test: true,
      maxDiffLines: 500,
    },
  },

  // Storage (all optional)
  storage: {
    dbPath: ".mahoraga/mahoraga.db",
    retentionDays: 30,
  },

  // Logging (all optional)
  logging: {
    level: "info",                    // "debug" | "info" | "warn" | "error"
    format: "pretty",                 // "pretty" | "json"
  },
});
```

## Contributing

```bash
git clone https://github.com/thomasindrias/mahoraga.git
cd mahoraga
pnpm install
pnpm turbo build
```

```bash
pnpm turbo build              # Build all packages
pnpm turbo test               # Run all tests
pnpm turbo test:coverage      # Run tests with 80% coverage thresholds
pnpm turbo test:integration   # Run all tests including integration tests
pnpm turbo lint               # Lint all packages
pnpm turbo typecheck          # Type-check all packages

# Work on a specific package
pnpm --filter mahoraga-core test
pnpm --filter mahoraga-analyzer build
```

## License

[MIT](LICENSE) - Thomas Indrias
