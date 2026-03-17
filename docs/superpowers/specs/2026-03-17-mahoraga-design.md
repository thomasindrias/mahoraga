# Mahoraga — Self-Evolving Frontend Intelligence

> Named after the Jujutsu Kaisen character that adapts and evolves after every encounter.

## 1. Overview

Mahoraga is an npm monorepo that ingests user behavior data from existing analytics platforms, identifies UI issues through automated analysis, and dispatches Claude Code agents to fix them — creating pull requests automatically.

It is **not** a tracker. Trackers already exist (Amplitude, PostHog, Sentry, Mixpanel, GA4). Mahoraga is the **brain** that sits on top of existing data and turns behavioral signals into code improvements.

### Core Pipeline

```
Sources (Amplitude, PostHog, Sentry, ...)
    ↓ pull via API adapters
Normalize (common MahoragaEvent schema)
    ↓ persist to SQLite
Analyze (pluggable detection rules)
    ↓ produce Issue reports
Dispatch (Claude Code CLI with skills, CLAUDE.md, MCPs)
    ↓ create PR with plan + fix
Human Review → Merge
```

### Design Principles

- **Spec-driven, TDD**: Every feature starts as a spec, becomes tests, then implementation
- **Framework-agnostic TypeScript**: Core logic is vanilla TS; framework adapters are optional
- **Privacy-first**: Anonymous session-based data only, no user identification
- **Idempotent**: Hash-based event deduplication, safe to re-run
- **Pluggable**: Source adapters and detection rules are extension points
- **Human-in-the-loop**: PRs are created for review, never auto-merged
- **JSDoc everywhere**: All public interfaces, types, and functions documented with JSDoc for AI readability and TypeDoc generation

---

## 2. Monorepo Structure

**Tooling:** Turborepo + pnpm workspaces + Vitest + tsup

```
mahoraga/
├── packages/
│   ├── core/                     # @mahoraga/core
│   │   ├── src/
│   │   │   ├── schemas/          # Zod schemas (events, issues, config)
│   │   │   ├── types/            # TypeScript interfaces
│   │   │   ├── storage/          # SQLite manager, migrations, queries
│   │   │   ├── utils/            # Hashing, dedup, rate limiter, retry
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── __fixtures__/
│   │   ├── tsup.config.ts
│   │   ├── vitest.config.ts
│   │   └── package.json
│   ├── mapper/                   # @mahoraga/mapper
│   │   ├── src/
│   │   │   ├── code-mapper.ts    # CodeMapper interface + implementation
│   │   │   ├── ast-scanner.ts    # TSX/JSX AST parser for selectors
│   │   │   ├── route-scanner.ts  # React Router / Next.js route resolver
│   │   │   ├── index-builder.ts  # Builds .mahoraga/code-map.json cache
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── __fixtures__/
│   │   ├── tsup.config.ts
│   │   ├── vitest.config.ts
│   │   └── package.json
│   ├── sources/                  # @mahoraga/sources
│   │   ├── src/
│   │   │   ├── adapter.ts        # SourceAdapter interface
│   │   │   ├── amplitude/        # Amplitude adapter
│   │   │   ├── posthog/          # PostHog adapter
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── __fixtures__/         # Recorded API responses
│   │   ├── tsup.config.ts
│   │   ├── vitest.config.ts
│   │   └── package.json
│   ├── analyzer/                 # @mahoraga/analyzer
│   │   ├── src/
│   │   │   ├── engine.ts         # Analysis pipeline orchestrator
│   │   │   ├── rule.ts           # DetectionRule interface
│   │   │   ├── rules/
│   │   │   │   ├── rage-clicks.ts
│   │   │   │   └── error-spikes.ts
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── __fixtures__/
│   │   ├── tsup.config.ts
│   │   ├── vitest.config.ts
│   │   └── package.json
│   ├── agent/                    # @mahoraga/agent
│   │   ├── src/
│   │   │   ├── dispatcher.ts     # Agent orchestration
│   │   │   ├── prompt-builder.ts # Structured prompt construction
│   │   │   ├── pr-creator.ts     # Git branch + PR management
│   │   │   ├── executor.ts       # AgentExecutor interface (real + mock)
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── tsup.config.ts
│   │   ├── vitest.config.ts
│   │   └── package.json
│   └── cli/                      # @mahoraga/cli (bin: mahoraga)
│       ├── src/
│       │   ├── commands/
│       │   │   ├── analyze.ts    # Full pipeline
│       │   │   ├── init.ts       # Interactive setup
│       │   │   ├── inspect.ts    # Debug/query local data
│       │   │   └── status.ts     # Show run history
│       │   └── index.ts
│       ├── __tests__/
│       ├── tsup.config.ts
│       ├── vitest.config.ts
│       └── package.json
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.workspace.ts
├── .eslintrc.js                  # Includes eslint-plugin-jsdoc
└── package.json
```

