# Mahoraga

Self-evolving frontend intelligence. Ingests user behavior data from existing analytics platforms (Amplitude, PostHog, Sentry), detects UI issues through automated analysis, and dispatches AI agents to fix them — creating pull requests automatically.

Mahoraga is NOT a tracker. It is the brain that sits on top of existing analytics data and turns behavioral signals into code improvements.

## Core Pipeline

```
Sources (Amplitude, PostHog, Sentry)
    | pull via API adapters
Normalize (common MahoragaEvent schema, Zod-validated)
    | persist to SQLite
Analyze (pluggable detection rules)
    | produce Issue reports
Map (AST-based selector-to-source-file resolution)
    | resolve CSS selectors to source locations
Dispatch (Claude Code CLI agent)
    | create PR with plan + fix
Human Review -> Merge
```

## Architecture

### Tech Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **Language:** TypeScript (strict mode), ESM-only
- **Testing:** Vitest
- **Bundling:** tsup
- **Storage:** SQLite via better-sqlite3
- **Linting:** ESLint 9 flat config + eslint-plugin-jsdoc + typescript-eslint
- **Node:** >=20

### Package Dependency Graph

```
cli -> agent -> core, mapper
  |-> analyzer -> core
  |-> sources -> core
  |-> mapper -> core
agent -> core, mapper
```

`mahoraga-core` is the leaf dependency. The CLI acts as the composition root, depending on all packages directly.

### Packages

| Package | Path | Description |
|---------|------|-------------|
| `mahoraga-core` | `packages/core` | Zod schemas, SQLite storage, types, utilities (hash, dedup, retry, rate limiter), testing factories. Exports `mahoraga-core/testing` subpath for test helpers. |
| `mahoraga-mapper` | `packages/mapper` | AST-based selector-to-source-file mapping. Parses TSX/JSX via TypeScript Compiler API, resolves CSS selectors to file:line:column. Competitive moat. |
| `mahoraga-sources` | `packages/sources` | Pluggable source adapters. `SourceAdapter` interface with async iterable batch pulling. Amplitude + PostHog. Uses MSW for contract tests. |
| `mahoraga-analyzer` | `packages/analyzer` | Detection rules engine. `DetectionRule` interface. V1 rules: rage-click, error-spike. V2 rules: dead-click, form-abandonment, slow-navigation, layout-shift, error-loop. Rules query SQLite directly. |
| `mahoraga-agent` | `packages/agent` | Agent dispatcher with adaptation loop. Constructs prompts, manages git worktrees, invokes OpenCode CLI, validates fixes (build + test + diff size), creates PRs via `gh`. Competitive moat. |
| `mahoraga-cli` | `packages/cli` | CLI entry point (`mahoraga`). Commands: `init`, `analyze`, `analyze --dry-run`, `inspect`, `status`, `gc`, `map`, `create-rule`, `dismiss`. |

## Development Workflow

### Spec-Driven TDD

Every feature follows this cycle:

1. **Spec first** -- define the behavior in a spec document
2. **Tests from spec** -- each requirement maps to test cases
3. **Red -> Green -> Refactor** -- write failing tests, implement minimally, clean up
4. Tests MUST be written before implementation

### Design Spec

The full design spec lives at `docs/superpowers/specs/2026-03-17-mahoraga-design.md`. Read it before making architectural changes.

## Common Commands

```bash
pnpm turbo build                        # Build all packages
pnpm turbo test                         # Run all tests
pnpm turbo lint                         # Lint all packages
pnpm turbo typecheck                    # Type-check all packages
pnpm turbo clean                        # Clean all dist/ outputs

pnpm --filter mahoraga-<pkg> test       # Test a specific package
pnpm --filter mahoraga-<pkg> build      # Build a specific package
pnpm --filter mahoraga-<pkg> lint       # Lint a specific package
```

## Code Conventions

- **JSDoc on ALL public APIs** -- functions, classes, interfaces, exported types. Enforced via `eslint-plugin-jsdoc` with `publicOnly: true`. Descriptions required on params and returns.
- **TypeScript strict mode** -- `strict: true`, `noUncheckedIndexedAccess: true`, `isolatedModules: true`.
- **ESM-only** -- all packages use `"type": "module"`. Target ES2022, module ESNext, bundler resolution.
- **Zod validation at external boundaries** -- every event entering the pipeline is validated. Invalid events are logged and skipped, never silently dropped.
- **No `any` types** -- use `unknown` and narrow with type guards or Zod.
- **Dependency injection over global state** -- pass dependencies explicitly for testability.
- **Unused vars** -- prefixed with `_` (enforced via `@typescript-eslint/no-unused-vars`).

