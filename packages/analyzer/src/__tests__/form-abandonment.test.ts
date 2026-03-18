import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, EventStore } from 'mahoraga-core';
import type { DatabaseManager, RuleThresholds } from 'mahoraga-core';
import { createEvent, resetEventCounter } from 'mahoraga-core/testing';
import type { AnalysisContext } from '../rule.js';
import { FormAbandonmentRule } from '../rules/form-abandonment.js';

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

describe('FormAbandonmentRule', () => {
  const rule = new FormAbandonmentRule();

  it('detects high abandonment (4 abandon sessions, 1 submit → 80% → critical)', async () => {
    const baseTime = NOW - HOUR / 2;
    const formSelector = '#checkout-form';

    // 4 sessions that abandoned
    for (let i = 0; i < 4; i++) {
      const abandonEvent = createEvent({
        type: 'form',
        sessionId: `abandon-session-${i}`,
        timestamp: baseTime + i * 1000,
        url: 'https://example.com/checkout',
        payload: {
          type: 'form',
          formSelector,
          action: 'abandon',
        },
      });
      eventStore.insertBatch([abandonEvent]);
    }

    // 1 session that submitted
    const submitEvent = createEvent({
      type: 'form',
      sessionId: 'submit-session',
      timestamp: baseTime + 5000,
      url: 'https://example.com/checkout',
      payload: {
        type: 'form',
        formSelector,
        action: 'submit',
      },
    });
    eventStore.insertBatch([submitEvent]);

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('form-abandonment');
    expect(issues[0]!.title).toContain(formSelector);
    expect(issues[0]!.severity).toBe('critical'); // 4/(4+1) = 80% >= 80%
    expect(issues[0]!.evidence[0]!.type).toBe('abandonment_rate');
    expect(issues[0]!.frequency).toBe(4); // 4 abandon sessions
  });

  it('ignores low rate (3 abandon, 10 submit → ~23% < 40%)', async () => {
    const baseTime = NOW - HOUR / 2;
    const formSelector = '#signup-form';

    // 3 sessions that abandoned
    for (let i = 0; i < 3; i++) {
      const abandonEvent = createEvent({
        type: 'form',
        sessionId: `abandon-session-${i}`,
        timestamp: baseTime + i * 1000,
        url: 'https://example.com/signup',
        payload: {
          type: 'form',
          formSelector,
          action: 'abandon',
        },
      });
      eventStore.insertBatch([abandonEvent]);
    }

    // 10 sessions that submitted
    for (let i = 0; i < 10; i++) {
      const submitEvent = createEvent({
        type: 'form',
        sessionId: `submit-session-${i}`,
        timestamp: baseTime + 3000 + i * 1000,
        url: 'https://example.com/signup',
        payload: {
          type: 'form',
          formSelector,
          action: 'submit',
        },
      });
      eventStore.insertBatch([submitEvent]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0); // 3/(3+10) ~= 23% < 40%
  });

  it('ignores below session threshold (2 abandon sessions, even at 100% rate)', async () => {
    const baseTime = NOW - HOUR / 2;
    const formSelector = '#comment-form';

    // 2 sessions that abandoned (below threshold of 3)
    for (let i = 0; i < 2; i++) {
      const abandonEvent = createEvent({
        type: 'form',
        sessionId: `abandon-session-${i}`,
        timestamp: baseTime + i * 1000,
        url: 'https://example.com/blog',
        payload: {
          type: 'form',
          formSelector,
          action: 'abandon',
        },
      });
      eventStore.insertBatch([abandonEvent]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(0); // Only 2 abandon sessions < 3 threshold
  });

  it('assigns correct severity mapping', async () => {
    const baseTime = NOW - HOUR / 2;

    // Test 1: 60% rate (3 abandon, 2 submit) → high
    const form1 = '#form-high';
    for (let i = 0; i < 3; i++) {
      eventStore.insertBatch([
        createEvent({
          type: 'form',
          sessionId: `high-abandon-${i}`,
          timestamp: baseTime + i * 100,
          url: 'https://example.com/test',
          payload: { type: 'form', formSelector: form1, action: 'abandon' },
        }),
      ]);
    }
    for (let i = 0; i < 2; i++) {
      eventStore.insertBatch([
        createEvent({
          type: 'form',
          sessionId: `high-submit-${i}`,
          timestamp: baseTime + 300 + i * 100,
          url: 'https://example.com/test',
          payload: { type: 'form', formSelector: form1, action: 'submit' },
        }),
      ]);
    }

    // Test 2: 50% rate (3 abandon, 3 submit) → medium
    const form2 = '#form-medium';
    for (let i = 0; i < 3; i++) {
      eventStore.insertBatch([
        createEvent({
          type: 'form',
          sessionId: `medium-abandon-${i}`,
          timestamp: baseTime + 500 + i * 100,
          url: 'https://example.com/test2',
          payload: { type: 'form', formSelector: form2, action: 'abandon' },
        }),
      ]);
    }
    for (let i = 0; i < 3; i++) {
      eventStore.insertBatch([
        createEvent({
          type: 'form',
          sessionId: `medium-submit-${i}`,
          timestamp: baseTime + 800 + i * 100,
          url: 'https://example.com/test2',
          payload: { type: 'form', formSelector: form2, action: 'submit' },
        }),
      ]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(2);

    const highIssue = issues.find((i) => i.affectedElements[0]!.selector === form1);
    expect(highIssue?.severity).toBe('high'); // 60% >= 60%

    const mediumIssue = issues.find((i) => i.affectedElements[0]!.selector === form2);
    expect(mediumIssue?.severity).toBe('medium'); // 50% >= 40%, < 60%
  });

  it('groups by formSelector (different forms tracked separately)', async () => {
    const baseTime = NOW - HOUR / 2;

    // Form 1: high abandonment
    const form1 = '#form-a';
    for (let i = 0; i < 4; i++) {
      eventStore.insertBatch([
        createEvent({
          type: 'form',
          sessionId: `form1-abandon-${i}`,
          timestamp: baseTime + i * 100,
          url: 'https://example.com/page1',
          payload: { type: 'form', formSelector: form1, action: 'abandon' },
        }),
      ]);
    }
    eventStore.insertBatch([
      createEvent({
        type: 'form',
        sessionId: 'form1-submit',
        timestamp: baseTime + 500,
        url: 'https://example.com/page1',
        payload: { type: 'form', formSelector: form1, action: 'submit' },
      }),
    ]);

    // Form 2: high abandonment
    const form2 = '#form-b';
    for (let i = 0; i < 3; i++) {
      eventStore.insertBatch([
        createEvent({
          type: 'form',
          sessionId: `form2-abandon-${i}`,
          timestamp: baseTime + 1000 + i * 100,
          url: 'https://example.com/page2',
          payload: { type: 'form', formSelector: form2, action: 'abandon' },
        }),
      ]);
    }

    const issues = await rule.analyze(makeContext());
    expect(issues).toHaveLength(2);

    const selectors = issues.map((i) => i.affectedElements[0]!.selector).sort();
    expect(selectors).toEqual([form1, form2].sort());
  });

  it('uses custom minAbandonRate threshold from context', async () => {
    const baseTime = NOW - HOUR / 2;
    const formSelector = '#rate-form';

    // 3 abandon, 3 submit = 50% rate
    for (let i = 0; i < 3; i++) {
      eventStore.insertBatch([createEvent({
        type: 'form',
        sessionId: `abandon-${i}`,
        timestamp: baseTime + i * 100,
        url: 'https://example.com/test',
        payload: { type: 'form', formSelector, action: 'abandon' },
      })]);
    }
    for (let i = 0; i < 3; i++) {
      eventStore.insertBatch([createEvent({
        type: 'form',
        sessionId: `submit-${i}`,
        timestamp: baseTime + 300 + i * 100,
        url: 'https://example.com/test',
        payload: { type: 'form', formSelector, action: 'submit' },
      })]);
    }

    // Default minAbandonRate (0.4) — 50% >= 40% => detected
    const issuesDefault = await rule.analyze(makeContext());
    expect(issuesDefault).toHaveLength(1);

    // Custom minAbandonRate (0.6) — 50% < 60% => NOT detected
    const issuesCustom = await rule.analyze(makeContext({
      thresholds: { 'form-abandonment': { minAbandonRate: 0.6, minSessions: 3 } },
    }));
    expect(issuesCustom).toHaveLength(0);
  });
});