### Package Dependency Graph

```
cli → agent → analyzer → sources → core
        ↓        ↓           ↓
      mapper    core        core
        ↓
       core
```

`@mahoraga/core` is the leaf dependency. All packages depend on it for shared types, schemas, storage, and utilities. `@mahoraga/agent` also depends on `@mahoraga/mapper` to resolve selectors to source locations before dispatching fixes.

---

## 3. Normalized Event Schema (`@mahoraga/core`)

All source adapters normalize their data into this common schema. The analyzer only works against this format.

```typescript
/**
 * Normalized event from any analytics source.
 * All source adapters must transform their native format into this schema.
 * Validated by Zod at the ingestion boundary.
 */
interface MahoragaEvent {
  /** Idempotency key — deterministic hash of (source, rawEventType, sessionId, timestamp, selector/message) */
  id: string;
  /** Schema version for forward compatibility */
  schemaVersion: 1;
  /** Ephemeral session identifier — anonymous, no user correlation */
  sessionId: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Normalized event type */
  type: EventType;
  /** Page URL where the event occurred */
  url: string;
  /** Type-specific payload */
  payload: EventPayload;
  /** Source provenance metadata */
  metadata: {
    /** Which adapter produced this event */
    source: string;
    /** Original event name in the source platform */
    rawEventType: string;
  };
}

/** Supported event types */
type EventType = 'click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom';

/** Discriminated union of payloads by event type */
type EventPayload =
  | ClickPayload
  | ErrorPayload
  | NavigationPayload
  | PerformancePayload
  | FormPayload
  | CustomPayload;

/** Click interaction data */
interface ClickPayload {
  type: 'click';
  /** CSS selector of the clicked element */
  selector: string;
  /** Visible text content of the element */
  text?: string;
  /** Click coordinates relative to viewport */
  coordinates: { x: number; y: number };
  /** Whether this click is part of a rage-click sequence */
  isRageClick: boolean;
}

/** JavaScript error data */
interface ErrorPayload {
  type: 'error';
  /** Error message */
  message: string;
  /** Stack trace if available */
  stack?: string;
  /** Framework component name if available */
  componentName?: string;
  /** Number of unique sessions that hit this error */
  frequency: number;
}

/** Page navigation data */
interface NavigationPayload {
  type: 'navigation';
  /** Previous URL */
  from: string;
  /** New URL */
  to: string;
  /** Time to navigate in milliseconds */
  duration?: number;
}

/** Performance metric data */
interface PerformancePayload {
  type: 'performance';
  /** Metric name (LCP, FID, CLS, TTFB, etc.) */
  metric: string;
  /** Metric value */
  value: number;
  /** Rating: good, needs-improvement, poor */
  rating: 'good' | 'needs-improvement' | 'poor';
}

/** Form interaction data */
interface FormPayload {
  type: 'form';
  /** CSS selector of the form */
  formSelector: string;
  /** Action taken */
  action: 'focus' | 'blur' | 'submit' | 'abandon';
  /** Field selector (for focus/blur) */
  fieldSelector?: string;
  /** Time spent on form in ms (for abandon/submit) */
  duration?: number;
}

/** User-defined custom event */
interface CustomPayload {
  type: 'custom';
  /** Custom event name */
  name: string;
  /** Arbitrary properties */
  properties: Record<string, unknown>;
}
```

### Idempotency

The `id` field is a deterministic SHA-256 hash of `(source, rawEventType, sessionId, timestamp, distinguishing_payload_field)`. This guarantees:
- Re-pulling the same time range deduplicates automatically
- The same event from different sources would NOT dedup (different `source` value)
- Hash collisions are effectively impossible at our scale

### Schema Validation

Every event entering the pipeline passes through a Zod schema validator at the ingestion boundary. Events that fail validation are logged and skipped — never silently dropped, never crash the pipeline.

---

## 4. Storage Layer (`@mahoraga/core/storage`)