## Key Design Decisions

### SQLite via better-sqlite3
Zero configuration, single file, no server. CLI-friendly -- works anywhere Node.js runs. WAL mode for concurrent reads during writes.

### Hash-Based Idempotency
Event `id` is a deterministic SHA-256 hash of `(source, rawEventType, sessionId, timestamp, distinguishing_payload_field)`. Re-pulling the same time range deduplicates automatically via `INSERT OR IGNORE`.

### Adaptation Loop
The agent's competitive moat. After generating a fix:
1. Generate a localized test mimicking the user journey that triggered the issue
2. Run the test
3. If test fails, feed error output back to the agent
4. Retry up to `maxRetries` (default 3)
5. Only proceed to PR if the test passes

### Governance / Blast Radius Control
- **allowedPaths / deniedPaths** -- glob patterns restricting which files the agent can modify
- **confidenceThreshold** (default 0.7) -- below threshold produces a GitHub issue instead of a PR
- **Cost budgets** -- per-issue (`$2`), per-run (`$20`), max dispatches per run (`5`). Enforced via `CostTracker` which stops dispatches when limits are reached.
- **Diff size limits** -- rejects diffs exceeding `maxDiffLines` (default 500)
- **Cooldown** -- failed fix attempts enter 7-day cooldown to avoid wasting credits

### Agent Isolation
Agent operates in a fresh git worktree. `main` is never directly modified. Draft PRs by default.

### Data Retention
Configurable `retentionDays` (default 30). Cleanup runs at the start of each `analyze` command. Manual cleanup via `mahoraga gc`.

### Configurable Thresholds
All 7 detection rules read thresholds from `context.thresholds` with fallback to defaults. Configure via `analysis.thresholds` in `mahoraga.config.ts`. All defaults match previous hardcoded values -- zero behavior change without configuration.

### URL Normalization
`normalizeUrl()` groups dynamic URLs (e.g., `/products/123` → `/products/:id`) using configurable route patterns. Integrated into slow-navigation and layout-shift rules. Configure via `analysis.routePatterns`.

### False-Positive Suppression
`SuppressionStore` persists suppressed fingerprints in SQLite. Suppressed issues are filtered after analysis and marked with `'suppressed'` status for audit trail. CLI: `mahoraga dismiss <fingerprint>`.

### Credential Resolution (priority order)
1. Environment variables (`MAHORAGA_AMPLITUDE_API_KEY`, etc.)
2. `.mahoraga.env` file (gitignored)
3. Config file (`mahoraga.config.ts`) referencing `process.env`
4. `.opencode.json` for AI provider credentials

Credentials are never stored in SQLite or logged.

## Testing Strategy

### Layers
- **Unit tests** (all packages) -- pure function logic, mocked dependencies, no I/O
- **Contract tests** (`mahoraga-sources`) -- MSW fake HTTP servers, recorded fixtures in `__fixtures__/`
- **Integration tests** -- full pipeline from fixture data to issue reports, real SQLite (in-memory)
- **Agent tests** -- prompt assembly unit tests, git operations in temp repos, `MockAgentExecutor` with pre-recorded diffs
- **E2E tests** -- gated behind `MAHORAGA_INTEGRATION_TESTS=true`, not run on every PR

### Test Factories
`mahoraga-core/testing` exports: `createEvent()`, `createSession()`, `createRageClickSequence()`, `createErrorEvent()`, `createNavigationEvent()`, `createFormEvent()`, `createPerformanceEvent()`, `resetEventCounter()`.

### Coverage
Target 80% line coverage minimum per package.

## Skills (Claude Code Plugin)

Mahoraga ships with a Claude Code plugin (`.claude-plugin/`) providing 4 skills for AI coding agents:
- `mahoraga-setup` — Setting up and configuring Mahoraga in a project
- `mahoraga-custom-rules` — Writing custom detection rules
- `mahoraga-source-adapters` — Writing source adapters for new analytics platforms
- `mahoraga-agent-config` — Configuring the agent dispatcher and governance controls

Install by cloning the repo or adding as a Claude Code plugin.

## Tooling Recommendations

**[rtk](https://github.com/rtk-ai/rtk)** -- Recommended for Claude Code users. Filters and compresses command outputs before they reach LLM context. Single Rust binary, zero dependencies, <10ms overhead. Reduces token costs by 60-90% on dev operations.
