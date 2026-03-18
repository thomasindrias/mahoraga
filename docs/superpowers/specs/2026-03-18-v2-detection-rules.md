# V2: Detection Rules & Hardening Spec

> Addendum to `2026-03-17-mahoraga-design.md`. Defines behavioral contracts for V2 detection rules, the `create-rule` scaffold command, and agent/CLI hardening targets.

---

## 1. New Detection Rules

All rules implement the existing `DetectionRule` interface from `rule.ts`. Each receives an `AnalysisContext` with `eventStore`, `timeWindow`, and `previousWindow`.

### 1.1 Dead Click Detector

**ID:** `dead-clicks`

**Behavior:** Detects clicks on elements that never trigger navigation or form submission within 2 seconds. These indicate non-responsive UI elements that frustrate users.

**Input:** `EventType: 'click'` and `EventType: 'navigation'` events from the current time window.

**Detection Logic:**
1. Query all click events in the time window.
2. For each click event, check if any navigation event follows within 2000ms from the same session.
3. Clicks without a subsequent navigation are "dead clicks."
4. Group dead clicks by `selector`.

**Grouping Key:** `selector`

**Thresholds:**
- Minimum 5 dead clicks on the same selector
- Across at least 2 distinct sessions

**Severity Mapping:** Based on ratio of sessions with dead clicks to total sessions:
- `>= 25%` → `critical`
- `>= 10%` → `high`
- `>= 5%` → `medium`
- `< 5%` → `low`

**Fingerprint:** `createFingerprint('dead-clicks', selector, url)`

**Edge Cases:**
- Clicks followed by navigation within 2s are NOT dead clicks (even if on a different URL).
- Single dead click sessions are counted but do not trigger an issue unless the session threshold is met.
- Clicks on elements that trigger form submissions are NOT dead clicks (out of scope for V1 — form events are separate).

---

### 1.2 Form Abandonment Detector

**ID:** `form-abandonment`

**Behavior:** Detects forms with high abandonment rates. A form is "abandoned" when a session contains a form event with `action='abandon'` without a corresponding `action='submit'` for the same `formSelector`.

**Input:** `EventType: 'form'` events from the current time window.

**Detection Logic:**
1. Query all form events in the time window.
2. Group by `(sessionId, formSelector)`.
3. For each group, determine outcome: if any event has `action='submit'`, it's a submit; if any has `action='abandon'` without a submit, it's an abandon.
4. Aggregate across sessions: for each `formSelector`, count abandon sessions and submit sessions.
5. Abandonment rate = `abandon_sessions / (abandon_sessions + submit_sessions)`.

**Grouping Key:** `formSelector`

**Thresholds:**
- Minimum 3 abandon sessions
- Abandonment rate >= 40%

**Severity Mapping:** Based on abandonment rate:
- `>= 80%` → `critical`
- `>= 60%` → `high`
- `>= 40%` → `medium`

**Fingerprint:** `createFingerprint('form-abandonment', formSelector)`

**Edge Cases:**
- Sessions with only `focus`/`blur` events (no abandon or submit) are ignored.
- A session with both `abandon` and `submit` for the same form counts as a submit (user retried and succeeded).
- Forms with 0 submits but >= 3 abandons have rate = 100% → `critical`.

---

### 1.3 Slow Navigation Detector

**ID:** `slow-navigation`

**Behavior:** Detects route transitions that consistently take too long (> 3000ms). Indicates performance problems on specific routes.

**Input:** `EventType: 'navigation'` events with `duration` present in the current time window.

**Detection Logic:**
1. Query all navigation events in the time window.
2. Filter to events where `duration` is defined and `duration > 3000`.
3. Group by route pair: `${from}->${to}`.
4. For each route pair, collect all slow navigation durations.

**Grouping Key:** `${from}->${to}` (route pair string)

**Thresholds:**
- Minimum 3 slow navigations on the same route pair
- Across at least 2 distinct sessions

**Severity Mapping:** Based on median duration of slow navigations:
- `> 10000ms` → `critical`
- `> 7000ms` → `high`
- `> 5000ms` → `medium`
- `<= 5000ms` → `low`

**Fingerprint:** `createFingerprint('slow-navigation', routePair)`

**Edge Cases:**
- Navigation events without `duration` field are skipped entirely.
- Fast navigations (duration <= 3000ms) are not counted.
- The `from` and `to` are compared as-is (no URL normalization).

---

### 1.4 Layout Shift Detector

**ID:** `layout-shifts`

**Behavior:** Detects pages with consistently poor Cumulative Layout Shift (CLS) scores. Uses Web Vitals performance events.

**Input:** `EventType: 'performance'` events where `metric === 'CLS'` and `rating === 'poor'` from the current time window.

**Detection Logic:**
1. Query all performance events in the time window.
2. Filter to events where `metric === 'CLS'` and `rating === 'poor'`.
3. Group by `url`.
4. For each URL, collect all CLS values.

**Grouping Key:** `url`

**Thresholds:**
- Minimum 3 poor CLS readings
- Across at least 2 distinct sessions

**Severity Mapping:** Based on average CLS value:
- `>= 0.5` → `critical`
- `>= 0.25` → `high`
- `>= 0.1` → `medium`
- `< 0.1` → `low`

**Fingerprint:** `createFingerprint('layout-shifts', url)`

**Edge Cases:**
- Only `rating === 'poor'` events are considered. `'good'` and `'needs-improvement'` are ignored.
- Non-CLS metrics (LCP, FID, INP, etc.) are ignored.
- URLs are compared as-is (no normalization).

---

### 1.5 Error Loop Detector