### Technology: SQLite via `better-sqlite3`

SQLite is the right choice because:
- Zero configuration — single file, no server
- CLI-friendly — works anywhere Node.js runs
- Handles millions of rows efficiently with proper indexes
- Atomic writes prevent corruption on crash
- WAL mode enables concurrent reads during writes

### Schema

```sql
-- Normalized events from all sources
CREATE TABLE events (
  id TEXT PRIMARY KEY,           -- Idempotency hash
  schema_version INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,          -- 'amplitude', 'posthog', etc.
  event_type TEXT NOT NULL,      -- 'click', 'error', etc.
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,    -- Unix ms
  url TEXT NOT NULL,
  payload JSON NOT NULL,
  metadata JSON NOT NULL,
  ingested_at INTEGER NOT NULL   -- When this event was stored
);

-- Checkpoint state per source adapter
CREATE TABLE checkpoints (
  source TEXT PRIMARY KEY,
  cursor TEXT NOT NULL,          -- Adapter-specific cursor/timestamp
  last_pulled_at INTEGER NOT NULL
);

-- Detected issue groups
CREATE TABLE issue_groups (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  fingerprint TEXT UNIQUE NOT NULL,  -- Dedup key for the same issue across runs
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence JSON NOT NULL,
  affected_elements JSON NOT NULL,
  frequency INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'detected',  -- detected | dispatched | pr_created | no_fix | cooldown
  pr_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Run history for observability
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  events_pulled INTEGER DEFAULT 0,
  issues_detected INTEGER DEFAULT 0,
  prs_created INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',  -- running | completed | failed
  errors JSON DEFAULT '[]'
);

-- Indexes for query performance
CREATE INDEX idx_events_session ON events(session_id, timestamp);
CREATE INDEX idx_events_type_time ON events(event_type, timestamp);
CREATE INDEX idx_events_source_time ON events(source, timestamp);
CREATE INDEX idx_issue_groups_status ON issue_groups(status);
```

### Data Retention

Configurable `retentionDays` (default: 30). The CLI runs cleanup at the start of each `analyze` command:
```sql
DELETE FROM events WHERE timestamp < ?
```

Also available as `mahoraga gc` for manual cleanup.

### Migrations

Embedded migrations that run on first connection. Version tracked in a `_migrations` table. Forward-only, no rollbacks — if schema changes, write a new migration.

---

## 5. Source Adapters (`@mahoraga/sources`)

### Interface

```typescript
/**
 * A source adapter pulls events from an external analytics platform
 * and normalizes them into MahoragaEvent format.
 */
interface SourceAdapter {
  /** Unique adapter identifier */
  readonly name: string;

  /**
   * Pull events from the source for a given time range.
   * Yields batches of normalized events for incremental processing.
   * The runner persists each batch and updates the checkpoint.
   *
   * @param config - Adapter-specific configuration (API keys, project IDs)
   * @param timeRange - Start/end timestamps to pull
   * @param cursor - Last known checkpoint for resume-from-failure
   * @returns AsyncIterable of event batches
   */
  pull(
    config: AdapterConfig,
    timeRange: TimeRange,
    cursor?: Cursor
  ): AsyncIterable<PullBatch>;

  /**
   * Validate that the adapter configuration is correct.
   * Checks API key validity, project existence, permissions, etc.
   *
   * @param config - Adapter-specific configuration to validate
   * @returns Validation result with any error details
   */
  validate(config: AdapterConfig): Promise<ValidationResult>;
}

/**
 * A batch of events with checkpoint state for resume-from-failure.
 */
interface PullBatch {
  /** Normalized events in this batch */
  events: MahoragaEvent[];
  /** Updated cursor to persist after this batch is stored */
  cursor: Cursor;
}

/**
 * Result of a full pull operation after the runner processes all batches.
 */
type PullResult =
  | { status: 'ok'; eventCount: number }
  | { status: 'partial'; eventCount: number; error: Error }
  | { status: 'failed'; error: Error };
```

### Pipeline Runner Responsibilities

The runner (in `@mahoraga/core`) wraps adapter calls with:
- **Zod validation** on each event at the ingestion boundary
- **Retry logic** with exponential backoff + jitter (3 retries, 1s/4s/16s)
- **Rate limiter** utility shared across adapters
- **Checkpoint persistence** after each batch (not after full pull)
- **Deduplication** via hash-based INSERT OR IGNORE
- **Sanitization boundary** that strips fields not in the schema

