---
description: Run Mahoraga analysis (dry-run by default)
argument-hint: [--live]
allowed-tools: Bash(npx:*)
---

Run `npx mahoraga-cli analyze --dry-run` to preview detected UI issues without dispatching agents.

If the user passed `--live` as an argument, run `npx mahoraga-cli analyze` instead (full pipeline: pull, detect, dispatch, PR).

After the command completes, summarize:
- Number of events pulled
- Issues detected (severity, title, affected elements)
- Any errors or warnings

If the command fails, check for common issues:
- Missing `.mahoraga.env` credentials
- Missing `mahoraga.config.ts`
- Node version < 20
