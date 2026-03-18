---
"mahoraga-sources": minor
"mahoraga-cli": patch
---

feat: PostHog source adapter

New `PostHogAdapter` pulls events from PostHog's API with pagination support, Bearer auth, and self-hosted instance support. Maps PostHog events ($pageview, $autocapture, $exception, $web_vitals) to MahoragaEvent types.
