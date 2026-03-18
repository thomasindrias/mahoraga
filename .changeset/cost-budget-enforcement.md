---
"mahoraga-agent": minor
"mahoraga-cli": patch
---

feat: cost budget enforcement

New `CostTracker` class enforces `maxCostPerRun` and `maxDispatchesPerRun` limits. Replaces the previous `.slice(0, N)` approach with a budget-aware dispatch loop that stops early when limits are reached.