### V1 Adapters

**Amplitude** (Export API):
- Auth: HTTP Basic (API key + secret)
- Pull: `GET /api/2/export?start=<YYYYMMDDTHHmm>&end=<YYYYMMDDTHHmm>`
- Pagination: Time-range splitting (max 365 days, 4GB per request)
- Rate limits: 4 concurrent, 12/min
- Cursor: Last exported timestamp

**PostHog** (Query API):
- Auth: Bearer token (Personal API key)
- Pull: `POST /api/events/query` with timestamp filters
- Pagination: Cursor-based (`next` URL)
- Rate limits: 240/min, 2400/hr
- Cursor: Last event timestamp from cursor-based pagination

### Credential Resolution

Three-tier, in priority order:
1. **Environment variables**: `MAHORAGA_AMPLITUDE_API_KEY`, `MAHORAGA_AMPLITUDE_SECRET_KEY`, etc.
2. **`.mahoraga.env`** file (gitignored): dotenv-compatible, loaded at CLI startup
3. **Config file**: `mahoraga.config.ts` can reference `process.env` for dynamic resolution

Never stored in SQLite or config objects at rest.

---

## 6. Analyzer & Detection Rules (`@mahoraga/analyzer`)

### Detection Rule Interface

```typescript
/**
 * A detection rule analyzes normalized events to identify UI issues.
 * Rules are pluggable — implement this interface to add new detection capabilities.
 */
interface DetectionRule {
  /** Unique rule identifier */
  readonly id: string;
  /** Human-readable rule name */
  readonly name: string;
  /** What this rule detects */
  readonly description: string;
  /** Event types this rule needs — used to optimize queries */
  readonly requiredEventTypes: EventType[];

  /**
   * Analyze events within the given time window and return detected issues.
   * Rules query SQLite directly for the events they need — no in-memory loading.
   *
   * @param context - Analysis context with storage access and time window
   * @returns Array of detected issues
   */
  analyze(context: AnalysisContext): Promise<Issue[]>;
}

/**
 * Provided to each rule during analysis.
 */
interface AnalysisContext {
  /** Query events from storage */
  storage: StorageReader;
  /** Time window for this analysis run */
  timeWindow: TimeRange;
  /** Previous analysis window for comparison (e.g., detecting spikes) */
  previousWindow: TimeRange;
}

/**
 * A detected UI issue with evidence and affected elements.
 */
interface Issue {
  /** Auto-generated unique ID */
  id: string;
  /** Which rule detected this */
  ruleId: string;
  /** Fingerprint for deduplication across runs */
  fingerprint: string;
  /** Impact severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Short title describing the issue */
  title: string;
  /** Detailed analysis with evidence summary */
  description: string;
  /** Raw evidence data points */
  evidence: Evidence[];
  /** CSS selectors, URLs, component names affected */
  affectedElements: ElementRef[];
  /** Hint for the agent about what to fix */
  suggestedAction?: string;
  /** Number of unique sessions affected */
  frequency: number;
}

/**
 * A single data point supporting an issue detection.
 */
interface Evidence {
  /** What kind of evidence */
  type: 'event_cluster' | 'frequency_spike' | 'pattern_match';
  /** Human-readable description */
  description: string;
  /** Relevant events (summary, not full payload) */
  eventSummaries: EventSummary[];
}

/**
 * Reference to a UI element affected by an issue.
 */
interface ElementRef {
  /** CSS selector */
  selector: string;
  /** Page URL where this element appears */
  url: string;
  /** Framework component name if known */
  componentName?: string;
}
```

### V1 Detection Rules

#### Rage Click Detector
- **Signal:** 3+ clicks on the same element within 1 second, within a single session
- **Query:** Events where `type = 'click'`, grouped by `(session_id, selector)`, windowed by 1-second intervals
- **Severity:** Based on frequency — high if >10% of sessions, critical if >25%
- **Fingerprint:** Hash of `(rule_id, selector, url)`

#### Error Spike Detector
- **Signal:** JS errors that spiked in the current window vs. the previous window
- **Query:** Events where `type = 'error'`, grouped by `(message)`, compare count in `timeWindow` vs `previousWindow`
- **Severity:** Based on spike ratio and absolute frequency
- **Fingerprint:** Hash of `(rule_id, message_prefix, url)`

