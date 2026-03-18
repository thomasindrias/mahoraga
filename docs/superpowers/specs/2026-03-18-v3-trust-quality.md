# V3: Trust & Quality Spec

> Addendum to `2026-03-17-mahoraga-design.md`. Defines behavioral contracts for V3 features: configurable thresholds, URL normalization, false-positive suppression, cost budget enforcement, and PostHog adapter.

---

## 1. Configurable Rule Thresholds

### Problem

All 7 detection rules use hardcoded thresholds (e.g., `RAGE_CLICK_THRESHOLD = 3`, `MIN_SPIKE_COUNT = 5`). Different projects have different baselines. Users need to tune sensitivity without forking rules.

### Behavioral Contract

**Schema addition** (`AnalysisConfigSchema`):

```typescript
thresholds: z.object({
  'rage-clicks': z.object({
    clickCount: z.number().int().positive().default(3),
    windowMs: z.number().int().positive().default(1000),
  }).prefault({}),
  'error-spikes': z.object({
    spikeMultiplier: z.number().positive().default(2),
    minAbsoluteCount: z.number().int().positive().default(5),
  }).prefault({}),
  'dead-clicks': z.object({
    minClickCount: z.number().int().positive().default(5),
    minSessions: z.number().int().positive().default(2),
    waitMs: z.number().int().positive().default(2000),
  }).prefault({}),
  'form-abandonment': z.object({
    minAbandonRate: z.number().min(0).max(1).default(0.4),
    minSessions: z.number().int().positive().default(3),
  }).prefault({}),
  'slow-navigation': z.object({
    thresholdMs: z.number().int().positive().default(3000),
    minOccurrences: z.number().int().positive().default(3),
    minSessions: z.number().int().positive().default(2),
  }).prefault({}),
  'layout-shifts': z.object({
    minPoorEvents: z.number().int().positive().default(3),
    minSessions: z.number().int().positive().default(2),
  }).prefault({}),
  'error-loops': z.object({
    minOccurrences: z.number().int().positive().default(3),
    minSessions: z.number().int().positive().default(2),
  }).prefault({}),
}).prefault({})
```

**Context extension** (`AnalysisContext`):

```typescript
interface AnalysisContext {
  eventStore: EventStore;
  timeWindow: TimeRange;
  previousWindow: TimeRange;
  thresholds: RuleThresholds; // new
  routePatterns: string[];    // new (see section 2)
}
```

**Rule contract:** Each rule reads thresholds from `context.thresholds[ruleId]` instead of module-level constants. All existing hardcoded constants become default values — zero behavior change when thresholds are not configured.

### Testable Assertions

1. `RuleThresholdsSchema` parsed with empty object produces all defaults matching current hardcoded values.
2. `RuleThresholdsSchema` accepts partial overrides (e.g., only `'rage-clicks': { clickCount: 5 }`) — other fields use defaults.
3. `RuleThresholdsSchema` rejects invalid values (negative numbers, non-integers where integers required, rates > 1).
4. Rage-click rule with `clickCount: 5` requires 5 clicks instead of 3 to detect.
5. Rage-click rule with `windowMs: 500` uses 500ms window instead of 1000ms.
6. Error-spike rule with `spikeMultiplier: 5` requires 5x increase instead of 2x.
7. Error-spike rule with `minAbsoluteCount: 10` requires 10 errors instead of 5.
8. Dead-click rule with `minClickCount: 10` requires 10 dead clicks instead of 5.
9. Dead-click rule with `waitMs: 5000` uses 5000ms navigation timeout instead of 2000ms.
10. Form-abandonment rule with `minAbandonRate: 0.6` requires 60% rate instead of 40%.
11. Slow-navigation rule with `thresholdMs: 5000` only flags navigations > 5000ms.
12. Layout-shift rule with `minPoorEvents: 5` requires 5 poor CLS events instead of 3.
13. Error-loop rule with `minOccurrences: 5` requires 5 repetitions instead of 3.
14. All existing tests continue to pass unchanged (defaults match hardcoded values).

---

## 2. URL Normalization (Route Grouping)

### Problem

`/products/123` and `/products/456` are treated as different URLs. The slow-navigation and layout-shift rules fragment detections across dynamic routes, missing real patterns.

### Behavioral Contract

**Config addition** (`AnalysisConfigSchema`):

```typescript
routePatterns: z.array(z.string()).default([])
```

**Utility function** (`packages/core/src/utils/url.ts`):

