# mahoraga-sources

## 0.2.6

### Patch Changes

- 89d5ed6: docs: fix stale package READMEs — PostHog now Available, add all 7 rules, fix adapter signature, correct rules default

## 0.2.5

### Patch Changes

- Updated dependencies [f04a335]
  - mahoraga-core@0.6.0

## 0.2.4

### Patch Changes

- Updated dependencies
  - mahoraga-core@0.5.1

## 0.2.3

### Patch Changes

- Updated dependencies
  - mahoraga-core@0.5.0

## 0.2.2

### Patch Changes

- Updated dependencies
  - mahoraga-core@0.4.0

## 0.2.1

### Patch Changes

- 1f0086e: Make better-sqlite3 an optional peer dependency in mahoraga-core

  Consumers that only use schemas, types, and utilities no longer need better-sqlite3
  installed. The native module is lazy-loaded via dynamic import() when createDatabase()
  is called. createDatabase() is now async (returns Promise<DatabaseManager>).

  Breaking: createDatabase() signature changed from sync to async. All existing call
  sites must add `await`.

- Updated dependencies [1f0086e]
  - mahoraga-core@0.3.0

## 0.2.0

### Minor Changes

- b053a99: feat: PostHog source adapter

  New `PostHogAdapter` pulls events from PostHog's API with pagination support, Bearer auth, and self-hosted instance support. Maps PostHog events ($pageview, $autocapture, $exception, $web_vitals) to MahoragaEvent types.

### Patch Changes

- Updated dependencies [b053a99]
- Updated dependencies
- Updated dependencies [b053a99]
- Updated dependencies [b053a99]
  - mahoraga-core@0.2.0

## 0.1.3

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
