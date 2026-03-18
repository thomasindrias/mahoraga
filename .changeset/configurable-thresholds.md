---
"mahoraga-core": minor
"mahoraga-analyzer": minor
"mahoraga-cli": patch
---

feat: configurable rule thresholds

All 7 detection rules now read thresholds from `context.thresholds` instead of hardcoded constants. Configure via `analysis.thresholds` in `mahoraga.config.ts`. All defaults match previous hardcoded values — zero behavior change without configuration.
