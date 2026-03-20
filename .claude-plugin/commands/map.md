---
description: Rebuild Mahoraga code-to-event index
allowed-tools: Bash(npx:*)
---

Run `npx mahoraga-cli map` to rebuild the code-to-event index using AST-based analysis of the project's source files.

After the command completes, summarize:
- Number of source files scanned
- Components and selectors indexed
- Any warnings or errors

If the command fails, suggest:
- Ensuring the project has been built recently
- Checking that `mahoraga.config.ts` exists
- Verifying Node.js >= 20
