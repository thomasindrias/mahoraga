import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, EventStore } from 'mahoraga-core';
import type { DatabaseManager, RuleThresholds } from 'mahoraga-core';
import { createErrorEvent, resetEventCounter } from 'mahoraga-core/testing';
import { ErrorLoopRule } from '../rules/error-loops.js';
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

beforeEach(async () => {
  resetEventCounter();
  dbManager = await createDatabase(':memory:');
  eventStore = new EventStore(dbManager.db);
});

describe('ErrorLoopRule', () => {
  const rule = new ErrorLoopRule();

  it('detects error loop (5x same error in 2 sessions)', async () => {
    const baseTime = NOW - HOUR / 2;
    const errorMessage = 'TypeError: Cannot read property foo';

    // Session 1: 5 occurrences
    for (let i = 0; i < 5; i++) {
      const evt = createErrorEvent(errorMessage);
      eventStore.insertBatch([
        { ...evt, sessionId: 'session-1', timestamp: baseTime + i * 1000 },
      ]);
    }

    // Session 2: 5 occurrences
    for (let i = 0; i < 5; i++) {
      const evt = createErrorEvent(errorMessage);
      eventStore.insertBatch([
        { ...evt, sessionId: 'session-2', timestamp: baseTime + i * 1000 },
      ]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('error-loops');
    expect(issues[0]!.title).toContain('TypeError');
    expect(issues[0]!.evidence[0]!.type).toBe('error_loop');
    expect(issues[0]!.frequency).toBe(2); // 2 sessions
  });

  it('ignores 1-2 occurrences (below loop threshold)', async () => {
    const baseTime = NOW - HOUR / 2;
    const errorMessage = 'MinorError';

    // Session 1: 2 occurrences (below 3 threshold)
    for (let i = 0; i < 2; i++) {
      const evt = createErrorEvent(errorMessage);
      eventStore.insertBatch([
        { ...evt, sessionId: 'session-1', timestamp: baseTime + i * 1000 },
      ]);
    }

    // Session 2: 2 occurrences (below 3 threshold)
    for (let i = 0; i < 2; i++) {
      const evt = createErrorEvent(errorMessage);
      eventStore.insertBatch([
        { ...evt, sessionId: 'session-2', timestamp: baseTime + i * 1000 },
      ]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0);
  });

  it('requires 2+ sessions (1 session with loop not enough)', async () => {
    const baseTime = NOW - HOUR / 2;
    const errorMessage = 'SingleSessionError';

    // Only 1 session with 5 occurrences (loop but only 1 session)
    for (let i = 0; i < 5; i++) {
      const evt = createErrorEvent(errorMessage);
      eventStore.insertBatch([
        { ...evt, sessionId: 'session-1', timestamp: baseTime + i * 1000 },
      ]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0);
  });

  it('different errors tracked separately', async () => {
    const baseTime = NOW - HOUR / 2;

    // Error A: 4 occurrences in 2 sessions (3 in session-1, 1 in session-2 - not a loop)
    for (let i = 0; i < 3; i++) {
      const evt = createErrorEvent('ErrorA');
      eventStore.insertBatch([
        { ...evt, sessionId: 'session-1', timestamp: baseTime + i * 1000 },
      ]);
    }
    const evtA2 = createErrorEvent('ErrorA');
    eventStore.insertBatch([
      { ...evtA2, sessionId: 'session-2', timestamp: baseTime },
    ]);

    // Error B: 4 occurrences in each of 2 sessions (both have loops)
    for (let i = 0; i < 4; i++) {
      const evt = createErrorEvent('ErrorB');
      eventStore.insertBatch([
        { ...evt, sessionId: 'session-3', timestamp: baseTime + i * 1000 },
      ]);
    }
    for (let i = 0; i < 4; i++) {
      const evt = createErrorEvent('ErrorB');
      eventStore.insertBatch([
        { ...evt, sessionId: 'session-4', timestamp: baseTime + i * 1000 },
      ]);
    }

    const issues = await rule.analyze(makeContext());
    // Only ErrorB should be detected (2 sessions with loops)
    expect(issues).toHaveLength(1);
    expect(issues[0]!.title).toContain('ErrorB');
  });

  it('correct severity by average loop count', async () => {
    const baseTime = NOW - HOUR / 2;

    // Test critical: average loop count >= 10
    // Session 1: 10 occurrences, Session 2: 10 occurrences => avg = 10 => critical
    const criticalMsg = 'CriticalLoopError';
    for (let i = 0; i < 10; i++) {
      const evt = createErrorEvent(criticalMsg);
      eventStore.insertBatch([
        { ...evt, sessionId: 'crit-session-1', timestamp: baseTime + i * 1000 },
      ]);
    }
    for (let i = 0; i < 10; i++) {
      const evt = createErrorEvent(criticalMsg);
      eventStore.insertBatch([
        { ...evt, sessionId: 'crit-session-2', timestamp: baseTime + i * 1000 },
      ]);
    }

    // Test high: average loop count >= 7 but < 10
    // Session 1: 7 occurrences, Session 2: 7 occurrences => avg = 7 => high
    const highMsg = 'HighLoopError';
    for (let i = 0; i < 7; i++) {
      const evt = createErrorEvent(highMsg);
      eventStore.insertBatch([
        { ...evt, sessionId: 'high-session-1', timestamp: baseTime + i * 1000 },
      ]);
    }
    for (let i = 0; i < 7; i++) {
      const evt = createErrorEvent(highMsg);
      eventStore.insertBatch([
        { ...evt, sessionId: 'high-session-2', timestamp: baseTime + i * 1000 },
      ]);
    }

    // Test medium: average loop count >= 5 but < 7
    // Session 1: 5 occurrences, Session 2: 5 occurrences => avg = 5 => medium
    const mediumMsg = 'MediumLoopError';
    for (let i = 0; i < 5; i++) {
      const evt = createErrorEvent(mediumMsg);
      eventStore.insertBatch([
        { ...evt, sessionId: 'med-session-1', timestamp: baseTime + i * 1000 },
      ]);
    }
    for (let i = 0; i < 5; i++) {
      const evt = createErrorEvent(mediumMsg);
      eventStore.insertBatch([
        { ...evt, sessionId: 'med-session-2', timestamp: baseTime + i * 1000 },
      ]);
    }

    // Test low: average loop count < 5
    // Session 1: 3 occurrences, Session 2: 4 occurrences => avg = 3.5 => low
    const lowMsg = 'LowLoopError';
    for (let i = 0; i < 3; i++) {
      const evt = createErrorEvent(lowMsg);
      eventStore.insertBatch([
        { ...evt, sessionId: 'low-session-1', timestamp: baseTime + i * 1000 },
      ]);
    }
    for (let i = 0; i < 4; i++) {
      const evt = createErrorEvent(lowMsg);
      eventStore.insertBatch([
        { ...evt, sessionId: 'low-session-2', timestamp: baseTime + i * 1000 },
      ]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(4);

    const criticalIssue = issues.find((i) => i.title.includes('CriticalLoopError'));
    expect(criticalIssue?.severity).toBe('critical');

    const highIssue = issues.find((i) => i.title.includes('HighLoopError'));
    expect(highIssue?.severity).toBe('high');

    const mediumIssue = issues.find((i) => i.title.includes('MediumLoopError'));
    expect(mediumIssue?.severity).toBe('medium');

    const lowIssue = issues.find((i) => i.title.includes('LowLoopError'));
    expect(lowIssue?.severity).toBe('low');
  });

  it('uses custom minOccurrences threshold from context', async () => {
    const baseTime = NOW - HOUR / 2;
    const errorMessage = 'ThresholdTestError';

    // 4 occurrences per session (above default 3, below custom 5)
    for (let i = 0; i < 4; i++) {
      const evt = createErrorEvent(errorMessage);
      eventStore.insertBatch([{ ...evt, sessionId: 'session-1', timestamp: baseTime + i * 1000 }]);
    }
    for (let i = 0; i < 4; i++) {
      const evt = createErrorEvent(errorMessage);
      eventStore.insertBatch([{ ...evt, sessionId: 'session-2', timestamp: baseTime + i * 1000 }]);
    }

    // Default threshold (3) — 4 >= 3 => detected
    const issuesDefault = await rule.analyze(makeContext());
    expect(issuesDefault).toHaveLength(1);

    // Custom threshold (5) — 4 < 5 => NOT detected
    const issuesCustom = await rule.analyze(makeContext({
      thresholds: { 'error-loops': { minOccurrences: 5, minSessions: 2 } },
    }));
    expect(issuesCustom).toHaveLength(0);
  });
});
