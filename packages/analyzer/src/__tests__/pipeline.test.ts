import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, EventStore, IssueStore } from 'mahoraga-core';
import type { DatabaseManager, TimeRange } from 'mahoraga-core';
import {
  createRageClickSequence,
  createErrorEvent,
  resetEventCounter,
} from 'mahoraga-core/testing';
import { AnalysisEngine } from '../engine.js';
import { RageClickRule } from '../rules/rage-clicks.js';
import { ErrorSpikeRule } from '../rules/error-spikes.js';

describe('Pipeline integration: ingest -> analyze -> persist', () => {
  let dbManager: DatabaseManager;
  let eventStore: EventStore;
  let issueStore: IssueStore;

  const NOW = Date.now();
  const HOUR = 60 * 60 * 1000;
  const timeWindow: TimeRange = { start: NOW - HOUR, end: NOW };
  const previousWindow: TimeRange = { start: NOW - 2 * HOUR, end: NOW - HOUR };

  beforeEach(async () => {
    resetEventCounter();
    dbManager = await createDatabase(':memory:');
    eventStore = new EventStore(dbManager.db);
    issueStore = new IssueStore(dbManager.db);
  });

  afterEach(() => {
    dbManager.close();
  });

  it('detects rage clicks and error spikes, persists issues', async () => {
    const baseTime = NOW - HOUR / 2;

    // Ingest rage-click events (5 clicks in 800ms triggers RageClickRule: 3+ clicks within 1s)
    const rageEvents = createRageClickSequence('#checkout-btn', 5, 800).map(
      (e, i) => ({ ...e, timestamp: baseTime + i * 160 }),
    );
    eventStore.insertBatch(rageEvents);

    // Ingest error events: 1 in previous window, 8 in current (triggers ErrorSpikeRule: >=5 AND >=2x ratio)
    const prevError = createErrorEvent('ReferenceError: x is not defined');
    eventStore.insertBatch([{ ...prevError, timestamp: NOW - HOUR - HOUR / 2 }]);

    for (let i = 0; i < 8; i++) {
      const evt = createErrorEvent('ReferenceError: x is not defined');
      eventStore.insertBatch([{ ...evt, timestamp: baseTime + i * 1000 }]);
    }

    // Run analysis
    const engine = new AnalysisEngine();
    engine.registerRule(new RageClickRule());
    engine.registerRule(new ErrorSpikeRule());
    const issues = await engine.analyze({ eventStore, timeWindow, previousWindow });

    expect(issues.length).toBeGreaterThanOrEqual(2);

    // Persist
    for (const issue of issues) {
      issueStore.upsert(issue);
    }

    // Verify persistence
    const persisted = issueStore.getAll();
    expect(persisted.length).toBeGreaterThanOrEqual(2);

    const ruleIds = persisted.map((i) => i.ruleId);
    expect(ruleIds).toContain('rage-clicks');
    expect(ruleIds).toContain('error-spikes');

    // All issues start as 'detected'
    const detected = issueStore.getByStatus('detected');
    expect(detected.length).toBeGreaterThanOrEqual(2);
  });

  it('upserts are idempotent (re-analysis does not duplicate)', async () => {
    const baseTime = NOW - HOUR / 2;
    const rageEvents = createRageClickSequence('#idempotent-btn', 5, 800).map(
      (e, i) => ({ ...e, timestamp: baseTime + i * 160 }),
    );
    eventStore.insertBatch(rageEvents);

    const engine = new AnalysisEngine();
    engine.registerRule(new RageClickRule());
    const ctx = { eventStore, timeWindow, previousWindow };

    // Analyze twice
    const issues1 = await engine.analyze(ctx);
    for (const issue of issues1) issueStore.upsert(issue);

    const issues2 = await engine.analyze(ctx);
    for (const issue of issues2) issueStore.upsert(issue);

    // Fingerprint-based upsert: no duplicates
    const all = issueStore.getAll();
    const rageIssues = all.filter((i) => i.ruleId === 'rage-clicks');
    expect(rageIssues).toHaveLength(1);
  });
});
