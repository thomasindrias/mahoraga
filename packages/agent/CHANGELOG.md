# mahoraga-agent

## 0.2.0

### Minor Changes

- b053a99: feat: cost budget enforcement

  New `CostTracker` class enforces `maxCostPerRun` and `maxDispatchesPerRun` limits. Replaces the previous `.slice(0, N)` approach with a budget-aware dispatch loop that stops early when limits are reached.

### Patch Changes

- Updated dependencies [b053a99]
- Updated dependencies [b053a99]
- Updated dependencies [b053a99]
  - mahoraga-core@0.2.0
  - mahoraga-mapper@0.1.4

## 0.1.3

### Patch Changes

- cc63dcb: Harden test coverage and fix adaptation loop exception handling
- cc63dcb: Add 5 new detection rules: dead clicks, form abandonment, slow navigation, layout shifts, error loops
- Updated dependencies [cc63dcb]
  - mahoraga-core@0.1.3
  - mahoraga-mapper@0.1.3

## 0.1.2

### Patch Changes

- d7a4baf: Add coverage instrumentation, MSW contract tests, pipeline integration tests, and worktree integration tests. Upgrade vitest to v4 with @vitest/coverage-v8.
- Updated dependencies [d7a4baf]
  - mahoraga-core@0.1.2
  - mahoraga-mapper@0.1.2

## 0.1.1

### Patch Changes

- 401106a: Initial npm publish
- Updated dependencies [401106a]
  - mahoraga-core@0.1.1
  - mahoraga-mapper@0.1.1
