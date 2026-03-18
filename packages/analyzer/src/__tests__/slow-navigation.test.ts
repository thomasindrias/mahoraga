import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, EventStore } from 'mahoraga-core';
import type { DatabaseManager, RuleThresholds } from 'mahoraga-core';
import { createEvent, resetEventCounter } from 'mahoraga-core/testing';
import { SlowNavigationRule } from '../rules/slow-navigation.js';
import type { AnalysisContext } from '../rule.js';

let dbManager: DatabaseManager;
let eventStore: EventStore;

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

/** Current window: last hour */
const timeWindow = { start: NOW - HOUR, end: NOW };
/** Previous window: the hour before that */
const previousWindow = { start: NOW - 2 * HOUR, end: NOW - HOUR };

function makeContext(overrides?: { routePatterns?: string[]; thresholds?: Partial<RuleThresholds> }): AnalysisContext {
  return {
    eventStore,
    timeWindow,
    previousWindow,
    routePatterns: overrides?.routePatterns,
    thresholds: overrides?.thresholds ? { ...overrides.thresholds } as RuleThresholds : undefined,
  };
}

beforeEach(() => {
  resetEventCounter();
  dbManager = createDatabase(':memory:');
  eventStore = new EventStore(dbManager.db);
});

describe('SlowNavigationRule', () => {
  const rule = new SlowNavigationRule();

  it('detects slow routes (3+ navigations > 3s on same route, 2+ sessions)', async () => {
    const baseTime = NOW - HOUR / 2;

    // Session 1: 2 slow navigations /home->/dashboard
    const session1Events = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-1',
        timestamp: baseTime,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/dashboard',
          duration: 5000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-1',
        timestamp: baseTime + 10000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/dashboard',
          duration: 4500,
        },
      }),
    ];

    // Session 2: 1 slow navigation /home->/dashboard
    const session2Events = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-2',
        timestamp: baseTime + 20000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/dashboard',
          duration: 6000,
        },
      }),
    ];

    eventStore.insertBatch([...session1Events, ...session2Events]);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('slow-navigation');
    expect(issues[0]!.title).toContain('/home->/dashboard');
    expect(issues[0]!.evidence[0]!.type).toBe('slow_transitions');
    expect(issues[0]!.frequency).toBe(2); // 2 sessions affected
  });

  it('ignores fast navigations (<= 3000ms)', async () => {
    const baseTime = NOW - HOUR / 2;

    // 5 fast navigations on same route
    const fastEvents = Array.from({ length: 5 }, (_, i) =>
      createEvent({
        type: 'navigation',
        sessionId: `session-${i}`,
        timestamp: baseTime + i * 1000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/profile',
          duration: 2000, // Fast
        },
      }),
    );

    eventStore.insertBatch(fastEvents);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0);
  });

  it('skips events without duration', async () => {
    const baseTime = NOW - HOUR / 2;

    // 3 navigations without duration + 2 with slow duration
    const eventsWithoutDuration = Array.from({ length: 3 }, (_, i) =>
      createEvent({
        type: 'navigation',
        sessionId: `session-${i}`,
        timestamp: baseTime + i * 1000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/settings',
          // No duration
        },
      }),
    );

    const eventsWithDuration = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-3',
        timestamp: baseTime + 5000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/settings',
          duration: 4000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-4',
        timestamp: baseTime + 10000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/settings',
          duration: 5000,
        },
      }),
    ];

    eventStore.insertBatch([...eventsWithoutDuration, ...eventsWithDuration]);

    const issues = await rule.analyze(makeContext());
    // Only 2 slow navigations with duration, need 3 minimum
    expect(issues).toHaveLength(0);
  });

  it('correct severity by median duration', async () => {
    const baseTime = NOW - HOUR / 2;

    // Test critical: median > 10000ms
    const criticalEvents = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-1',
        timestamp: baseTime,
        payload: {
          type: 'navigation',
          from: '/critical',
          to: '/page',
          duration: 11000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-2',
        timestamp: baseTime + 1000,
        payload: {
          type: 'navigation',
          from: '/critical',
          to: '/page',
          duration: 12000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-3',
        timestamp: baseTime + 2000,
        payload: {
          type: 'navigation',
          from: '/critical',
          to: '/page',
          duration: 15000,
        },
      }),
    ];

    eventStore.insertBatch(criticalEvents);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('critical'); // median = 12000 > 10000

    // Clear and test high: 7000 < median <= 10000
    resetEventCounter();
    dbManager = createDatabase(':memory:');
    eventStore = new EventStore(dbManager.db);

    const highEvents = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-a',
        timestamp: baseTime,
        payload: {
          type: 'navigation',
          from: '/high',
          to: '/page',
          duration: 7500,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-b',
        timestamp: baseTime + 1000,
        payload: {
          type: 'navigation',
          from: '/high',
          to: '/page',
          duration: 8000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-c',
        timestamp: baseTime + 2000,
        payload: {
          type: 'navigation',
          from: '/high',
          to: '/page',
          duration: 9000,
        },
      }),
    ];

    eventStore.insertBatch(highEvents);

    const highIssues = await rule.analyze(makeContext());
    expect(highIssues).toHaveLength(1);
    expect(highIssues[0]!.severity).toBe('high'); // median = 8000, 7000 < 8000 <= 10000

    // Clear and test medium: 5000 < median <= 7000
    resetEventCounter();
    dbManager = createDatabase(':memory:');
    eventStore = new EventStore(dbManager.db);

    const mediumEvents = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-x',
        timestamp: baseTime,
        payload: {
          type: 'navigation',
          from: '/medium',
          to: '/page',
          duration: 5500,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-y',
        timestamp: baseTime + 1000,
        payload: {
          type: 'navigation',
          from: '/medium',
          to: '/page',
          duration: 6000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-z',
        timestamp: baseTime + 2000,
        payload: {
          type: 'navigation',
          from: '/medium',
          to: '/page',
          duration: 6500,
        },
      }),
    ];

    eventStore.insertBatch(mediumEvents);

    const mediumIssues = await rule.analyze(makeContext());
    expect(mediumIssues).toHaveLength(1);
    expect(mediumIssues[0]!.severity).toBe('medium'); // median = 6000, 5000 < 6000 <= 7000

    // Clear and test low: median <= 5000
    resetEventCounter();
    dbManager = createDatabase(':memory:');
    eventStore = new EventStore(dbManager.db);

    const lowEvents = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-i',
        timestamp: baseTime,
        payload: {
          type: 'navigation',
          from: '/low',
          to: '/page',
          duration: 3500,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-j',
        timestamp: baseTime + 1000,
        payload: {
          type: 'navigation',
          from: '/low',
          to: '/page',
          duration: 4000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-k',
        timestamp: baseTime + 2000,
        payload: {
          type: 'navigation',
          from: '/low',
          to: '/page',
          duration: 4500,
        },
      }),
    ];

    eventStore.insertBatch(lowEvents);

    const lowIssues = await rule.analyze(makeContext());
    expect(lowIssues).toHaveLength(1);
    expect(lowIssues[0]!.severity).toBe('low'); // median = 4000 <= 5000
  });

  it('groups by route pair (/a->/b and /a->/c tracked separately)', async () => {
    const baseTime = NOW - HOUR / 2;

    // Route 1: /home->/dashboard (3 slow navigations, 2 sessions)
    const route1Events = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-1',
        timestamp: baseTime,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/dashboard',
          duration: 5000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-1',
        timestamp: baseTime + 1000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/dashboard',
          duration: 4000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-2',
        timestamp: baseTime + 2000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/dashboard',
          duration: 6000,
        },
      }),
    ];

    // Route 2: /home->/profile (3 slow navigations, 2 sessions)
    const route2Events = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-3',
        timestamp: baseTime + 3000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/profile',
          duration: 7000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-3',
        timestamp: baseTime + 4000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/profile',
          duration: 8000,
        },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-4',
        timestamp: baseTime + 5000,
        payload: {
          type: 'navigation',
          from: '/home',
          to: '/profile',
          duration: 9000,
        },
      }),
    ];

    eventStore.insertBatch([...route1Events, ...route2Events]);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(2);

    const titles = issues.map((i) => i.title);
    expect(titles).toContain('Slow navigation: /home->/dashboard');
    expect(titles).toContain('Slow navigation: /home->/profile');

    // Each route should have 2 unique sessions
    for (const issue of issues) {
      expect(issue.frequency).toBe(2);
    }
  });

  it('groups dynamic routes with URL normalization', async () => {
    const baseTime = NOW - HOUR / 2;

    // /products/1->/details/1 and /products/2->/details/2 should group
    const events = [
      createEvent({
        type: 'navigation',
        sessionId: 'session-1',
        timestamp: baseTime,
        payload: { type: 'navigation', from: '/products/1', to: '/details/1', duration: 5000 },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-1',
        timestamp: baseTime + 10000,
        payload: { type: 'navigation', from: '/products/2', to: '/details/2', duration: 4500 },
      }),
      createEvent({
        type: 'navigation',
        sessionId: 'session-2',
        timestamp: baseTime + 20000,
        payload: { type: 'navigation', from: '/products/3', to: '/details/3', duration: 6000 },
      }),
    ];

    eventStore.insertBatch(events);

    // Without routePatterns — no grouping, 3 different route pairs
    const issuesNoPattern = await rule.analyze(makeContext());
    expect(issuesNoPattern).toHaveLength(0); // Each route pair has only 1 event

    // With routePatterns — grouped into 1 route pair
    const issuesWithPattern = await rule.analyze(makeContext({
      routePatterns: ['/products/:id', '/details/:id'],
    }));
    expect(issuesWithPattern).toHaveLength(1);
    expect(issuesWithPattern[0]!.title).toContain('/products/:id->/details/:id');
  });

  it('uses custom thresholdMs from context', async () => {
    const baseTime = NOW - HOUR / 2;

    // 3 navigations at 4000ms across 2 sessions — slow for default (3000ms), fast for custom (5000ms)
    const events = [
      createEvent({
        type: 'navigation', sessionId: 'session-1', timestamp: baseTime,
        payload: { type: 'navigation', from: '/a', to: '/b', duration: 4000 },
      }),
      createEvent({
        type: 'navigation', sessionId: 'session-1', timestamp: baseTime + 10000,
        payload: { type: 'navigation', from: '/a', to: '/b', duration: 4000 },
      }),
      createEvent({
        type: 'navigation', sessionId: 'session-2', timestamp: baseTime + 20000,
        payload: { type: 'navigation', from: '/a', to: '/b', duration: 4000 },
      }),
    ];
    eventStore.insertBatch(events);

    // Default threshold (3000ms) — 4000 > 3000 => detected
    const issuesDefault = await rule.analyze(makeContext());
    expect(issuesDefault).toHaveLength(1);

    // Custom threshold (5000ms) — 4000 < 5000 => NOT detected
    const issuesCustom = await rule.analyze(makeContext({
      thresholds: { 'slow-navigation': { thresholdMs: 5000, minOccurrences: 3, minSessions: 2 } },
    }));
    expect(issuesCustom).toHaveLength(0);
  });
});