```typescript
function normalizeUrl(url: string, routePatterns: string[]): string
```

**Algorithm:**
1. Parse the URL — extract pathname only (strip query params and hash).
2. Normalize trailing slashes: `/products/123/` becomes `/products/123`.
3. Split pathname by `/` into segments.
4. For each route pattern (in order):
   - Split pattern by `/` into pattern segments.
   - If segment counts differ, skip.
   - Compare segment by segment: pattern segments starting with `:` match any non-empty segment.
   - All literal segments must match exactly.
   - First matching pattern wins — return the pattern as the normalized URL.
5. No match: return the original pathname (stripped of query/hash).

**Context extension:** `routePatterns: string[]` added to `AnalysisContext`.

**Rule integration:**
- `slow-navigation.ts`: Normalize `payload.from` and `payload.to` before building the route pair key.
- `layout-shifts.ts`: Normalize `event.url` before grouping.

### Testable Assertions

1. `normalizeUrl('/products/123', ['/products/:id'])` returns `'/products/:id'`.
2. `normalizeUrl('/products/456', ['/products/:id'])` returns `'/products/:id'` (same as above — grouping works).
3. `normalizeUrl('/users/42/posts/99', ['/users/:userId/posts/:postId'])` returns `'/users/:userId/posts/:postId'`.
4. `normalizeUrl('/about', ['/products/:id'])` returns `'/about'` (no match, passthrough).
5. `normalizeUrl('/products/123?page=2', ['/products/:id'])` returns `'/products/:id'` (query stripped).
6. `normalizeUrl('/products/123#section', ['/products/:id'])` returns `'/products/:id'` (hash stripped).
7. `normalizeUrl('/products/123/', ['/products/:id'])` returns `'/products/:id'` (trailing slash normalized).
8. `normalizeUrl('/products', ['/products/:id'])` returns `'/products'` (segment count mismatch, no match).
9. `normalizeUrl('/products/123', [])` returns `'/products/123'` (empty patterns, passthrough).
10. First matching pattern wins when multiple could match.
11. Full URL with protocol (`https://example.com/products/123`) — extracts pathname, matches correctly.
12. Slow-navigation rule groups `/products/1->/details/1` and `/products/2->/details/2` as one issue when patterns `['/products/:id', '/details/:id']` provided.
13. Layout-shift rule groups events on `/products/1` and `/products/2` as one issue when pattern `/products/:id` provided.
14. Empty `routePatterns` preserves current literal-URL behavior (all existing tests pass).

---

## 3. False-Positive Suppression

### Problem

Without suppression, noisy rules erode trust. Users need to dismiss false positives permanently so they don't appear in subsequent runs.

### Behavioral Contract

**Migration (`002-suppressions`):**

```sql
CREATE TABLE suppressions (
  fingerprint TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  reason TEXT,
  suppressed_at INTEGER NOT NULL
);
CREATE INDEX idx_suppressions_rule ON suppressions(rule_id);
```

Applied via the existing migration framework in `001-initial.ts` — same file, new block checking for `'002-suppressions'` in `_migrations`.

**SuppressionStore class** (`packages/core/src/storage/suppressions.ts`):

```typescript
class SuppressionStore {
  constructor(db: Database)
  suppress(fingerprint: string, ruleId: string, reason?: string): void
  unsuppress(fingerprint: string): void
  isSuppressed(fingerprint: string): boolean
  filterSuppressed(fingerprints: string[]): Set<string>
  getAll(): Suppression[]
}
```

- `suppress()` — upsert (INSERT OR REPLACE). Idempotent.
- `unsuppress()` — DELETE by fingerprint. No-op if not found.
- `isSuppressed()` — returns `true` if fingerprint exists in table.
- `filterSuppressed()` — given an array of fingerprints, returns a `Set<string>` of those that are suppressed.
- `getAll()` — returns all rows as `{ fingerprint, ruleId, reason, suppressedAt }`.

**CLI command** (`mahoraga dismiss`):

- `mahoraga dismiss <fingerprint> [--reason "..."]` — Suppress an issue fingerprint.
- `mahoraga dismiss --list` — Show all active suppressions in a table.
- `mahoraga dismiss --undo <fingerprint>` — Remove suppression.
- Exit code 0 on success, 1 on error.

**Analyze integration:** After `engine.analyze()` returns issues and before dispatch/display:

