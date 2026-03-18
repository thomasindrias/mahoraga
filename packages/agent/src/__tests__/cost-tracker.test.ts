import { describe, it, expect } from 'vitest';
import { CostTracker } from '../cost-tracker.js';

describe('CostTracker', () => {
  it('allows dispatch on fresh tracker', () => {
    const tracker = new CostTracker();
    expect(tracker.canDispatch(20, 5)).toEqual({ allowed: true });
  });

  it('denies when cost budget exhausted', () => {
    const tracker = new CostTracker();
    tracker.recordDispatch(20);
    const result = tracker.canDispatch(20, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cost/i);
  });

  it('allows when just under cost budget', () => {
    const tracker = new CostTracker();
    tracker.recordDispatch(19.99);
    expect(tracker.canDispatch(20, 5)).toEqual({ allowed: true });
  });

  it('denies when dispatch limit reached', () => {
    const tracker = new CostTracker();
    for (let i = 0; i < 5; i++) tracker.recordDispatch(1);
    const result = tracker.canDispatch(20, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/dispatch limit/i);
  });

  it('allows when under dispatch limit', () => {
    const tracker = new CostTracker();
    for (let i = 0; i < 4; i++) tracker.recordDispatch(1);
    expect(tracker.canDispatch(20, 5)).toEqual({ allowed: true });
  });

  it('cost check takes priority over dispatch limit', () => {
    const tracker = new CostTracker();
    tracker.recordDispatch(21);
    tracker.recordDispatch(0);
    const result = tracker.canDispatch(20, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cost/i);
  });

  it('getSummary() returns accurate totals', () => {
    const tracker = new CostTracker();
    tracker.recordDispatch(1.5);
    tracker.recordDispatch(2.5);
    expect(tracker.getSummary()).toEqual({ totalCostUsd: 4, dispatchCount: 2 });
  });

  it('accepts zero-cost dispatch', () => {
    const tracker = new CostTracker();
    tracker.recordDispatch(0);
    expect(tracker.getSummary().dispatchCount).toBe(1);
    expect(tracker.getSummary().totalCostUsd).toBe(0);
  });
});
