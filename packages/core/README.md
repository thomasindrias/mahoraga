# mahoraga-core

[![npm](https://img.shields.io/npm/v/mahoraga-core.svg)](https://www.npmjs.com/package/mahoraga-core)

Shared schemas, storage, types, and utilities for [Mahoraga](https://github.com/thomasindrias/mahoraga).

## Install

```bash
npm install mahoraga-core
```

## What's Inside

- **Zod schemas** — Event validation, config validation, issue schemas (Zod 4)
- **SQLite storage** — Event, issue, run, and checkpoint stores (better-sqlite3, WAL mode)
- **Hash-based deduplication** — Deterministic SHA-256 event IDs for idempotent ingestion
- **Utilities** — Retry with exponential backoff, rate limiter, hash generation
- **Type-safe config** — `defineConfig()` helper with full IntelliSense

## Usage

```typescript
import { defineConfig, createDatabase, EventStore } from 'mahoraga-core';

// Type-safe configuration
const config = defineConfig({
  sources: [{ adapter: 'amplitude', apiKey: '...' }],
});

// SQLite storage (createDatabase returns a DatabaseManager)
const dbManager = createDatabase('.mahoraga/mahoraga.db');
const events = new EventStore(dbManager.db);

// Don't forget to close when done
dbManager.close();
```

## Test Factories

The `mahoraga-core/testing` subpath exports factories for writing tests:

```typescript
import {
  createEvent,
  createSession,
  createRageClickSequence,
  createErrorEvent,
  resetEventCounter,
} from 'mahoraga-core/testing';

const event = createEvent({ type: 'click' });
const session = createSession([{ type: 'click' }, { type: 'navigation' }]);
const rageClicks = createRageClickSequence('.btn-submit', 6);
const error = createErrorEvent('TypeError: Cannot read property');
```

## Requirements

Requires a build toolchain for the better-sqlite3 native addon (node-gyp, Python, C++ compiler).

## License

[MIT](https://github.com/thomasindrias/mahoraga/blob/main/LICENSE)
