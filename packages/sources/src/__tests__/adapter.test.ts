import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabase,
  EventStore,
  CheckpointStore,
  createIdempotencyKey,
} from '@mahoraga/core';
import type { MahoragaEvent, Cursor, TimeRange } from '@mahoraga/core';
import type { SourceAdapter, AdapterConfig, PullBatch, ValidationResult } from '../adapter.js';
import { PipelineRunner } from '../runner.js';
import { AmplitudeAdapter, transformAmplitudeEvent } from '../amplitude/adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<MahoragaEvent> = {}): MahoragaEvent {
  const sessionId = overrides.sessionId ?? 'sess-1';
  const timestamp = overrides.timestamp ?? 1700000000000;
  const type = overrides.type ?? 'click';
  const rawEventType = overrides.metadata?.rawEventType ?? 'test_click';
  const source = overrides.metadata?.source ?? 'test';
  const selector = '#btn';

  return {
    id: overrides.id ?? createIdempotencyKey(source, rawEventType, sessionId, String(timestamp), selector),
    schemaVersion: 1,
    sessionId,
    timestamp,
    type,
    url: overrides.url ?? 'https://example.com',
    payload: overrides.payload ?? {
      type: 'click',
      selector,
      coordinates: { x: 10, y: 20 },
      isRageClick: false,
    },
    metadata: { source, rawEventType },
  };
}

/** A mock adapter that yields predetermined batches */
class MockAdapter implements SourceAdapter {
  readonly name = 'mock';
  private readonly batches: PullBatch[];
  private shouldFail: boolean;
  private failAfterBatch: number;

  constructor(
    batches: PullBatch[],
    options: { shouldFail?: boolean; failAfterBatch?: number } = {},
  ) {
    this.batches = batches;
    this.shouldFail = options.shouldFail ?? false;
    this.failAfterBatch = options.failAfterBatch ?? Infinity;
  }

  async validate(config: AdapterConfig): Promise<ValidationResult> {
    if (!config.token) {
      return { valid: false, errors: ['token is required'] };
    }
    return { valid: true };
  }

