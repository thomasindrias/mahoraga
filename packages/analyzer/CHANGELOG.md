# mahoraga-analyzer

## 0.3.3

### Patch Changes

- Updated dependencies
  - mahoraga-core@0.5.0

## 0.3.2

### Patch Changes

- Updated dependencies
  - mahoraga-core@0.4.0

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

## 0.3.0

### Minor Changes

- b053a99: feat: configurable rule thresholds

  All 7 detection rules now read thresholds from `context.thresholds` instead of hardcoded constants. Configure via `analysis.thresholds` in `mahoraga.config.ts`. All defaults match previous hardcoded values — zero behavior change without configuration.

- b053a99: feat: URL normalization with route patterns

  New `normalizeUrl()` utility groups dynamic URLs (e.g., `/products/123` and `/products/456`) using configurable route patterns. Integrated into slow-navigation and layout-shift rules. Configure via `analysis.routePatterns` in `mahoraga.config.ts`.

### Patch Changes

- Updated dependencies [b053a99]
- Updated dependencies
- Updated dependencies [b053a99]
- Updated dependencies [b053a99]
  - mahoraga-core@0.2.0

## 0.2.0

### Minor Changes

- cc63dcb: Add 5 new detection rules: dead clicks, form abandonment, slow navigation, layout shifts, error loops

### Patch Changes

- Updated dependencies [cc63dcb]
  - mahoraga-core@0.1.3

## 0.1.2

### Patch Changes

- d7a4baf: Add coverage instrumentation, MSW contract tests, pipeline integration tests, and worktree integration tests. Upgrade vitest to v4 with @vitest/coverage-v8.
- Updated dependencies [d7a4baf]
  - mahoraga-core@0.1.2

## 0.1.1

### Patch Changes

- 401106a: Initial npm publish
- Updated dependencies [401106a]
  - mahoraga-core@0.1.1
