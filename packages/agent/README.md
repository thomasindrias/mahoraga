# mahoraga-agent

[![npm](https://img.shields.io/npm/v/mahoraga-agent.svg)](https://www.npmjs.com/package/mahoraga-agent)

AI agent dispatcher with adaptation loop for [Mahoraga](https://github.com/thomasindrias/mahoraga).

## Install

```bash
npm install mahoraga-agent
```

## What It Does

Takes a detected UI issue, generates a fix using an AI coding agent, validates the fix (build + test + diff size), and opens a draft PR — all in an isolated git worktree.

## Usage

```typescript
import { AgentDispatcher } from 'mahoraga-agent';

const dispatcher = new AgentDispatcher({
  projectRoot: '/path/to/project',
  baseBranch: 'main',
  allowedPaths: ['src/**/*.tsx'],
  deniedPaths: ['src/admin/**'],
  confidenceThreshold: 0.7,
  maxRetries: 3,
  postChecks: { build: true, test: true, maxDiffLines: 500 },
});

const result = await dispatcher.dispatch(issueGroup);
// { status: 'pr_created', prUrl: 'https://github.com/user/repo/pull/123', ... }
```

## Adaptation Loop

The agent's core differentiator:

1. **Generate fix** — AI agent produces a code change
2. **Create test** — Generate a localized test mimicking the user journey
3. **Run test** — Execute the test against the fix
4. **Retry** — If the test fails, feed error output back to the agent (up to `maxRetries`)
5. **Validate** — Only proceed to PR if build passes, tests pass, and diff is within limits

## Governance Controls

| Control | Default | Description |
|---------|---------|-------------|
| `allowedPaths` | `[]` | Glob patterns the agent can modify |
| `deniedPaths` | `[]` | Glob patterns the agent must not modify |
| `confidenceThreshold` | `0.7` | Below this → GitHub issue instead of PR |
| `maxCostPerIssue` | `$2` | USD budget per issue |
| `maxCostPerRun` | `$20` | USD budget per run |
| `maxDiffLines` | `500` | Reject diffs exceeding this |
| `maxRetries` | `3` | Adaptation loop retry limit |

## License

[MIT](https://github.com/thomasindrias/mahoraga/blob/main/LICENSE)