### Future Rules (Specced Interface, Not Implemented in V1)
- **Dead Click Detector**: Clicks on non-interactive elements
- **Form Abandonment Detector**: Forms started but not submitted
- **Slow Navigation Detector**: Page transitions exceeding thresholds
- **Layout Shift Detector**: High CLS scores on specific pages
- **Error Loop Detector**: Users repeatedly hitting the same error

These all implement `DetectionRule` — no changes to the pipeline needed.

---

## 7. Agent Dispatcher (`@mahoraga/agent`)

### Architecture

```typescript
/**
 * Orchestrates Claude Code agent invocations to fix detected issues.
 * Groups related issues, constructs prompts, manages git workflow.
 */
interface AgentDispatcher {
  /**
   * Dispatch agent to fix a group of related issues.
   * Creates a branch, invokes Claude Code, and opens a PR.
   *
   * @param issueGroup - Related issues to fix together
   * @param config - Agent configuration (skills, MCPs, guardrails)
   * @returns Result of the dispatch operation
   */
  dispatch(issueGroup: IssueGroup, config: AgentConfig): Promise<DispatchResult>;
}

/**
 * Configuration for the Claude Code agent.
 */
interface AgentConfig {
  /** Agent provider — multi-model support for cost optimization */
  provider: 'claude-code' | 'gemini' | 'openai';

  /** Path to CLAUDE.md with project conventions */
  claudeMdPath?: string;
  /** Path to AGENTS.md with agent instructions */
  agentMdPath?: string;
  /** Skills to invoke (e.g., 'writing-plans', 'frontend-design') */
  skills?: string[];
  /** MCP servers to enable */
  mcpServers?: string[];

  /** Agent always plans before implementing */
  workflow: 'plan-then-implement';

  /** Git configuration */
  createPR: boolean;
  baseBranch: string;
  draftPR: boolean; // default: true

  /** Blast radius control — glob patterns for allowed/denied paths */
  allowedPaths: string[];   // e.g., ['src/components/**', 'src/pages/**']
  deniedPaths: string[];    // e.g., ['src/auth/**', 'src/payments/**']

  /** Minimum confidence score (0-1) to dispatch agent. Below threshold → GitHub issue instead of PR */
  confidenceThreshold: number; // default: 0.7

  /** Cost guardrails */
  maxCostPerIssue: number;   // default: $2
  maxCostPerRun: number;     // default: $20
  maxDispatchesPerRun: number; // default: 5
  timeoutMs: number;         // default: 300_000 (5 min)

  /** Adaptation loop configuration */
  maxRetries: number;        // default: 3

  /** Post-agent validation */
  postChecks: {
    build: boolean;    // Run build command after fix
    test: boolean;     // Run tests after fix
    maxDiffLines: number; // Reject diffs larger than this (default: 500)
  };
}

/**
 * Result of an agent dispatch operation.
 */
interface DispatchResult {
  /** Issues addressed in this dispatch */
  issueIds: string[];
  /** Outcome of the dispatch */
  status: 'pr_created' | 'no_fix_found' | 'build_failed' | 'diff_too_large' | 'timeout' | 'cost_exceeded' | 'error';
  /** PR URL if created */
  prUrl?: string;
  /** Branch name used */
  branchName?: string;
  /** Human-readable summary of what happened */
  summary: string;
  /** Cost in USD for this dispatch */
  costUsd?: number;
  /** Number of adaptation loop attempts before success/failure */
  adaptationAttempts: number;
  /** Path to generated test file (if adaptation loop created one) */
  generatedTestPath?: string;
}
```

### Agent Workflow

1. **Issue Grouping:** Related issues (same page, same component) are grouped together. One PR per group.
2. **Worktree Isolation:** Agent operates in a fresh git worktree. `main` is never directly modified.
3. **Prompt Construction:** The `PromptBuilder` assembles a structured prompt containing:
   - Issue analysis (title, description, evidence, frequency)
   - Affected element selectors and URLs
   - Suggested actions
   - Instructions to use `/writing-plans` skill first, then implement
4. **Claude Code Invocation:** Shell out to `claude` CLI in headless mode with:
   - The constructed prompt
   - Configured CLAUDE.md path
   - Configured skills and MCP servers
   - `--output-format json` for cost tracking
