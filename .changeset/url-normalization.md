---
"mahoraga-core": minor
"mahoraga-analyzer": minor
"mahoraga-cli": patch
---

feat: URL normalization with route patterns

New `normalizeUrl()` utility groups dynamic URLs (e.g., `/products/123` and `/products/456`) using configurable route patterns. Integrated into slow-navigation and layout-shift rules. Configure via `analysis.routePatterns` in `mahoraga.config.ts`.
