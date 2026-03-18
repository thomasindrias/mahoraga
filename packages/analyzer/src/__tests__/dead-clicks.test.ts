import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, EventStore } from 'mahoraga-core';
import type { DatabaseManager, RuleThresholds } from 'mahoraga-core';
import {
  createEvent,
  resetEventCounter,
} from 'mahoraga-core/testing';
import { DeadClickRule } from '../rules/dead-clicks.js';
import type { AnalysisContext } from '../rule.js';

let dbManager: DatabaseManager;
let eventStore: EventStore;

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

/** Current window: last hour */
const timeWindow = { start: NOW - HOUR, end: NOW };
/** Previous window: the hour before that */
const previousWindow = { start: NOW - 2 * HOUR, end: NOW - HOUR };

function makeContext(overrides?: { thresholds?: Partial<RuleThresholds> }): AnalysisContext {
  return {
    eventStore,
    timeWindow,
    previousWindow,
    thresholds: overrides?.thresholds ? { ...overrides.thresholds } as RuleThresholds : undefined,
  };
}

beforeEach(() => {
  resetEventCounter();
  dbManager = createDatabase(':memory:');
  eventStore = new EventStore(dbManager.db);
});

describe('DeadClickRule', () => {
  const rule = new DeadClickRule();

  it('detects dead clicks (clicks with no navigation within 2s)', async () => {
    const baseTime = NOW - HOUR / 2;

    // Create 5 dead clicks across 2 sessions on #broken-link
    for (let i = 0; i < 3; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-a',
        timestamp: baseTime + i * 5000, // 5s apart
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#broken-link',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      });
      eventStore.insertBatch([click]);
    }

    for (let i = 0; i < 2; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-b',
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#broken-link',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      });
      eventStore.insertBatch([click]);
    }

    // No navigation events at all

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('dead-clicks');
    expect(issues[0]!.title).toContain('#broken-link');
    expect(issues[0]!.evidence[0]!.type).toBe('event_cluster');
    expect(issues[0]!.frequency).toBe(2); // 2 sessions affected
  });

  it('ignores clicks followed by navigation within 2s', async () => {
    const baseTime = NOW - HOUR / 2;

    // Create 5 clicks on #working-link
    for (let i = 0; i < 5; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: `session-${i}`,
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#working-link',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      });
      eventStore.insertBatch([click]);

      // Add navigation 1 second after each click
      const nav = createEvent({
        type: 'navigation',
        sessionId: `session-${i}`,
        timestamp: baseTime + i * 5000 + 1000, // 1s after click
        url: 'https://example.com/next',
        payload: {
          type: 'navigation',
          from: 'https://example.com/page',
          to: 'https://example.com/next',
        },
      });
      eventStore.insertBatch([nav]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0); // All clicks had navigation within 2s
  });

  it('below threshold returns empty (fewer than 5 dead clicks)', async () => {
    const baseTime = NOW - HOUR / 2;

    // Create only 4 dead clicks across 2 sessions
    for (let i = 0; i < 2; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-a',
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#low-volume',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      });
      eventStore.insertBatch([click]);
    }

    for (let i = 0; i < 2; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-b',
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#low-volume',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      });
      eventStore.insertBatch([click]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0); // 4 clicks < 5 threshold
  });

  it('correct severity based on session ratio', async () => {
    const baseTime = NOW - HOUR / 2;

    // Create dead clicks from 2 sessions (100% of sessions with dead clicks)
    for (let i = 0; i < 3; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-a',
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#critical-link',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      });
      eventStore.insertBatch([click]);
    }

    for (let i = 0; i < 2; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-b',
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#critical-link',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      });
      eventStore.insertBatch([click]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    // 2 sessions with dead clicks / 2 total sessions = 100% >= 25% => critical
    expect(issues[0]!.severity).toBe('critical');
  });

  it('dedup by fingerprint (2 sessions same selector -> 1 issue)', async () => {
    const baseTime = NOW - HOUR / 2;

    // Create dead clicks from 2 sessions on the same selector
    for (let i = 0; i < 3; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-a',
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#dedup-btn',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      });
      eventStore.insertBatch([click]);
    }

    for (let i = 0; i < 2; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-b',
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#dedup-btn',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      });
      eventStore.insertBatch([click]);
    }

    const issues = await rule.analyze(makeContext());
    // Should produce exactly 1 issue for #dedup-btn, not 2
    expect(issues).toHaveLength(1);
    expect(issues[0]!.frequency).toBe(2); // 2 sessions affected
  });

  it('uses custom minClickCount threshold from context', async () => {
    const baseTime = NOW - HOUR / 2;

    // Create 4 dead clicks across 2 sessions (below default 5, above custom 3)
    for (let i = 0; i < 2; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-a',
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: { type: 'click', selector: '#threshold-link', coordinates: { x: 10, y: 20 }, isRageClick: false },
      });
      eventStore.insertBatch([click]);
    }
    for (let i = 0; i < 2; i++) {
      const click = createEvent({
        type: 'click',
        sessionId: 'session-b',
        timestamp: baseTime + i * 5000,
        url: 'https://example.com/page',
        payload: { type: 'click', selector: '#threshold-link', coordinates: { x: 10, y: 20 }, isRageClick: false },
      });
      eventStore.insertBatch([click]);
    }

    // Default threshold (5) — 4 clicks < 5 => NOT detected
    const issuesDefault = await rule.analyze(makeContext());
    expect(issuesDefault).toHaveLength(0);

    // Custom threshold (3) — 4 clicks >= 3 => detected
    const issuesCustom = await rule.analyze(makeContext({
      thresholds: { 'dead-clicks': { minClickCount: 3, minSessions: 2, waitMs: 2000 } },
    }));
    expect(issuesCustom).toHaveLength(1);
  });
});
