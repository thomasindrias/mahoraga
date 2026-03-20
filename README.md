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
Dispatch (OpenCode CLI agent)
    | create PR with plan + fix
Human Review -> Merge
```

## Features

- **Source adapters** — Pull behavioral data from Amplitude and PostHog, with Sentry planned
- **Detection rules** — Pluggable analysis engine (rage clicks, error spikes, dead clicks, form abandonment, slow navigation, layout shifts, error loops)
- **Configurable thresholds** — Tune every detection rule's sensitivity via `analysis.thresholds` in config
- **URL normalization** — Group dynamic URLs (`/products/123`, `/products/456`) into route patterns (`/products/:id`)
- **False-positive suppression** — Permanently dismiss noisy issues with `mahoraga dismiss`, with audit trail
- **Code mapper** — AST-based resolution from CSS selectors to exact source file locations
- **Agent dispatcher** — Generates fixes, writes tests, validates via build/test/diff, and opens draft PRs
- **Adaptation loop** — If a generated test fails, the agent retries with error context (up to 3 attempts)
- **Cost budget enforcement** — Tracks actual dispatch costs and stops when per-run cost or dispatch limits are reached
- **Blast radius control** — Allowed/denied paths, confidence thresholds, cost budgets, diff size limits
- **Agent isolation** — Operates in fresh git worktrees; `main` is never directly modified

## Quick Start

### Prerequisites

- Node.js >= 20
- An [Amplitude](https://amplitude.com) or [PostHog](https://posthog.com) account
- [OpenCode CLI](https://opencode.ai) (for agent dispatch)
- [GitHub CLI](https://cli.github.com) (`gh`) for PR creation

### Install

```bash
# npm
npm install mahoraga-cli

# pnpm
pnpm add mahoraga-cli

# Or try it without installing
npx mahoraga-cli --help
```

> To use schemas and types directly in your code, also install `mahoraga-core`.

### Configure

Create `mahoraga.config.ts` in your project root:

```typescript
import { defineConfig } from "mahoraga-core";