**ID:** `error-loops`

**Behavior:** Detects sessions where the same error repeats 3+ times, indicating users stuck in an error loop. Distinct from error-spikes (which detect temporal trends across windows); error-loops detect within-session repetition.

**Input:** `EventType: 'error'` events from the current time window.

**Detection Logic:**
1. Query all error events in the time window.
2. Group by `(sessionId, messagePrefix)` where `messagePrefix` = first 100 characters of `message` (consistent with error-spikes).
3. For each group, count occurrences. Groups with count >= 3 are "loops."
4. Aggregate: for each `messagePrefix`, count distinct sessions with loops.

**Grouping Key:** `messagePrefix` (first 100 chars of error message)

**Thresholds:**
- Minimum 3 repetitions of the same error within a single session
- At least 2 distinct sessions experiencing loops with the same error

**Severity Mapping:** Based on average loop count across affected sessions:
- `>= 10` → `critical`
- `>= 7` → `high`
- `>= 5` → `medium`
- `< 5` → `low`

**Fingerprint:** `createFingerprint('error-loops', messagePrefix)`

**Edge Cases:**
- Different errors in the same session are tracked separately.
- An error occurring twice in a session does NOT qualify as a loop (threshold is 3).
- A single session with a loop does NOT trigger an issue (need >= 2 sessions).

---

## 2. Create-Rule Scaffold Command

**Command:** `mahoraga create-rule`

**Behavior:** Interactive command that scaffolds a custom detection rule with boilerplate code and tests.

### Interactive Prompts

1. **Rule name** (text) — Human-readable name, e.g., "Broken Image Detector"
2. **Rule ID** (text, auto-generated from name as kebab-case) — e.g., `broken-image-detector`
3. **Description** (text) — What the rule detects
4. **Event types** (multi-select from: click, error, navigation, performance, form, custom) — Which event types the rule consumes

### Generated Files

1. **Rule class file** (`{id}.ts`):
   - Implements `DetectionRule` interface
   - Includes `id`, `name`, `description`, `requiredEventTypes`
   - Stub `analyze()` method with TODO comments
   - JSDoc on class and method

2. **Test file** (`{id}.test.ts`):
   - Imports from `vitest` (explicit, not global)
   - Imports the rule class
   - Includes `describe` block with stub test
   - Follows existing test patterns from `analyzer.test.ts`

### Output

After generating files, print next steps:
1. Export from `packages/analyzer/src/index.ts`
2. Register in `mahoraga.config.ts` rules array
3. Add switch case in `packages/cli/src/commands/analyze.ts`

### Programmatic API

Export `runCreateRule(outputDir, options)` for testing. `options` has: `name`, `id`, `description`, `eventTypes`.

---

## 3. Hardening Targets

### Agent Package (`mahoraga-agent`)

**Target:** >= 80% line coverage

**Error paths to cover:**
- Governance boundary: `runCostSoFar` exactly equals `maxCostPerRun` (denied)
- Governance boundary: `runCostSoFar` one cent below `maxCostPerRun` (allowed)
- `checkDiffSize` with `diffLineCount` exactly equal to `maxDiffLines` (allowed, uses `>` not `>=`)
- `checkDiffSize` with 0 lines (allowed)
- `checkDiffPaths` with empty `diffFiles` array (allowed)
- `checkDiffPaths` when file matches both allowed and denied paths (denied — denied takes precedence)
- `checkGovernance` with unknown severity (defaults to 0.5 confidence)
- Adaptation loop: `maxRetries = 0` with failing test (fails after 1 attempt)
- Adaptation loop: agent always fails (all attempt errors recorded)
- Adaptation loop: `testRunner` throws exception (caught and recorded)
- Test generator: unknown `ruleId` (generates generic test)
- Test generator: empty `affectedElements` (handles gracefully)
- Test generator: special characters in issue title (escaped)
- Dispatcher: empty issues array (returns error status immediately)

### CLI Package (`mahoraga-cli`)

**Target:** >= 80% line coverage (or highest achievable)

**Areas to cover:**
- `parseEnvFile` extraction and testing (key=value parsing, comments, empty lines, equals in values)
- Coverage thresholds raised to match actual coverage minus 2% margin

---

## 4. Consistency Notes

### Event Payload Types (from `core/schemas/event.ts`)

All payload types used by V2 rules already exist in the schema:
- `NavigationPayload`: `{ type: 'navigation', from: string, to: string, duration?: number }`
- `FormPayload`: `{ type: 'form', formSelector: string, action: 'focus' | 'blur' | 'submit' | 'abandon', fieldSelector?: string, duration?: number }`
- `PerformancePayload`: `{ type: 'performance', metric: string, value: number, rating: 'good' | 'needs-improvement' | 'poor' }`
- `ErrorPayload`: `{ type: 'error', message: string, stack?: string, componentName?: string, frequency: number }`
- `ClickPayload`: `{ type: 'click', selector: string, text?: string, coordinates: { x, y }, isRageClick: boolean }`

### Severity Conventions

All rules use the same severity type: `'critical' | 'high' | 'medium' | 'low'` (from `SeveritySchema`).

### Fingerprint Pattern

All rules use `createFingerprint(ruleId, ...distinguishingFields)` from `mahoraga-core`. This produces a deterministic SHA-256 hash for deduplication.

### Evidence Types

Evidence `type` field values used across rules:
- `'event_cluster'` — rage clicks, dead clicks
- `'frequency_spike'` — error spikes
- V2 additions: `'abandonment_rate'`, `'slow_transitions'`, `'poor_cls'`, `'error_loop'`
