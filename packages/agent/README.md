# @mahoraga/agent

AI agent dispatcher with adaptation loop.

## Installation

```bash
npm install @mahoraga/agent
```

## Features

- **Adaptation loop**: Generate fix -> Create test -> Run test -> Retry on failure
- **Git worktree isolation** for safe experimentation
- **Claude Code CLI integration** for AI-powered fixes
- **Automated validation**: Build + test + diff size checks
- **PR creation** via `gh` CLI with rich context

## Usage

```typescript
import { AgentDispatcher } from '@mahoraga/agent';

const dispatcher = new AgentDispatcher({
  projectRoot: '/path/to/project',
  allowedPaths: ['src/**/*.tsx'],
  deniedPaths: ['src/admin/**'],
  confidenceThreshold: 0.7,
  maxRetries: 3,
});

const result = await dispatcher.dispatch(issue);
console.log(result);
// { prUrl: 'https://github.com/user/repo/pull/123', cost: 1.42 }
```

## Governance Controls

- **allowedPaths / deniedPaths**: Glob patterns for blast radius control
- **confidenceThreshold**: Minimum confidence for auto-fix (default 0.7)
- **Cost budgets**: Per-issue ($2), per-run ($20)
- **Diff size limits**: Reject diffs exceeding maxDiffLines (default 500)
- **Cooldown**: 7-day cooldown for failed attempts

## License

MIT

## Links

- [Main repository](https://github.com/thomas-m10s/mahoraga)
- [Documentation](https://github.com/thomas-m10s/mahoraga#readme)