  async *pull(
    _config: AdapterConfig,
    _timeRange: TimeRange,
    _cursor?: Cursor,
  ): AsyncIterable<PullBatch> {
    if (this.shouldFail) {
      throw new Error('Pull failed');
    }

    let batchIndex = 0;
    for (const batch of this.batches) {
      if (batchIndex >= this.failAfterBatch) {
        throw new Error('Pull failed mid-stream');
      }
      yield batch;
      batchIndex++;
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SourceAdapter interface contract', () => {
  it('should report validation errors for missing config keys', async () => {
    const adapter = new AmplitudeAdapter();
    const result = await adapter.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('apiKey is required and must be a string');
    expect(result.errors).toContain('secretKey is required and must be a string');
  });

  it('should pass validation with valid config', async () => {
    const adapter = new AmplitudeAdapter();
    const result = await adapter.validate({ apiKey: 'key', secretKey: 'secret' });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should report validation errors with mock adapter', async () => {
    const adapter = new MockAdapter([]);
    const result = await adapter.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('token is required');
  });
});

describe('transformAmplitudeEvent', () => {
  it('should transform a click event', () => {
    const raw = {
      event_type: 'Button Click',
      session_id: 12345,
      event_time: '2024-01-15 10:30:00',
      event_properties: {
        selector: '#submit-btn',
        text: 'Submit',
        x: 150,
        y: 300,
        current_url: 'https://app.example.com/form',
      },
    };

    const event = transformAmplitudeEvent(raw);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('click');
    expect(event!.sessionId).toBe('12345');
    expect(event!.url).toBe('https://app.example.com/form');
    expect(event!.metadata.source).toBe('amplitude');
    expect(event!.metadata.rawEventType).toBe('Button Click');
    expect(event!.payload).toEqual({
      type: 'click',
      selector: '#submit-btn',
      text: 'Submit',
      coordinates: { x: 150, y: 300 },
      isRageClick: false,
    });
  });

  it('should transform an error event', () => {
    const raw = {
      event_type: 'JS Error',
      session_id: 99999,
      event_time: '2024-01-15 11:00:00',
      event_properties: {
        message: 'TypeError: Cannot read properties of null',
        stack: 'at render (app.js:42)',
        current_url: 'https://app.example.com/dashboard',
      },
    };

    const event = transformAmplitudeEvent(raw);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('error');
    expect(event!.payload).toMatchObject({
      type: 'error',
      message: 'TypeError: Cannot read properties of null',
      stack: 'at render (app.js:42)',
      frequency: 1,
    });
  });

  it('should transform a navigation event', () => {
    const raw = {
      event_type: 'Page View',
      session_id: 11111,
      event_time: '2024-01-15 12:00:00',
      event_properties: {
        from: '/home',
        to: '/dashboard',
        current_url: 'https://app.example.com/dashboard',
      },
    };

    const event = transformAmplitudeEvent(raw);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('navigation');
    expect(event!.payload).toMatchObject({
      type: 'navigation',
      from: '/home',
      to: '/dashboard',
    });
  });

  it('should fall back to custom for unknown event types', () => {
    const raw = {
      event_type: 'feature_flag_evaluated',
      session_id: 22222,
      event_time: '2024-01-15 13:00:00',
      event_properties: {
        flag_name: 'dark_mode',
        variant: 'control',
      },
    };

    const event = transformAmplitudeEvent(raw);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('custom');
    expect(event!.payload).toMatchObject({
      type: 'custom',
      name: 'feature_flag_evaluated',
      properties: { flag_name: 'dark_mode', variant: 'control' },
    });
  });

  it('should return null for invalid input', () => {
    expect(transformAmplitudeEvent(null)).toBeNull();
    expect(transformAmplitudeEvent('string')).toBeNull();
    expect(transformAmplitudeEvent(42)).toBeNull();
    expect(transformAmplitudeEvent({})).toBeNull();
    expect(transformAmplitudeEvent({ event_type: 'test' })).toBeNull(); // no session_id
  });

  it('should generate a deterministic idempotency key', () => {
    const raw = {
      event_type: 'Button Click',
      session_id: 12345,
      event_time: '2024-01-15 10:30:00',
      event_properties: { selector: '#btn' },
    };

    const event1 = transformAmplitudeEvent(raw);
    const event2 = transformAmplitudeEvent(raw);
    expect(event1!.id).toBe(event2!.id);
  });
});

describe('PipelineRunner', () => {
  let dbManager: ReturnType<typeof createDatabase>;
  let eventStore: EventStore;
  let checkpointStore: CheckpointStore;
  let runner: PipelineRunner;

  beforeEach(() => {
    dbManager = createDatabase(':memory:');
    eventStore = new EventStore(dbManager.db);
    checkpointStore = new CheckpointStore(dbManager.db);
    runner = new PipelineRunner(eventStore, checkpointStore);
  });

  afterEach(() => {
    dbManager.close();
  });

  const timeRange: TimeRange = { start: 1700000000000, end: 1700100000000 };

  it('should run a successful pull and return ok', async () => {
    const events = [makeEvent(), makeEvent({ sessionId: 'sess-2', timestamp: 1700000001000 })];
    const adapter = new MockAdapter([
      {
        events,
        cursor: { value: '1700000001000', updatedAt: Date.now() },
      },
    ]);

    const result = await runner.run(adapter, { token: 'abc' }, timeRange);
    expect(result.status).toBe('ok');
    expect(result).toHaveProperty('eventCount', 2);
  });

  it('should persist checkpoints after each batch', async () => {
    const batch1Events = [makeEvent()];
    const batch2Events = [makeEvent({ sessionId: 'sess-2', timestamp: 1700000002000 })];

    const adapter = new MockAdapter([
      {
        events: batch1Events,
        cursor: { value: '1700000000000', updatedAt: Date.now() },
      },
      {
        events: batch2Events,
        cursor: { value: '1700000002000', updatedAt: Date.now() },
      },
    ]);

    await runner.run(adapter, { token: 'abc' }, timeRange);

    const cursor = checkpointStore.get('mock');
    expect(cursor).not.toBeNull();
    expect(cursor!.value).toBe('1700000002000');
  });

  it('should skip invalid events gracefully', async () => {
    const validEvent = makeEvent();
    const invalidEvent = {
      ...makeEvent({ sessionId: 'sess-bad' }),
      schemaVersion: 999 as unknown as 1, // will fail Zod validation (not literal 1)
    };

    const adapter = new MockAdapter([
      {
        events: [validEvent, invalidEvent as MahoragaEvent],
        cursor: { value: '1700000000000', updatedAt: Date.now() },
      },
    ]);

    const result = await runner.run(adapter, { token: 'abc' }, timeRange);
    expect(result.status).toBe('ok');
    expect(result).toHaveProperty('eventCount', 1);
  });

  it('should handle deduplication (same events twice)', async () => {
    const event = makeEvent();
    const cursor = { value: '1700000000000', updatedAt: Date.now() };

    // First run
    const adapter1 = new MockAdapter([{ events: [event], cursor }]);
    await runner.run(adapter1, { token: 'abc' }, timeRange);

    // Second run with the same event
    const adapter2 = new MockAdapter([{ events: [event], cursor }]);
    await runner.run(adapter2, { token: 'abc' }, timeRange);

    // Only 1 event should be in the store
    const stored = eventStore.query({});
    expect(stored).toHaveLength(1);
  });

  it('should return failed when adapter throws immediately', async () => {
    const adapter = new MockAdapter([], { shouldFail: true });
    const result = await runner.run(adapter, { token: 'abc' }, timeRange);
    expect(result.status).toBe('failed');
    expect(result).toHaveProperty('error');
  });

  it('should return partial when adapter fails mid-stream', async () => {
    const event = makeEvent();
    const adapter = new MockAdapter(
      [
        {
          events: [event],
          cursor: { value: '1700000000000', updatedAt: Date.now() },
        },
        {
          events: [makeEvent({ sessionId: 'sess-3', timestamp: 1700000003000 })],
          cursor: { value: '1700000003000', updatedAt: Date.now() },
        },
      ],
      { failAfterBatch: 1 },
    );

    const result = await runner.run(adapter, { token: 'abc' }, timeRange);
    expect(result.status).toBe('partial');
    expect(result).toHaveProperty('eventCount', 1);
    expect(result).toHaveProperty('error');
  });

  it('should insert events from multiple batches', async () => {
    const event1 = makeEvent({ sessionId: 'sess-a', timestamp: 1700000000000 });
    const event2 = makeEvent({ sessionId: 'sess-b', timestamp: 1700000001000 });
    const event3 = makeEvent({ sessionId: 'sess-c', timestamp: 1700000002000 });

    const adapter = new MockAdapter([
      {
        events: [event1, event2],
        cursor: { value: '1700000001000', updatedAt: Date.now() },
      },
      {
        events: [event3],
        cursor: { value: '1700000002000', updatedAt: Date.now() },
      },
    ]);

    const result = await runner.run(adapter, { token: 'abc' }, timeRange);
    expect(result.status).toBe('ok');
    expect(result).toHaveProperty('eventCount', 3);

    const stored = eventStore.query({});
    expect(stored).toHaveLength(3);
  });
});
