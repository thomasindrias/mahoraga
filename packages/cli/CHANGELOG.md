# mahoraga-cli

## 0.4.4

### Patch Changes

- Updated dependencies
  - mahoraga-agent@0.3.4

## 0.4.3

### Patch Changes

- fix: commit and push agent changes before PR creation, log dispatch errors
- Updated dependencies
  - mahoraga-agent@0.3.3

## 0.4.2

### Patch Changes

- Updated dependencies
  - mahoraga-agent@0.3.2

## 0.4.1

### Patch Changes

- Updated dependencies
  - mahoraga-agent@0.3.1

## 0.4.0

### Minor Changes

- Add provider-agnostic API executor supporting OpenAI and Gemini for agent dispatch

### Patch Changes

- Updated dependencies
  - mahoraga-agent@0.3.0
  - mahoraga-core@0.4.0
  - mahoraga-analyzer@0.3.2
  - mahoraga-mapper@0.1.6
  - mahoraga-sources@0.2.2

## 0.3.7

### Patch Changes

- Extract human-readable error from Claude Code JSON error output
- Updated dependencies
  - mahoraga-agent@0.2.5

## 0.3.6

### Patch Changes

- Use stdin for prompt delivery to Claude Code CLI to handle multi-line prompts
- Updated dependencies
  - mahoraga-agent@0.2.4

## 0.3.5

### Patch Changes

- Log agent attempt errors and include last error in dispatch summary
- Updated dependencies
  - mahoraga-agent@0.2.3

## 0.3.4

### Patch Changes

- Fix Claude Code executor: add --dangerously-skip-permissions for CI, parse correct JSON output format
- Updated dependencies
  - mahoraga-agent@0.2.2

## 0.3.3

### Patch Changes

- Fix generated GitHub Actions workflow to include Claude Code installation, git config, and PR permissions

## 0.3.2

### Patch Changes

- Add custom adapter support to init command and fix workflow generation

  - Add 'Custom adapter' option to interactive source selector
  - Generate correct config template for custom adapters
  - Make GitHub Actions workflow source-aware (no Amplitude env vars for custom)
  - Fix workflow command from `npx mahoraga-cli analyze` to `npx mahoraga analyze`
  - Update GitHub Actions versions to v4

## 0.3.1

### Patch Changes

- 1f0086e: Make better-sqlite3 an optional peer dependency in mahoraga-core

  Consumers that only use schemas, types, and utilities no longer need better-sqlite3
  installed. The native module is lazy-loaded via dynamic import() when createDatabase()
  is called. createDatabase() is now async (returns Promise<DatabaseManager>).

  Breaking: createDatabase() signature changed from sync to async. All existing call
  sites must add `await`.

- Updated dependencies [1f0086e]
  - mahoraga-core@0.3.0
  - mahoraga-analyzer@0.3.1
  - mahoraga-sources@0.2.1
  - mahoraga-agent@0.2.1
  - mahoraga-mapper@0.1.5

## 0.3.0

### Minor Changes

- feat: add custom source adapter support via dynamic import

  - SourceConfigSchema now includes `module` field and uses `.passthrough()` for custom config keys
  - CLI `analyze` command supports `adapter: 'custom'` with dynamic module loading
  - Config file loading supports `.mjs` and `.js` extensions (not just `.ts`)

- b053a99: feat: false-positive suppression

  New `SuppressionStore` and `mahoraga dismiss` command for permanently suppressing false-positive issues. Suppressed fingerprints are filtered after analysis and marked with `'suppressed'` status for audit trail.

### Patch Changes

- b053a99: feat: configurable rule thresholds

  All 7 detection rules now read thresholds from `context.thresholds` instead of hardcoded constants. Configure via `analysis.thresholds` in `mahoraga.config.ts`. All defaults match previous hardcoded values — zero behavior change without configuration.

- b053a99: feat: cost budget enforcement

  New `CostTracker` class enforces `maxCostPerRun` and `maxDispatchesPerRun` limits. Replaces the previous `.slice(0, N)` approach with a budget-aware dispatch loop that stops early when limits are reached.

- b053a99: feat: PostHog source adapter

  New `PostHogAdapter` pulls events from PostHog's API with pagination support, Bearer auth, and self-hosted instance support. Maps PostHog events ($pageview, $autocapture, $exception, $web_vitals) to MahoragaEvent types.

- b053a99: feat: URL normalization with route patterns

  New `normalizeUrl()` utility groups dynamic URLs (e.g., `/products/123` and `/products/456`) using configurable route patterns. Integrated into slow-navigation and layout-shift rules. Configure via `analysis.routePatterns` in `mahoraga.config.ts`.

- Updated dependencies [b053a99]
- Updated dependencies [b053a99]
- Updated dependencies
- Updated dependencies [b053a99]
- Updated dependencies [b053a99]
- Updated dependencies [b053a99]
  - mahoraga-core@0.2.0
  - mahoraga-analyzer@0.3.0
  - mahoraga-agent@0.2.0
  - mahoraga-sources@0.2.0
  - mahoraga-mapper@0.1.4

## 0.2.0

### Minor Changes

- ad65a24: Add create-rule scaffold command for custom detection rules

### Patch Changes

- cc63dcb: Harden test coverage and fix adaptation loop exception handling
- cc63dcb: Add 5 new detection rules: dead clicks, form abandonment, slow navigation, layout shifts, error loops
- Updated dependencies [cc63dcb]
- Updated dependencies [cc63dcb]
  - mahoraga-agent@0.1.3
  - mahoraga-analyzer@0.2.0
  - mahoraga-core@0.1.3
  - mahoraga-mapper@0.1.3
  - mahoraga-sources@0.1.3

## 0.1.2

### Patch Changes

- d7a4baf: Add coverage instrumentation, MSW contract tests, pipeline integration tests, and worktree integration tests. Upgrade vitest to v4 with @vitest/coverage-v8.
- Updated dependencies [d7a4baf]
  - mahoraga-core@0.1.2
  - mahoraga-mapper@0.1.2
  - mahoraga-sources@0.1.2
  - mahoraga-analyzer@0.1.2
  - mahoraga-agent@0.1.2

## 0.1.1

### Patch Changes

- 401106a: Initial npm publish
- Updated dependencies [401106a]
  - mahoraga-core@0.1.1
  - mahoraga-mapper@0.1.1
  - mahoraga-sources@0.1.1
  - mahoraga-analyzer@0.1.1
  - mahoraga-agent@0.1.1
