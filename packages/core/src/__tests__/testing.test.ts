import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEvent,
  createSession,
  createRageClickSequence,
  createErrorEvent,
  resetEventCounter,
} from '../testing/index.js';
import { MahoragaEventSchema } from '../schemas/event.js';

beforeEach(() => {
  resetEventCounter();
});

describe('createEvent', () => {
  it('should create a valid event with defaults', () => {
    const event = createEvent();
    expect(() => MahoragaEventSchema.parse(event)).not.toThrow();
    expect(event.schemaVersion).toBe(1);
    expect(event.type).toBe('click');
  });

  it('should accept overrides', () => {
    const event = createEvent({
      url: 'https://custom.com',
      type: 'error',
      payload: { type: 'error', message: 'test', frequency: 1 },
    });

    expect(event.url).toBe('https://custom.com');
    expect(event.type).toBe('error');
  });
});

describe('createSession', () => {
  it('should create events with the same sessionId', () => {
    const events = createSession([{}, {}, {}]);
    expect(events).toHaveLength(3);

    const sessionIds = new Set(events.map((e) => e.sessionId));
    expect(sessionIds.size).toBe(1);
  });
});

describe('createRageClickSequence', () => {
  it('should create rapid clicks on the same selector', () => {
    const events = createRageClickSequence('#btn', 5, 800);
    expect(events).toHaveLength(5);

    for (const event of events) {
      expect(event.type).toBe('click');
      expect(event.payload.type).toBe('click');
      if (event.payload.type === 'click') {
        expect(event.payload.selector).toBe('#btn');
      }
    }

    // All within the same session
    const sessionIds = new Set(events.map((e) => e.sessionId));
    expect(sessionIds.size).toBe(1);

    // All within withinMs
    const timestamps = events.map((e) => e.timestamp);
    const span = timestamps[timestamps.length - 1]! - timestamps[0]!;
    expect(span).toBeLessThan(800);
  });
});

describe('createErrorEvent', () => {
  it('should create a valid error event', () => {
    const event = createErrorEvent('ReferenceError: x is not defined', 5);
    expect(event.type).toBe('error');
    expect(event.payload.type).toBe('error');
    if (event.payload.type === 'error') {
      expect(event.payload.message).toBe('ReferenceError: x is not defined');
      expect(event.payload.frequency).toBe(5);
    }
  });
});
