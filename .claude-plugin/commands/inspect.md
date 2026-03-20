---
description: Query stored Mahoraga events or detected issues
argument-hint: <events|issues>
allowed-tools: Bash(npx:*)
---

Run `npx mahoraga-cli inspect $ARGUMENTS` to query the local SQLite database.

Requires a subcommand:
- `events` — Show stored events and sessions
- `issues` — Show detected issue groups

If no argument was provided, ask the user whether they want to inspect `events` or `issues`.

After the command completes, summarize the data returned:
- For events: total count, date range, event types breakdown
- For issues: issue groups with severity, fingerprint, and affected elements
