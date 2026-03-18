---
description: Map a CSS selector to its source file location
argument-hint: <selector>
allowed-tools: Bash(npx:*)
---

Run `npx mahoraga-cli map "$ARGUMENTS"` to resolve the CSS selector to its source file location using AST-based analysis.

Present the results showing:
- File path, line number, and column
- Component name (if resolved)
- Confidence level

If no results found, suggest:
- Checking the selector syntax
- Ensuring the project has been built recently
- Trying a more specific or less specific selector
