import {
  MahoragaEventSchema,
  EventStore,
  CheckpointStore,
  withRetry,
} from '@mahoraga/core';
import type { TimeRange } from '@mahoraga/core';
import type { SourceAdapter, AdapterConfig, PullResult } from './adapter.js';

/**
 * Pipeline runner that wraps adapter calls with validation, retry,
 * checkpoint persistence, and deduplication.
 */
export class PipelineRunner {
  /**
   * Create a PipelineRunner.
   * @param eventStore - Store for persisting validated events
   * @param checkpointStore - Store for persisting pull cursors
   */
  constructor(
    private readonly eventStore: EventStore,
    private readonly checkpointStore: CheckpointStore,
  ) {}

  /**
   * Execute a full pull run for the given adapter.
   * @param adapter - Source adapter to pull from
   * @param config - Adapter-specific configuration
   * @param timeRange - Time window to pull events from
   * @returns PullResult indicating success, partial, or failure
   */
  async run(
    adapter: SourceAdapter,
    config: AdapterConfig,
    timeRange: TimeRange,
  ): Promise<PullResult> {
    const existingCursor = this.checkpointStore.get(adapter.name) ?? undefined;
    let totalEvents = 0;

    try {
      const batches = await withRetry(
        async () => adapter.pull(config, timeRange, existingCursor),
        { maxRetries: 2, baseDelayMs: 500 },
      );

      for await (const batch of batches) {
        const validEvents = [];

        for (const event of batch.events) {
          const result = MahoragaEventSchema.safeParse(event);
          if (result.success) {
            validEvents.push(result.data);
          }
          // Skip invalid events silently
        }

        if (validEvents.length > 0) {
          this.eventStore.insertBatch(validEvents);
        }

        totalEvents += validEvents.length;
        this.checkpointStore.set(adapter.name, batch.cursor);
      }

      return { status: 'ok', eventCount: totalEvents };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (totalEvents > 0) {
        return { status: 'partial', eventCount: totalEvents, error: err };
      }

      return { status: 'failed', error: err };
    }
  }
}
