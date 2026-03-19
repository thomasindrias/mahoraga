---
"mahoraga-core": minor
"mahoraga-cli": patch
"mahoraga-analyzer": patch
"mahoraga-sources": patch
---

Make better-sqlite3 an optional peer dependency in mahoraga-core

Consumers that only use schemas, types, and utilities no longer need better-sqlite3
installed. The native module is lazy-loaded via dynamic import() when createDatabase()
is called. createDatabase() is now async (returns Promise<DatabaseManager>).

Breaking: createDatabase() signature changed from sync to async. All existing call
sites must add `await`.