5. **Post-Agent Validation:**
   - Run build command → if fails, discard branch, mark `build_failed`
   - Run tests → if fails, discard branch, mark `build_failed`
   - Check diff size → if exceeds `maxDiffLines`, discard, mark `diff_too_large`
6. **Adaptation Loop:** Agent writes fix → Mahoraga generates a localized test mimicking the user journey that triggered the issue → run test → if test fails, feed error output back to agent → retry up to `maxRetries` (default 3) → only proceed to PR if test passes. This ensures fixes actually address the observed user behavior.
7. **PR Creation:** Via `gh pr create` (requires `gh` CLI authenticated). PR body contains:
   - Analytics summary: issue frequency, number of affected sessions, time range
   - User journey reconstruction from session events
   - Session replay link (when available from source platform)
   - Agent's implementation plan
   - Cost of the fix
   - Number of adaptation attempts
8. **Status Update:** Mark issue group as `pr_created` with PR URL in SQLite.

### Cooldown

If an issue group results in `no_fix_found`, it enters a cooldown period (default: 7 days). The analyzer skips it on subsequent runs until the cooldown expires. Prevents wasting API credits on issues the agent can't fix yet.

### Dry Run

`mahoraga analyze --dry-run` runs the full pipeline (pull → normalize → analyze) but stops before dispatching agents. Outputs a table of detected issues with severity, frequency, and affected elements. Essential for building trust.

### Governance (`governance.ts`)

Enterprise blast-radius control module that gates every dispatch:

- **Path enforcement:** Validates proposed changes against `allowedPaths` and `deniedPaths` glob patterns. Agent output touching denied paths is rejected before PR creation.
- **Confidence gating:** Issues below `confidenceThreshold` (default 0.7) produce a GitHub issue for human investigation instead of an automated PR.
- **Per-day cost budget:** Tracks cumulative spend across dispatches. Once the daily budget is exhausted, remaining issues are queued for the next run.
- **Diff size limits:** Rejects diffs exceeding `postChecks.maxDiffLines`. Large changes indicate the agent may be over-scoping.

---

## 7.5. Code-to-Event Mapper (`@mahoraga/mapper`)

The mapper is Mahoraga's competitive moat — it bridges the gap between **runtime selectors** (what analytics sees) and **source code locations** (what developers need to fix).

When the analyzer detects rage clicks on `#add-to-cart-btn`, the mapper resolves that selector to `src/components/Cart/AddToCartButton.tsx:42`, giving the agent a precise starting point.

### Interface

```typescript
/**
 * Resolves runtime CSS selectors and URLs to source code locations.
 * Used by the agent dispatcher to provide precise fix targets.
 */
interface CodeMapper {
  /**
   * Resolve a CSS selector on a given URL to source file locations.
   *
   * @param selector - CSS selector from analytics events (e.g., '#add-to-cart-btn', '.hero-cta')
   * @param url - Page URL where the selector was observed
   * @returns Array of matching source locations (may be multiple if selector is reused)
   */
  resolve(selector: string, url: string): SourceLocation[];
}

/**
 * A resolved source code location for a runtime selector.
 */
interface SourceLocation {
  /** Absolute or repo-relative file path */
  filePath: string;
  /** Line number where the element is rendered */
  line: number;
  /** Column number */
  column: number;
  /** React/Vue/Svelte component name if detectable */
  componentName?: string;
}
```

### AST Scanner

Parses TSX/JSX files using the **TypeScript Compiler API** (`ts.createSourceFile`). For each file:

1. Walk the AST looking for JSX elements and JSX self-closing elements
2. Extract rendered selectors from attributes: `id`, `className`, `data-testid`, `aria-label`
3. Record the source location (file, line, column) and enclosing component name
4. Build a `Map<selector, SourceLocation[]>` index

Handles dynamic class names (e.g., `clsx`, `classnames`) on a best-effort basis — static segments are indexed, dynamic segments are skipped with a warning.

### Route Scanner

Maps URLs to route components by parsing:

- **React Router:** Scans for `<Route path="..." element={...} />` patterns in route config files
- **Next.js Pages Router:** Maps `pages/` directory structure to URL patterns
- **Next.js App Router:** Maps `app/` directory structure to URL patterns

This allows `resolve('#add-to-cart-btn', '/products/123')` to narrow the search to components rendered by the `/products/:id` route.

### Index Builder

