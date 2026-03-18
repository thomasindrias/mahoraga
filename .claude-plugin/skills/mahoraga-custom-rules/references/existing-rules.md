# Existing Rule Patterns

Mahoraga ships with 7 built-in detection rules. Use these as reference when implementing custom rules.

## Rule Strategy Summary

| Rule | Strategy | Group By | Key Thresholds |
|------|----------|----------|----------------|
| rage-clicks | Sliding window | sessionId + selector | 3+ clicks in 1000ms |
| error-spikes | Window comparison | error message prefix | 2x ratio, 5+ count |
| dead-clicks | Click without response | selector | 5+ across 2+ sessions |
| form-abandonment | Outcome analysis | sessionId + formSelector | 40% abandon rate, 3+ sessions |
| slow-navigation | Duration threshold | route pair (from → to) | >3000ms, 3+ across 2+ sessions |
| layout-shifts | CLS metric | URL | rating='poor', 3+ across 2+ sessions |
| error-loops | Repetition in session | sessionId + message | 3+ per session, 2+ sessions |

## Pattern Details

### rage-clicks (Sliding Window)

**Query:** All `click` events in current time window.

**Grouping:** Group by `sessionId + selector`, then apply sliding window within each group (3+ clicks within 1000ms).

**Severity:** Based on session ratio — `affectedSessions / totalSessions`:
- >= 25%: critical
- >= 10%: high
- >= 5%: medium
- < 5%: low

**Evidence:** `event_cluster` with click timestamps and selectors.

### error-spikes (Window Comparison)

**Query:** All `error` events in both current and previous time windows.

**Grouping:** Group by error message prefix (first 100 characters).

**Severity:** Based on spike ratio and absolute count:
- >= 10x spike OR 100+ occurrences: critical
- >= 5x spike OR 50+ occurrences: high
- >= 3x spike OR 20+ occurrences: medium
- 2x spike AND 5+ occurrences: low

**Evidence:** `frequency_spike` with current vs. previous counts.

### dead-clicks (Click Without Response)

**Query:** All `click` and `navigation` events in current window.

**Detection:** Clicks without a navigation event within 2000ms on the same URL.

**Grouping:** Group by `selector`, filter for 5+ occurrences across 2+ sessions.

**Severity:** Based on affected session ratio (same as rage-clicks).

**Evidence:** `event_cluster` with dead click examples.

### form-abandonment (Outcome Analysis)

**Query:** All `form` events (focus, submit, abandon) in current window.

**Grouping:** Group by `sessionId + formSelector`, classify outcome per session (submit vs. abandon).

**Detection:** Abandon rate >= 40% AND 3+ abandon sessions.

**Severity:** Based on abandon rate:
- >= 80%: critical
- >= 60%: high
- >= 40%: medium
- < 40%: low

**Evidence:** `abandonment_rate` with submit/abandon counts.

### slow-navigation (Duration Threshold)

**Query:** All `navigation` events with duration > 3000ms in current window.

**Grouping:** Group by route pair (`fromUrl → toUrl` normalized via `normalizeUrl()`).

**Detection:** 3+ slow navigations across 2+ sessions.

**Severity:** Based on median duration:
- > 10s: critical
- > 7s: high
- > 5s: medium
- > 3s: low

**Evidence:** `slow_transitions` with duration samples.

### layout-shifts (CLS Metric)

**Query:** All `performance` events with metric='cls' and rating='poor' in current window.

**Grouping:** Group by normalized URL.

**Detection:** 3+ poor CLS events across 2+ sessions.

**Severity:** Based on average CLS value:
- >= 0.5: critical
- >= 0.25: high
- >= 0.1: medium
- < 0.1: low

**Evidence:** `poor_cls` with CLS values and URLs.

### error-loops (Repetition in Session)

**Query:** All `error` events in current window.

**Grouping:** Group by `sessionId + message prefix` (first 100 chars), detect 3+ identical errors within same session.

**Detection:** 2+ sessions with error loops.

**Severity:** Based on average loop count per session:
- >= 10: critical
- >= 7: high
- >= 5: medium
- >= 3: low

**Evidence:** `error_loop` with loop count and example sessions.

## Common Patterns Across Rules

1. **Configurable thresholds**: All rules read from `context.thresholds?.['rule-id']` with `??` fallback to `DEFAULT_*` constants. This lets users tune sensitivity without forking rules.
2. **Multi-level grouping**: First by session-level key, then aggregate across sessions
3. **Session threshold**: Most rules require 2+ affected sessions to avoid false positives
4. **Ratio-based severity**: Consistent 25%/10%/5% thresholds for critical/high/medium
5. **Evidence typing**: Match evidence type to detection strategy (spike, pattern, loop, etc.)
6. **Fingerprint composition**: Include stable identifiers (ruleId + selector/url/message prefix) for deduplication
7. **URL normalization**: slow-navigation and layout-shifts use `normalizeUrl(url, context.routePatterns)` to group dynamic URLs
