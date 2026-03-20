---
description: Clean up expired Mahoraga data
allowed-tools: Bash(npx:*)
---

Run `npx mahoraga-cli gc` to delete expired events from the local SQLite database.

Retention period is configured via `storage.retentionDays` in `mahoraga.config.ts` (default: 30 days).

After the command completes, summarize:
- Number of expired events deleted
- Current database size (if reported)

If the command fails, check that `mahoraga.config.ts` exists in the current directory.