export default defineConfig({
  sources: [
    // Amplitude
    {
      adapter: "amplitude",
      apiKey: process.env.MAHORAGA_AMPLITUDE_API_KEY!,
      secretKey: process.env.MAHORAGA_AMPLITUDE_SECRET_KEY!,
    },
    // Or PostHog
    {
      adapter: "posthog",
      apiKey: process.env.MAHORAGA_POSTHOG_API_KEY!,
      projectId: process.env.MAHORAGA_POSTHOG_PROJECT_ID!,
      // host: "https://eu.posthog.com",  // optional, for self-hosted or EU cloud
    },
  ],
  analysis: {
    rules: ["rage-clicks", "error-spikes", "dead-clicks", "form-abandonment", "slow-navigation", "layout-shifts", "error-loops"],
    // Group dynamic URLs into route patterns
    routePatterns: ["/products/:id", "/users/:userId/posts/:postId"],
    // Tune detection sensitivity per rule
    thresholds: {
      "rage-clicks": { clickCount: 3, windowMs: 1000 },
      "slow-navigation": { thresholdMs: 5000 },
    },
  },
  agent: {
    provider: "opencode",
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
# Or for PostHog:
MAHORAGA_POSTHOG_API_KEY=your-personal-api-key
MAHORAGA_POSTHOG_PROJECT_ID=your-project-id
```

### Run

```bash
# Preview detected issues without dispatching agents
npx mahoraga-cli analyze --dry-run

# Run full pipeline: pull → analyze → dispatch → PR
npx mahoraga-cli analyze

# Suppress a false-positive issue
npx mahoraga-cli dismiss <fingerprint> --reason "expected behavior"

# List or undo suppressions
npx mahoraga-cli dismiss --list
npx mahoraga-cli dismiss --undo <fingerprint>

# Query stored events or detected issues
npx mahoraga-cli inspect events
npx mahoraga-cli inspect issues

# Check agent dispatch status
npx mahoraga-cli status

# Rebuild code-to-event index
npx mahoraga-cli map

# Clean up old data
npx mahoraga-cli gc

# Scaffold a custom detection rule
npx mahoraga-cli create-rule
```

## Custom Rules

Create your own detection rules with the scaffold command:

```bash
npx mahoraga-cli create-rule
```

This generates a rule class and test file with boilerplate. Follow the prompts to name your rule, select event types, and get started.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [`mahoraga-core`](packages/core) | [![npm](https://img.shields.io/npm/v/mahoraga-core.svg?label=)](https://www.npmjs.com/package/mahoraga-core) | Zod schemas, SQLite storage, types, utilities |
| [`mahoraga-sources`](packages/sources) | [![npm](https://img.shields.io/npm/v/mahoraga-sources.svg?label=)](https://www.npmjs.com/package/mahoraga-sources) | Pluggable source adapters (Amplitude, PostHog) |
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
    { adapter: "posthog", apiKey: "...", projectId: "...", host: "..." },
  ],

  // Analysis (all optional)
  analysis: {
    windowDays: 3,                    // Days of data to analyze
    rules: ["rage-clicks", "error-spikes", "dead-clicks", "form-abandonment", "slow-navigation", "layout-shifts", "error-loops"],
    customRules: [],                  // Custom DetectionRule implementations
    routePatterns: [],                // URL normalization: ["/products/:id"]
    thresholds: {                     // Per-rule threshold overrides
      "rage-clicks": { clickCount: 3, windowMs: 1000 },
      "error-spikes": { spikeMultiplier: 2, minAbsoluteCount: 5 },
      "dead-clicks": { minClickCount: 5, minSessions: 2, waitMs: 2000 },
      "form-abandonment": { minAbandonRate: 0.4, minSessions: 3 },
      "slow-navigation": { thresholdMs: 3000, minOccurrences: 3, minSessions: 2 },
      "layout-shifts": { minPoorEvents: 3, minSessions: 2 },
      "error-loops": { minOccurrences: 3, minSessions: 2 },
    },
  },

  // Agent (all optional)
  agent: {
    provider: "opencode",             // "opencode" only
    workflow: "plan-then-implement",   // Only supported workflow
    agentMdPath: "path/to/AGENTS.md", // Optional: agent-specific instructions
    createPR: true,                   // Whether to create PRs (default: true)
    baseBranch: "main",
    draftPR: true,                    // Create PRs as drafts
    maxRetries: 3,                    // Adaptation loop retries
    timeoutMs: 300000,                // Max dispatch time in ms (5 min)
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

## AI Agent Support

Mahoraga includes a Claude Code plugin with 4 skills that help AI coding agents understand and extend the system:

| Skill | Description |
|-------|-------------|
| `mahoraga-setup` | Initialize, configure, and run Mahoraga |
| `mahoraga-custom-rules` | Write custom detection rules for the analysis engine |
| `mahoraga-source-adapters` | Build adapters for new analytics platforms |
| `mahoraga-agent-config` | Configure agent dispatch, governance, and cost controls |

The plugin auto-discovers from `.claude-plugin/` when cloning the repo. Skills work with Claude Code and any agent that supports the superpowers skills format.

## Troubleshooting

### GITHUB_TOKEN Hijacks AI Provider

OpenCode auto-detects `GITHUB_TOKEN` and defaults to GitHub Models, which returns 403 errors. Mahoraga strips `GITHUB_TOKEN` from the agent's environment automatically, but if you see provider errors in CI, ensure your `.opencode.json` explicitly sets the provider.

### Permission Config for CI

OpenCode requires explicit permission grants for non-interactive mode. Your `.opencode.json` must include:

```json
{
  "permission": { "*": "allow" }
}
```

Without this, OpenCode blocks on tool approval prompts with no TTY.

### PAT_TOKEN for PR Creation

GitHub organization policies often restrict `GITHUB_TOKEN` from creating pull requests. Create a fine-grained Personal Access Token with:
- **Contents:** Read and write
- **Pull requests:** Read and write

Store it as `PAT_TOKEN` in repository secrets. The generated workflow uses `PAT_TOKEN || GITHUB_TOKEN` as fallback.

### Agent Reports Success but No Files Changed

If the AI agent claims success but creates no diff, Mahoraga's adaptation loop detects this and retries. If all retries fail, check:
- The prompt is specific enough for the agent to locate the right files
- `.opencode.json` provider config points to a capable model
- The worktree has the expected source files

### Stale Remote Branches

Failed agent runs may leave remote branches (e.g. `mahoraga/fix-error-spikes-...`). Prune them periodically:

```bash
git branch -r | grep 'origin/mahoraga/' | sed 's|origin/||' | xargs -I{} git push origin --delete {}
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
