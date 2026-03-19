---
name: mahoraga-agent-config
description: Configure Mahoraga's AI agent dispatcher and governance controls. Use when the user wants to set cost budgets, restrict which files the agent can modify (allowedPaths/deniedPaths), adjust confidence thresholds, configure PR creation settings, tune the adaptation loop, or troubleshoot agent dispatch behavior.
---

# mahoraga-agent-config

Configure Mahoraga's AI agent dispatcher and governance controls.

## Overview

Governance controls balance automation speed with safety. Cost limits prevent runaway spending, path restrictions protect critical files, and confidence thresholds gate low-quality fixes. All settings live in `mahoraga.config.ts` under the `agent` key.

## Cost Budgets

| Setting | Default | Purpose |
|---------|---------|---------|
| `maxCostPerIssue` | $2 | Per-issue USD budget |
| `maxCostPerRun` | $20 | Per-run USD budget |
| `maxDispatchesPerRun` | 5 | Max issues per run |

Each dispatch costs ~$1-2. `CostTracker` enforces both per-issue and per-run limits.

## Confidence Threshold

`confidenceThreshold` (default: 0.7) gates PR creation. Issues below threshold produce GitHub issues instead of PRs.

Severity mapping: critical→0.9, high→0.75, medium→0.5, low→0.3.

Example: Default 0.7 threshold means only critical and high-severity issues get PRs.

## Path Governance

`allowedPaths` and `deniedPaths` use minimatch glob patterns:

```typescript
agent: {
  allowedPaths: ['src/components/**'],
  deniedPaths: ['src/lib/auth/**'],
}
```

Checked pre-dispatch (heuristic on `componentName`) and post-diff (actual files changed). Any violation rejects the fix.

## Post-Checks

`postChecks` validate fixes before PR creation:

- `build` (default: `true`) — Run build
- `test` (default: `true`) — Run tests
- `maxDiffLines` (default: 500) — Reject oversized diffs

## Agent Isolation

Each dispatch runs in a fresh git worktree. Settings:

- `draftPR` (default: `true`)
- `baseBranch` (default: `'main'`)
- `createPR` (default: `true`)

## Adaptation Loop

Mahoraga's competitive moat:

1. Generate verification test mimicking user journey
2. Run test
3. If fails, feed error back to agent
4. Retry up to `maxRetries` (default: 3)
5. Only create PR if test passes

`timeoutMs` (default: 300,000ms / 5 min) limits total dispatch time.

## Cooldown & Suppression

**Cooldown**: Failed fixes enter 7-day cooldown to avoid wasting credits.

**Suppression**: `mahoraga dismiss <issue-id>` persists in SQLite, survives future runs.

## Provider Configuration

- `provider`: `'opencode'` (only supported value). OpenCode is provider-agnostic — configure your AI provider in `.opencode.json`
- `agentMdPath`: path to AGENTS.md for agent-specific instructions
- `workflow`: `'plan-then-implement'` (only supported value)

### Prerequisites

- `opencode-ai` CLI installed (`npm install --global opencode-ai`)
- `.opencode.json` with provider config and `"permission": { "*": "allow" }`
- Authenticated `gh` CLI (for PR creation)

## Common Mistakes

- **`maxCostPerRun` too low**: Set ≥$10 for multiple issues
- **Missing `.opencode.json`**: OpenCode needs provider config. Run `npx mahoraga-cli init` to scaffold
- **Missing `gh` CLI auth**: Required for PR creation — run `gh auth login`
- **No `allowedPaths` in large repos**: Agent may modify unexpected files
- **`confidenceThreshold` too high**: Lower to 0.5 to include medium-severity issues
- **Blocked by cooldown**: Check `mahoraga status`, use `dismiss` to clear suppressions
