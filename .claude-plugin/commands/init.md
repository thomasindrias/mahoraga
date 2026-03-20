---
description: Initialize Mahoraga in the current project
allowed-tools: Bash(npx:*)
---

Run `npx mahoraga-cli init` to start the interactive setup wizard.

This is an interactive command — it will prompt for analytics source selection and credentials.

After the command completes, summarize what was generated:
- `mahoraga.config.ts` — configuration file
- `.mahoraga.env` — credentials file (gitignored)
- `.gitignore` updates

If the command fails, check:
- Node.js >= 20
- Write permissions in the current directory