```typescript
const suppressionStore = new SuppressionStore(dbManager.db);
const suppressed = suppressionStore.filterSuppressed(issues.map(i => i.fingerprint));
const activeIssues = issues.filter(i => !suppressed.has(i.fingerprint));
```

Suppressed issues are still persisted with status `'suppressed'` for audit trail. Only `activeIssues` proceed to dispatch or dry-run display. The console logs both active and suppressed counts.

### Testable Assertions

1. `suppress(fp, ruleId)` inserts a row; `isSuppressed(fp)` returns `true`.
2. `suppress(fp, ruleId)` called twice is idempotent (no error, row updated).
3. `suppress(fp, ruleId, reason)` stores the reason string.
4. `unsuppress(fp)` removes the row; `isSuppressed(fp)` returns `false`.
5. `unsuppress(fp)` on non-existent fingerprint is a no-op (no error).
6. `filterSuppressed([a, b, c])` where `a` is suppressed returns `Set(['a'])`.
7. `filterSuppressed([])` returns empty set.
8. `getAll()` returns all suppressions sorted by `suppressed_at` ascending.
9. Migration creates the `suppressions` table; re-running migration is safe.
10. Analyze flow: detected issue with suppressed fingerprint has status `'suppressed'` after persist.
11. Analyze flow: suppressed issues are excluded from dispatch list.
12. Analyze flow: suppressed issues are excluded from dry-run display.
13. CLI `dismiss <fp>`: prints confirmation message.
14. CLI `dismiss --list`: displays table of suppressions.
15. CLI `dismiss --undo <fp>`: prints removal confirmation.

---

## 4. Cost Budget Enforcement

### Problem

Config defines `maxCostPerRun` ($20) and `maxDispatchesPerRun` (5), but the CLI just does `.slice(0, N)` and ignores cost entirely. Unattended runs can blow past cost limits.

### Behavioral Contract

**CostTracker class** (`packages/agent/src/cost-tracker.ts`):

```typescript
class CostTracker {
  recordDispatch(costUsd: number): void
  canDispatch(maxCostPerRun: number, maxDispatchesPerRun: number): { allowed: boolean; reason?: string }
  getSummary(): { totalCostUsd: number; dispatchCount: number }
}
```

- `recordDispatch(costUsd)` — accumulates cost and increments count.
- `canDispatch(maxCostPerRun, maxDispatchesPerRun)`:
  - Returns `{ allowed: false, reason: "Cost budget exhausted ($X.XX/$Y.YY)" }` when accumulated cost >= `maxCostPerRun`.
  - Returns `{ allowed: false, reason: "Dispatch limit reached (N/M)" }` when count >= `maxDispatchesPerRun`.
  - Returns `{ allowed: true }` otherwise.
  - Cost check has priority over dispatch count check.
- `getSummary()` — returns current totals (for logging).

**CLI dispatch loop replacement** (replaces `.slice(0, N)` at line 174):

```typescript
const costTracker = new CostTracker();
for (const issue of actionableIssues) {
  const check = costTracker.canDispatch(config.agent.maxCostPerRun, config.agent.maxDispatchesPerRun);
  if (!check.allowed) {
    console.log(`Stopping dispatches: ${check.reason}`);
    break;
  }
  // ... dispatch issue ...
  costTracker.recordDispatch(result.costUsd ?? 1.0); // $1 fallback
}
```

**Best-effort cost:** The current `DispatchResult` type does not include a `costUsd` field. Until executors report cost, the fallback of $1.00 per dispatch is always used. This is conservative — better to stop early than overspend. A future version may add `costUsd?: number` to `DispatchResult`.

### Testable Assertions

1. Fresh `CostTracker` allows dispatch: `canDispatch(20, 5)` returns `{ allowed: true }`.
2. After recording $20, `canDispatch(20, 5)` returns `{ allowed: false, reason: /cost/i }`.
3. After recording $19.99, `canDispatch(20, 5)` returns `{ allowed: true }`.
4. After 5 dispatches of $1 each, `canDispatch(20, 5)` returns `{ allowed: false, reason: /dispatch limit/i }`.
5. After 4 dispatches, `canDispatch(20, 5)` returns `{ allowed: true }`.
6. Cost check takes priority: $21 after 2 dispatches with `canDispatch(20, 5)` → reason mentions cost, not dispatch limit.
7. `getSummary()` returns accurate totals after multiple recordings.
8. `recordDispatch(0)` is valid (zero-cost dispatch).

---

## 5. PostHog Adapter

### Problem

