---
"mahoraga-core": minor
"mahoraga-agent": minor
"mahoraga-cli": minor
---

OpenCode-first provider consolidation.

- Removed ClaudeCodeExecutor, APIAgentExecutor, and openai dependency
- Simplified config to opencode-only provider
- Removed v0.x OpenCode support
- Added NDJSON error event parsing
- Added file-change detection in adaptation loop
- Updated init workflow template for OpenCode + PAT_TOKEN
- Added .opencode.json scaffolding to init command