- Builds and caches the full selector-to-source-file index at `.mahoraga/code-map.json`
- Rebuilds incrementally based on file modification timestamps
- `mahoraga map` CLI command forces a full rebuild on demand
- Index is gitignored (ephemeral, derived from source)

### CLI Integration

```
mahoraga map              # Build/rebuild code-map index
mahoraga map --verbose    # Show all discovered selectors
mahoraga map --stats      # Show index statistics (files scanned, selectors found)
```

---

## 8. CLI (`@mahoraga/cli`)

### Commands

```
mahoraga init              # Interactive setup: config, env template, gitignore
mahoraga analyze           # Full pipeline: pull → analyze → dispatch
mahoraga analyze --dry-run # Pull + analyze only, no agent dispatch
mahoraga analyze --verbose # Debug-level logging
mahoraga inspect events    # Query local event database
mahoraga inspect issues    # Show detected issue groups and status
mahoraga status            # Show last N runs and outcomes
mahoraga gc                # Manual data retention cleanup
```

### Configuration File

```typescript
// mahoraga.config.ts
import { defineConfig } from '@mahoraga/core';

export default defineConfig({
  sources: [
    {
      adapter: 'amplitude',
      apiKey: process.env.MAHORAGA_AMPLITUDE_API_KEY!,
      secretKey: process.env.MAHORAGA_AMPLITUDE_SECRET_KEY!,
    },
  ],

  analysis: {
    /** How far back to look when analyzing */
    windowDays: 3,
    /** Detection rules to run */
    rules: ['rage-clicks', 'error-spikes'],
    /** Custom rules */
    customRules: [],
  },

  agent: {
    provider: 'claude-code',
    claudeMdPath: './CLAUDE.md',
    skills: ['writing-plans'],
    workflow: 'plan-then-implement',
    createPR: true,
    draftPR: true,
    baseBranch: 'main',
    maxCostPerIssue: 2,
    maxCostPerRun: 20,
    maxDispatchesPerRun: 5,
    timeoutMs: 300_000,
    postChecks: {
      build: true,
      test: true,
      maxDiffLines: 500,
    },
  },

  storage: {
    /** SQLite database path */
    dbPath: '.mahoraga/mahoraga.db',
    /** Days to retain event data */
    retentionDays: 30,
  },

  logging: {
    level: 'info',  // debug | info | warn | error
    format: 'pretty', // pretty | json (json for CI)
  },
});
```

### Scheduling (Not Built-In)

Mahoraga does not include a scheduler. Users schedule the CLI via:

**GitHub Actions (recommended):**
```yaml
# .github/workflows/mahoraga.yml
name: Mahoraga Analysis
on:
  schedule:
    - cron: '0 0 */3 * *'  # Every 3 days
  workflow_dispatch: {}
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/cache@v4
        with:
          path: .mahoraga/
          key: mahoraga-state-${{ github.ref }}
      - run: npx mahoraga analyze
        env:
          MAHORAGA_AMPLITUDE_API_KEY: ${{ secrets.AMPLITUDE_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

`mahoraga init --ci github-actions` generates this template.

---

## 9. Observability

### Structured Logging

All logging via `pino` with a redaction configuration that strips known sensitive fields (`email`, `ip`, `user_id`, `name`, `apiKey`, `secretKey`).

### Run Reports

Every `analyze` run produces a `RunReport` persisted to SQLite:

```typescript
interface RunReport {
  id: string;
  startedAt: number;
  finishedAt: number;
  eventsPulled: number;
  issuesDetected: number;
  prsCreated: number;
  status: 'completed' | 'failed';
  errors: RunError[];
}
```

Viewable via `mahoraga status`.

---

## 10. Security

### Credential Management
- Three-tier resolution: env vars → `.mahoraga.env` → config file
- Never stored in SQLite or logged
- `mahoraga init` generates `.gitignore` entries for `.mahoraga.env` and `.mahoraga/`

### Agent Sandboxing
- Git worktree isolation — `main` never directly modified
- `allowed_paths` config restricts which directories the agent can touch
- Diff size guard rejects oversized changes
- Draft PRs by default — humans review before merge

### Data Sanitization
- Sanitization boundary in `@mahoraga/core` strips fields not in the normalized schema
- Structured logger redacts sensitive field paths
- Anonymous session IDs only — no user identification possible

### Git Authentication
- Requires `gh` CLI authenticated (`gh auth login`)
- In CI, standard `GITHUB_TOKEN` env var
- `mahoraga analyze` validates `gh auth status` at startup, fails fast if not authenticated

---

## 11. Testing Strategy

### Approach: Spec-Driven TDD

1. **Spec first** — this document defines behaviors
2. **Tests from spec** — each requirement maps to test cases
3. **Red → Green → Refactor** — write failing tests, implement, clean up

### Testing Layers

#### Unit Tests (every package)
- Pure function logic tested in isolation
- Mocked dependencies via dependency injection
- Fast, no I/O

#### Contract Tests (`@mahoraga/sources`)
- MSW (Mock Service Worker) stands up fake HTTP servers matching real API contracts
- Tests verify pagination, error handling, rate limiting, auth failures
- Recorded API response fixtures in `__fixtures__/` directories

#### Integration Tests (pipeline)
- Full pipeline from fixture data → issue reports
- Uses real SQLite (in-memory for speed)
- No external API calls

#### Agent Tests (`@mahoraga/agent`)
- **Prompt assembly**: Unit test that prompts contain correct context, paths, instructions
- **Git operations**: Test branch/PR creation using temp git repos in `beforeEach`
- **Full pipeline mock**: `MockAgentExecutor` returns pre-recorded diffs
- **Snapshot tests**: `--print-prompt` flag dumps prompts for snapshot comparison

#### E2E Tests (manual/nightly)
- Real API calls gated behind `MAHORAGA_INTEGRATION_TESTS=true`
- Full pipeline against test repo
- Not run on every PR

### Test Utilities (`@mahoraga/core/testing`)

```typescript
/** Create a normalized event with sensible defaults */
export function createEvent(overrides?: Partial<MahoragaEvent>): MahoragaEvent;