Only Amplitude is supported. PostHog is the most popular open-source analytics platform. Supporting it doubles the addressable audience.

### Behavioral Contract

**PostHog API details:**
- Auth: `Authorization: Bearer <personal-api-key>`
- Endpoint: `GET /api/projects/<project_id>/events`
- Default host: `https://app.posthog.com`
- Self-hosted: optional `host` field in source config
- Pagination: Response JSON has `next` URL (follow until `null`)
- Rate limits: 240/min — use existing `RateLimiter` from core

**Config extension** (`SourceConfigSchema`):

```typescript
// Existing fields: adapter, apiKey, secretKey, projectId
// PostHog uses: adapter='posthog', apiKey (personal API key), projectId
// Optional: host (for self-hosted, defaults to 'https://app.posthog.com')
```

`SourceConfigSchema` needs a `host` field added: `host: z.string().optional()`. Zod's `z.object()` strips unknown keys by default, so without this field, a user's `host` config would be silently dropped during validation.

**PostHogAdapter class** (`packages/sources/src/posthog/adapter.ts`):

```typescript
class PostHogAdapter implements SourceAdapter {
  readonly name = 'posthog';
  async validate(config: AdapterConfig): Promise<ValidationResult>
  async *pull(config: AdapterConfig, timeRange: TimeRange, cursor?: Cursor): AsyncIterable<PullBatch>
}
```

- `validate()`: Requires `apiKey` (string) and `projectId` (string).
- `pull()`: Fetches paginated events, transforms each, yields in batches of 1000.

**Transform function** (`packages/sources/src/posthog/transform.ts`):

```typescript
function transformPostHogEvent(raw: unknown): MahoragaEvent | null
```

**Event type mapping:**

| PostHog event | MahoragaEvent type |
|---|---|
| `$pageview` / `$pageleave` | `navigation` |
| `$autocapture` where `tag_name` is button/a | `click` |
| `$exception` / event name contains "error" | `error` |
| `$web_vitals` / properties contain metric fields | `performance` |
| Other | `custom` |

**Session ID resolution:** Prefer `$session_id` property, fall back to `distinct_id`.

**URL resolution:** Prefer `$current_url` property, fall back to `'unknown'`.

**Idempotency key:** `createIdempotencyKey('posthog', eventName, sessionId, timestamp, distinguishingField)`.

### Testable Assertions

**Transform tests:**
1. `$pageview` event transforms to `type: 'navigation'` with `to` from `$current_url`.
2. `$autocapture` with `tag_name: 'button'` transforms to `type: 'click'`.
3. `$exception` event transforms to `type: 'error'` with message from `$exception_message`.
4. `$web_vitals` event transforms to `type: 'performance'`.
5. Unknown event transforms to `type: 'custom'`.
6. Event with `$session_id` uses it as `sessionId`.
7. Event without `$session_id` falls back to `distinct_id`.
8. Event with missing required fields returns `null`.

**Contract tests (MSW):**
9. Sends Bearer auth header with API key.
10. Constructs correct URL with project ID and time range params.
11. Parses JSON response into MahoragaEvents.
12. Follows pagination: fetches `next` URL until `null`.
13. Yields empty for empty response.
14. Throws on non-200 response.
15. Uses custom `host` from config when provided.

**Validation tests:**
16. Valid config (apiKey + projectId) passes validation.
17. Missing apiKey fails validation.
18. Missing projectId fails validation.

---

## Consistency Notes

### Backwards Compatibility

All 5 items are backwards-compatible:
- Configurable thresholds: defaults match current hardcoded values.
- URL normalization: empty `routePatterns` = current behavior.
- Suppression: empty table = no filtering.
- Cost tracking: new behavior, but `.slice(0, N)` was already limiting dispatches.
- PostHog: additive — existing Amplitude adapter unchanged.

### AnalysisContext Changes

Both items 1 and 2 extend `AnalysisContext`. The combined interface becomes:

```typescript
interface AnalysisContext {
  eventStore: EventStore;
  timeWindow: TimeRange;
  previousWindow: TimeRange;
  thresholds: RuleThresholds;
  routePatterns: string[];
}
```

Both new fields have sensible defaults (all-default thresholds, empty array) so existing call sites only need minimal updates.

### Evidence Types

No new evidence types added in V3. Existing types remain:
- `'event_cluster'`, `'frequency_spike'`, `'abandonment_rate'`, `'slow_transitions'`, `'poor_cls'`, `'error_loop'`
