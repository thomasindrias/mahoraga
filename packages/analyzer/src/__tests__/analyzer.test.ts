import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabase, EventStore } from 'mahoraga-core';
import type { DatabaseManager } from 'mahoraga-core';
import {
  createEvent,
  createRageClickSequence,
  createErrorEvent,
  resetEventCounter,
} from 'mahoraga-core/testing';
import { AnalysisEngine } from '../engine.js';
import { RageClickRule } from '../rules/rage-clicks.js';
import { ErrorSpikeRule } from '../rules/error-spikes.js';
import type { AnalysisContext, DetectionRule } from '../rule.js';

let dbManager: DatabaseManager;
let eventStore: EventStore;

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

/** Current window: last hour */
const timeWindow = { start: NOW - HOUR, end: NOW };
/** Previous window: the hour before that */
const previousWindow = { start: NOW - 2 * HOUR, end: NOW - HOUR };

function makeContext(): AnalysisContext {
  return { eventStore, timeWindow, previousWindow };
}

beforeEach(() => {
  resetEventCounter();
  dbManager = createDatabase(':memory:');
  eventStore = new EventStore(dbManager.db);
});

// ---------------------------------------------------------------------------
// Rage Clicks
// ---------------------------------------------------------------------------
describe('RageClickRule', () => {
  const rule = new RageClickRule();

  it('detects rage clicks (5 clicks in 800ms on same selector)', async () => {
    const rageEvents = createRageClickSequence('#frustrating-btn', 5, 800);
    // Ensure timestamps fall within timeWindow
    const baseTime = NOW - HOUR / 2;
    const adjusted = rageEvents.map((e, i) => ({
      ...e,
      timestamp: baseTime + i * 160,
    }));
    eventStore.insertBatch(adjusted);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('rage-clicks');
    expect(issues[0]!.title).toContain('#frustrating-btn');
    expect(issues[0]!.evidence[0]!.type).toBe('event_cluster');
  });

  it('does not detect slow clicks (5 clicks over 10 seconds)', async () => {
    const baseTime = NOW - HOUR / 2;
    const slowClicks = Array.from({ length: 5 }, (_, i) =>
      createEvent({
        type: 'click',
        sessionId: 'slow-session',
        timestamp: baseTime + i * 2500, // 2.5s apart
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#slow-btn',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      }),
    );
    eventStore.insertBatch(slowClicks);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0);
  });

  it('calculates correct severity based on session ratio', async () => {
    const baseTime = NOW - HOUR / 2;

    // Create rage clicks from many sessions so they represent 100% of sessions
    // Only 1 session total, 1 session with rage clicks => 100% => critical
    const rageEvents = Array.from({ length: 4 }, (_, i) =>
      createEvent({
        type: 'click',
        sessionId: 'only-session',
        timestamp: baseTime + i * 100,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#broken',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      }),
    );
    eventStore.insertBatch(rageEvents);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('critical'); // 1/1 = 100% >= 25%
  });

  it('assigns low severity when few sessions affected', async () => {
    const baseTime = NOW - HOUR / 2;

    // 1 session with rage clicks, 30 other sessions without
    const rageEvents = Array.from({ length: 4 }, (_, i) =>
      createEvent({
        type: 'click',
        sessionId: 'rage-session',
        timestamp: baseTime + i * 100,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#minor-issue',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      }),
    );

    // 30 other sessions with single clicks (not rage)
    const otherEvents = Array.from({ length: 30 }, (_, i) =>
      createEvent({
        type: 'click',
        sessionId: `other-session-${i}`,
        timestamp: baseTime + i * 1000,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#normal-btn',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      }),
    );

    eventStore.insertBatch([...rageEvents, ...otherEvents]);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('low'); // 1/31 ~= 3.2% < 5%
  });

  it('deduplicates by fingerprint', async () => {
    const baseTime = NOW - HOUR / 2;

    // Two sessions with rage clicks on the same selector
    for (const sessionId of ['session-a', 'session-b']) {
      const events = Array.from({ length: 4 }, (_, i) =>
        createEvent({
          type: 'click',
          sessionId,
          timestamp: baseTime + i * 100,
          url: 'https://example.com/page',
          payload: {
            type: 'click',
            selector: '#same-btn',
            coordinates: { x: 10, y: 20 },
            isRageClick: false,
          },
        }),
      );
      eventStore.insertBatch(events);
    }

    const issues = await rule.analyze(makeContext());
    // Should produce exactly 1 issue for #same-btn, not 2
    expect(issues).toHaveLength(1);
    expect(issues[0]!.frequency).toBe(2); // 2 sessions affected
  });
});

// ---------------------------------------------------------------------------
// Error Spikes
// ---------------------------------------------------------------------------
describe('ErrorSpikeRule', () => {
  const rule = new ErrorSpikeRule();

  it('detects error spike (10 in current vs 2 in previous)', async () => {
    const currentBase = NOW - HOUR / 2;
    const previousBase = NOW - HOUR - HOUR / 2;

    // 2 errors in previous window
    for (let i = 0; i < 2; i++) {
      const evt = createErrorEvent('TypeError: Cannot read property x');
      eventStore.insertBatch([{ ...evt, timestamp: previousBase + i * 1000 }]);
    }

    // 10 errors in current window
    for (let i = 0; i < 10; i++) {
      const evt = createErrorEvent('TypeError: Cannot read property x');
      eventStore.insertBatch([{ ...evt, timestamp: currentBase + i * 1000 }]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('error-spikes');
    expect(issues[0]!.evidence[0]!.type).toBe('frequency_spike');
    expect(issues[0]!.title).toContain('TypeError');
  });

  it('does not flag stable error rates', async () => {
    const currentBase = NOW - HOUR / 2;
    const previousBase = NOW - HOUR - HOUR / 2;

    // 5 errors in previous window
    for (let i = 0; i < 5; i++) {
      const evt = createErrorEvent('StableError');
      eventStore.insertBatch([{ ...evt, timestamp: previousBase + i * 1000 }]);
    }

    // 5 errors in current window (same count, ratio = 1x)
    for (let i = 0; i < 5; i++) {
      const evt = createErrorEvent('StableError');
      eventStore.insertBatch([{ ...evt, timestamp: currentBase + i * 1000 }]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0);
  });

  it('does not flag low-count spikes (3 current, 1 previous)', async () => {
    const currentBase = NOW - HOUR / 2;
    const previousBase = NOW - HOUR - HOUR / 2;

    // 1 error in previous
    const prevEvt = createErrorEvent('MinorError');
    eventStore.insertBatch([{ ...prevEvt, timestamp: previousBase }]);

    // 3 errors in current (3x ratio but count < 5)
    for (let i = 0; i < 3; i++) {
      const evt = createErrorEvent('MinorError');
      eventStore.insertBatch([{ ...evt, timestamp: currentBase + i * 1000 }]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0);
  });

  it('assigns correct severity based on ratio and count', async () => {
    const currentBase = NOW - HOUR / 2;
    const previousBase = NOW - HOUR - HOUR / 2;

    // 1 error in previous, 10 in current => ratio=10x => critical
    const prevEvt = createErrorEvent('CriticalError');
    eventStore.insertBatch([{ ...prevEvt, timestamp: previousBase }]);

    for (let i = 0; i < 10; i++) {
      const evt = createErrorEvent('CriticalError');
      eventStore.insertBatch([{ ...evt, timestamp: currentBase + i * 1000 }]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('critical'); // 10x ratio >= 10
  });
});

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
describe('AnalysisEngine', () => {
  it('runs multiple rules and aggregates issues', async () => {
    const engine = new AnalysisEngine();
    engine.registerRule(new RageClickRule());
    engine.registerRule(new ErrorSpikeRule());

    const baseTime = NOW - HOUR / 2;

    // Insert rage clicks
    const rageEvents = Array.from({ length: 4 }, (_, i) =>
      createEvent({
        type: 'click',
        sessionId: 'engine-session',
        timestamp: baseTime + i * 100,
        url: 'https://example.com/page',
        payload: {
          type: 'click',
          selector: '#engine-btn',
          coordinates: { x: 10, y: 20 },
          isRageClick: false,
        },
      }),
    );
    eventStore.insertBatch(rageEvents);

    // Insert error spike (6 current, 0 previous)
    for (let i = 0; i < 6; i++) {
      const evt = createErrorEvent('EngineError');
      eventStore.insertBatch([{ ...evt, timestamp: baseTime + i * 1000 }]);
    }

    const issues = await engine.analyze(makeContext());
    expect(issues.length).toBeGreaterThanOrEqual(2);

    const ruleIds = issues.map((i) => i.ruleId);
    expect(ruleIds).toContain('rage-clicks');
    expect(ruleIds).toContain('error-spikes');
  });

  it('catches and logs rule errors without crashing', async () => {
    const engine = new AnalysisEngine();

    const failingRule: DetectionRule = {
      id: 'failing-rule',
      name: 'Failing Rule',
      description: 'Always throws',
      requiredEventTypes: ['click'],
      analyze: async () => {
        throw new Error('Rule exploded');
      },
    };

    const passingRule: DetectionRule = {
      id: 'passing-rule',
      name: 'Passing Rule',
      description: 'Returns one issue',
      requiredEventTypes: ['click'],
      analyze: async () => [
        {
          id: 'test-issue',
          ruleId: 'passing-rule',
          fingerprint: 'test-fp',
          severity: 'low',
          title: 'Test issue',
          description: 'A test issue',
          evidence: [],
          affectedElements: [],
          frequency: 1,
        },
      ],
    };

    engine.registerRule(failingRule);
    engine.registerRule(passingRule);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const issues = await engine.analyze(makeContext());

    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('passing-rule');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Rule "failing-rule" failed:',
      'Rule exploded',
    );

    consoleSpy.mockRestore();
  });
});