/** Create a session's worth of events */
export function createSession(events: Partial<MahoragaEvent>[]): MahoragaEvent[];

/** Create events within a specific time window */
export function createTimeWindow(
  baseEvents: MahoragaEvent[],
  windowMs: number
): MahoragaEvent[];

/** Create a rage-click sequence for testing */
export function createRageClickSequence(
  selector: string,
  count: number,
  withinMs: number
): MahoragaEvent[];
```

### Linting & Code Quality

- **ESLint** with `eslint-plugin-jsdoc` enforcing JSDoc on all exports
- **TypeScript strict mode** across all packages
- **Zod validation** at external boundaries (API responses, config files)
- **Vitest coverage** targets: 80% line coverage minimum per package

---

## 12. V1 Scope

### In Scope
- [x] Monorepo scaffolding (Turborepo + pnpm + Vitest + tsup)
- [x] `@mahoraga/core`: Event schema (Zod), SQLite storage, utilities (hash, dedup, retry, rate limiter)
- [x] `@mahoraga/sources`: Adapter interface + Amplitude adapter
- [x] `@mahoraga/analyzer`: Rule interface + rage-click detector + error-spike detector
- [x] `@mahoraga/mapper`: AST scanner + route scanner + index builder + `mahoraga map` CLI command
- [x] `@mahoraga/agent`: Dispatcher + prompt builder + PR creator (via Claude Code CLI + gh) + adaptation loop (generate test → run → retry)
- [x] `@mahoraga/cli`: `init`, `analyze`, `analyze --dry-run`, `inspect`, `status`, `gc`, `map`
- [x] GitHub Actions template generation
- [x] Full TDD test suite with MSW mocks and fixtures
- [x] JSDoc on all public APIs

### Out of Scope (V2+)
- PostHog adapter (V1 ships Amplitude only to keep scope tight)
- Additional detection rules (dead clicks, form abandonment, performance)
- Custom rule authoring scaffold (`mahoraga create-rule`)
- Docker support
- PostgreSQL storage backend
- Web dashboard for viewing issues
- Plugin marketplace

---

## 13. Glossary

| Term | Definition |
|------|-----------|
| **Source** | An external analytics platform (Amplitude, PostHog, Sentry) |
| **Adapter** | Code that pulls from a source and normalizes to MahoragaEvent |
| **Detection Rule** | A pluggable analysis module that identifies UI issues |
| **Issue Group** | Related issues bundled for a single agent dispatch |
| **Dispatch** | Invoking Claude Code to fix an issue group |
| **Fingerprint** | Dedup key that identifies the same issue across analysis runs |
| **Cooldown** | Period after a failed fix attempt before retrying |
| **Worktree** | Isolated git working directory for agent modifications |
