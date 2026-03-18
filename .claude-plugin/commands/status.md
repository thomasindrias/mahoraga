---
description: Check Mahoraga pipeline status and recent runs
allowed-tools: Bash(npx:*)
---

Run `npx mahoraga-cli status` to show pipeline run history.

Summarize the output:
- Last run timestamp and outcome (completed/failed)
- Events pulled and issues detected
- PRs created
- Any errors from recent runs

If no runs exist, suggest running `npx mahoraga-cli analyze --dry-run` first.
