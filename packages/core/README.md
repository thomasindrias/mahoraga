# @mahoraga/core

Shared schemas, storage, types, and utilities for Mahoraga.

## Installation

```bash
npm install @mahoraga/core
```

## Features

- **Zod schemas** for event validation and type safety
- **SQLite storage** via better-sqlite3 (WAL mode, hash-based deduplication)
- **Utilities**: hash generation, deduplication, retry logic, rate limiter
- **Testing subpath**: `@mahoraga/core/testing` with factories for test data

## Testing Utilities

The `@mahoraga/core/testing` subpath exports test factories:

```typescript
import {
  createEvent,
  createSession,
  createTimeWindow,
  createRageClickSequence,
} from '@mahoraga/core/testing';
```

## Requirements

Requires a build toolchain for the better-sqlite3 native addon (node-gyp, Python, C++ compiler).

## License

MIT

## Links

- [Main repository](https://github.com/thomasindrias/mahoraga)
- [Documentation](https://github.com/thomasindrias/mahoraga#readme)
