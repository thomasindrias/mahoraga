# mahoraga-cli

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
