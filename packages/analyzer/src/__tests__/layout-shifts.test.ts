import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, EventStore } from 'mahoraga-core';
import type { DatabaseManager } from 'mahoraga-core';
import { createEvent, resetEventCounter } from 'mahoraga-core/testing';
import { LayoutShiftRule } from '../rules/layout-shifts.js';
import type { AnalysisContext } from '../rule.js';
import type { PerformancePayload } from 'mahoraga-core';

let dbManager: DatabaseManager;
let eventStore: EventStore;

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

/** Current window: last hour */
const timeWindow = { start: NOW - HOUR, end: NOW };
/** Previous window: the hour before that */
const previousWindow = { start: NOW - 2 * HOUR, end: NOW - HOUR };

function makeContext(overrides?: { routePatterns?: string[] }): AnalysisContext {
  return { eventStore, timeWindow, previousWindow, routePatterns: overrides?.routePatterns };
}

beforeEach(() => {
  resetEventCounter();
  dbManager = createDatabase(':memory:');
  eventStore = new EventStore(dbManager.db);
});

describe('LayoutShiftRule', () => {
  const rule = new LayoutShiftRule();

  it('detects poor CLS (3+ poor events on same URL, 2+ sessions)', async () => {
    const baseTime = NOW - HOUR / 2;
    const url = 'https://example.com/shifting-page';

    // Session 1: 2 poor CLS events
    const session1Events = [
      createEvent({
        type: 'performance',
        sessionId: 'session-1',
        timestamp: baseTime,
        url,
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.35,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-1',
        timestamp: baseTime + 1000,
        url,
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.4,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
    ];

    // Session 2: 1 poor CLS event
    const session2Events = [
      createEvent({
        type: 'performance',
        sessionId: 'session-2',
        timestamp: baseTime + 2000,
        url,
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.3,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
    ];

    eventStore.insertBatch([...session1Events, ...session2Events]);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('layout-shifts');
    expect(issues[0]!.title).toContain('Layout shifts detected');
    expect(issues[0]!.affectedElements[0]!.url).toBe('/shifting-page');
    expect(issues[0]!.evidence[0]!.type).toBe('poor_cls');
  });

  it('ignores good and needs-improvement ratings', async () => {
    const baseTime = NOW - HOUR / 2;
    const url = 'https://example.com/good-page';

    // 3 events, but all are good or needs-improvement
    const events = [
      createEvent({
        type: 'performance',
        sessionId: 'session-1',
        timestamp: baseTime,
        url,
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.05,
          rating: 'good',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-2',
        timestamp: baseTime + 1000,
        url,
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.15,
          rating: 'needs-improvement',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-3',
        timestamp: baseTime + 2000,
        url,
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.08,
          rating: 'good',
        } satisfies PerformancePayload,
      }),
    ];

    eventStore.insertBatch(events);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0);
  });

  it('ignores non-CLS metrics even with poor rating', async () => {
    const baseTime = NOW - HOUR / 2;
    const url = 'https://example.com/slow-page';

    // 3 poor LCP events across 2 sessions (not CLS)
    const events = [
      createEvent({
        type: 'performance',
        sessionId: 'session-1',
        timestamp: baseTime,
        url,
        payload: {
          type: 'performance',
          metric: 'LCP',
          value: 5000,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-1',
        timestamp: baseTime + 1000,
        url,
        payload: {
          type: 'performance',
          metric: 'LCP',
          value: 4800,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-2',
        timestamp: baseTime + 2000,
        url,
        payload: {
          type: 'performance',
          metric: 'LCP',
          value: 5200,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
    ];

    eventStore.insertBatch(events);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0);
  });

  it('assigns correct severity based on average CLS value', async () => {
    const baseTime = NOW - HOUR / 2;

    // Test critical: average CLS >= 0.5
    const criticalEvents = [
      createEvent({
        type: 'performance',
        sessionId: 'session-1',
        timestamp: baseTime,
        url: 'https://example.com/critical',
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.6,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-1',
        timestamp: baseTime + 1000,
        url: 'https://example.com/critical',
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.55,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-2',
        timestamp: baseTime + 2000,
        url: 'https://example.com/critical',
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.5,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
    ];

    eventStore.insertBatch(criticalEvents);

    let issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('critical'); // avg = 0.55

    // Test high: average CLS >= 0.25
    dbManager = createDatabase(':memory:');
    eventStore = new EventStore(dbManager.db);

    const highEvents = [
      createEvent({
        type: 'performance',
        sessionId: 'session-3',
        timestamp: baseTime,
        url: 'https://example.com/high',
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.3,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-3',
        timestamp: baseTime + 1000,
        url: 'https://example.com/high',
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.28,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-4',
        timestamp: baseTime + 2000,
        url: 'https://example.com/high',
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.26,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
    ];

    eventStore.insertBatch(highEvents);

    issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('high'); // avg = 0.28

    // Test medium: average CLS >= 0.1
    dbManager = createDatabase(':memory:');
    eventStore = new EventStore(dbManager.db);

    const mediumEvents = [
      createEvent({
        type: 'performance',
        sessionId: 'session-5',
        timestamp: baseTime,
        url: 'https://example.com/medium',
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.15,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-5',
        timestamp: baseTime + 1000,
        url: 'https://example.com/medium',
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.12,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-6',
        timestamp: baseTime + 2000,
        url: 'https://example.com/medium',
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.11,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
    ];

    eventStore.insertBatch(mediumEvents);

    issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('medium'); // avg = 0.127
  });

  it('does not detect when session threshold not met (only 1 session)', async () => {
    const baseTime = NOW - HOUR / 2;
    const url = 'https://example.com/single-session';

    // 3 poor CLS events, but all in same session
    const events = [
      createEvent({
        type: 'performance',
        sessionId: 'session-only',
        timestamp: baseTime,
        url,
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.35,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-only',
        timestamp: baseTime + 1000,
        url,
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.4,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-only',
        timestamp: baseTime + 2000,
        url,
        payload: {
          type: 'performance',
          metric: 'CLS',
          value: 0.3,
          rating: 'poor',
        } satisfies PerformancePayload,
      }),
    ];

    eventStore.insertBatch(events);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0);
  });

  it('groups dynamic URLs with routePatterns', async () => {
    const baseTime = NOW - HOUR / 2;

    // Poor CLS on /products/1 and /products/2 — should group with pattern
    const events = [
      createEvent({
        type: 'performance',
        sessionId: 'session-1',
        timestamp: baseTime,
        url: 'https://example.com/products/1',
        payload: { type: 'performance', metric: 'CLS', value: 0.3, rating: 'poor' as const },
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-1',
        timestamp: baseTime + 1000,
        url: 'https://example.com/products/2',
        payload: { type: 'performance', metric: 'CLS', value: 0.4, rating: 'poor' as const },
      }),
      createEvent({
        type: 'performance',
        sessionId: 'session-2',
        timestamp: baseTime + 2000,
        url: 'https://example.com/products/3',
        payload: { type: 'performance', metric: 'CLS', value: 0.5, rating: 'poor' as const },
      }),
    ];

    eventStore.insertBatch(events);

    // Without patterns — 3 different URLs, each with only 1 event (below threshold)
    const issuesNoPattern = await rule.analyze(makeContext());
    expect(issuesNoPattern).toHaveLength(0);

    // With patterns — grouped into 1 URL, 3 events across 2 sessions
    const issuesWithPattern = await rule.analyze(makeContext({
      routePatterns: ['/products/:id'],
    }));
    expect(issuesWithPattern).toHaveLength(1);
    expect(issuesWithPattern[0]!.title).toContain('/products/:id');
  });
});
