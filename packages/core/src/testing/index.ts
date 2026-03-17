import type { MahoragaEvent, ClickPayload, ErrorPayload } from '../types/index.js';
import { createIdempotencyKey } from '../utils/hash.js';

let eventCounter = 0;

/**
 * Create a normalized event with sensible defaults.
 * @param overrides - Fields to override
 * @returns A complete MahoragaEvent
 */
export function createEvent(
  overrides: Partial<MahoragaEvent> = {},
): MahoragaEvent {
  const counter = ++eventCounter;
  const timestamp = overrides.timestamp ?? Date.now() - counter * 1000;
  const sessionId = overrides.sessionId ?? `session-${counter}`;
  const type = overrides.type ?? 'click';

  const defaultPayload: ClickPayload = {
    type: 'click',
    selector: '#btn-default',
    coordinates: { x: 100, y: 200 },
    isRageClick: false,
  };

  const payload = overrides.payload ?? defaultPayload;
  const source = overrides.metadata?.source ?? 'test';
  const rawEventType = overrides.metadata?.rawEventType ?? 'test_event';

  const id =
    overrides.id ??
    createIdempotencyKey(source, rawEventType, sessionId, String(timestamp));

  return {
    id,
    schemaVersion: 1,
    sessionId,
    timestamp,
    type,
    url: overrides.url ?? 'https://example.com/test',
    payload,
    metadata: { source, rawEventType },
    ...overrides,
    // Ensure id is recalculated if overrides changed the hash inputs
  };
}

/**
 * Create a session's worth of events with the same session ID.
 * @param events - Partial events (all will share the same sessionId)
 * @returns Array of MahoragaEvents with the same sessionId
 */
export function createSession(
  events: Partial<MahoragaEvent>[],
): MahoragaEvent[] {
  const sessionId = `session-${++eventCounter}`;
  return events.map((e) => createEvent({ sessionId, ...e }));
}

/**
 * Create a rage-click sequence for testing rage-click detection.
 * @param selector - CSS selector of the clicked element
 * @param count - Number of rapid clicks
 * @param withinMs - Time window for all clicks (default: 800ms)
 * @returns Array of click events simulating a rage-click pattern
 */
export function createRageClickSequence(
  selector: string,
  count: number,
  withinMs = 800,
): MahoragaEvent[] {
  const sessionId = `rage-session-${++eventCounter}`;
  const baseTime = Date.now() - 60_000;
  const interval = Math.floor(withinMs / count);

  return Array.from({ length: count }, (_, i) => {
    const timestamp = baseTime + i * interval;
    const payload: ClickPayload = {
      type: 'click',
      selector,
      coordinates: { x: 100, y: 200 },
      isRageClick: i >= 2,
    };

    return createEvent({
      sessionId,
      timestamp,
      type: 'click',
      url: 'https://example.com/page',
      payload,
    });
  });
}

/**
 * Create an error event for testing error-spike detection.
 * @param message - Error message
 * @param frequency - Number of sessions affected
 * @returns A single error event
 */
export function createErrorEvent(
  message: string,
  frequency = 1,
): MahoragaEvent {
  const payload: ErrorPayload = {
    type: 'error',
    message,
    frequency,
  };

  return createEvent({
    type: 'error',
    payload,
  });
}

/**
 * Reset the internal event counter. Useful in test setup.
 */
export function resetEventCounter(): void {
  eventCounter = 0;
}
