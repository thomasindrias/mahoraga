# mahoraga-agent

## 0.6.0

### Minor Changes

- f04a335: OpenCode-first provider consolidation.

  - Removed ClaudeCodeExecutor, APIAgentExecutor, and openai dependency
  - Simplified config to opencode-only provider
  - Removed v0.x OpenCode support
  - Added NDJSON error event parsing
  - Added file-change detection in adaptation loop
  - Updated init workflow template for OpenCode + PAT_TOKEN
  - Added .opencode.json scaffolding to init command

### Patch Changes

- Updated dependencies [f04a335]
  - mahoraga-core@0.6.0
  - mahoraga-mapper@0.1.9

## 0.5.6

### Patch Changes

- Strip GITHUB_TOKEN from OpenCode env to prevent auto-detection of GitHub Models as provider

## 0.5.5

### Patch Changes

- Add agent output preview logging to adaptation loop for CI debugging

## 0.5.4

### Patch Changes

- Fix OpenCode v1.x CLI args order: flags must come before the variadic message argument. Also embed full diagnostics (version, exit code, stderr) into error messages for CI visibility.

## 0.5.3

### Patch Changes

- Add diagnostic logging to OpenCode executor for CI debugging

## 0.5.2

### Patch Changes

- Support both OpenCode v0.x (`-p "prompt" -f json -q`) and v1.x (`opencode run "prompt" --format json`) CLI flags with auto-detection. Parse both single JSON and NDJSON output formats.

## 0.5.1

### Patch Changes

- Fix OpenCode executor CLI flags: use `opencode run <prompt> --format json` instead of invalid `-p - -f json -q` flags. Parse NDJSON output correctly. Exclude `.opencode/` artifacts from git staging.

## 0.5.0

### Minor Changes

- feat: add OpenCode executor for provider-agnostic AI coding agent

  OpenCode supports any AI provider (OpenAI, Anthropic, Gemini, Groq, OpenRouter,
  AWS Bedrock, Azure) via its own configuration. Set provider to "opencode" in
  mahoraga config to use it.

### Patch Changes

- Updated dependencies
  - mahoraga-core@0.5.1
  - mahoraga-mapper@0.1.8

## 0.4.0

### Minor Changes

- feat: add OpenRouter as AI provider for access to Claude, Llama, DeepSeek, etc.

### Patch Changes

- Updated dependencies
  - mahoraga-core@0.5.0
  - mahoraga-mapper@0.1.7

## 0.3.5

### Patch Changes

- fix: default createPR to true when not explicitly set to false

## 0.3.4

### Patch Changes

- fix: handle missing postChecks config with safe defaults

## 0.3.3

### Patch Changes

- fix: commit and push agent changes before PR creation, log dispatch errors

## 0.3.2

### Patch Changes

- fix: auto-detect test runner (vitest/jest/bun) instead of hardcoding vitest

## 0.3.1

### Patch Changes

- fix: add retry with backoff for 429 rate limit errors

## 0.3.0

### Minor Changes

- Add provider-agnostic API executor supporting OpenAI and Gemini for agent dispatch

### Patch Changes

- Updated dependencies
  - mahoraga-core@0.4.0
  - mahoraga-mapper@0.1.6

## 0.2.5

### Patch Changes

- Extract human-readable error from Claude Code JSON error output

## 0.2.4

### Patch Changes

- Use stdin for prompt delivery to Claude Code CLI to handle multi-line prompts

## 0.2.3

### Patch Changes

- Log agent attempt errors and include last error in dispatch summary

## 0.2.2

### Patch Changes

- Fix Claude Code executor: add --dangerously-skip-permissions for CI, parse correct JSON output format

## 0.2.1

### Patch Changes

- Updated dependencies [1f0086e]
  - mahoraga-core@0.3.0
  - mahoraga-mapper@0.1.5

## 0.2.0

### Minor Changes

- b053a99: feat: cost budget enforcement

  New `CostTracker` class enforces `maxCostPerRun` and `maxDispatchesPerRun` limits. Replaces the previous `.slice(0, N)` approach with a budget-aware dispatch loop that stops early when limits are reached.

### Patch Changes

- Updated dependencies [b053a99]
- Updated dependencies
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
