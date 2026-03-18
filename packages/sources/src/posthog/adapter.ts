import type { MahoragaEvent, Cursor, TimeRange } from 'mahoraga-core';
import type {
  SourceAdapter,
  AdapterConfig,
  ValidationResult,
  PullBatch,
} from '../adapter.js';
import { transformPostHogEvent } from './transform.js';

/** Batch size for yielding events */
const BATCH_SIZE = 1000;

/** Default PostHog host */
const DEFAULT_HOST = 'https://app.posthog.com';

/**
 * PostHog Events API adapter.
 * Pulls events from PostHog's Events API (paginated JSON)
 * and transforms them to MahoragaEvent format.
 */
export class PostHogAdapter implements SourceAdapter {
  readonly name = 'posthog';

  /**
   * Validate that the configuration contains required API credentials.
   * @param config - Must contain apiKey and projectId
   * @returns Validation result with any errors
   */
  async validate(config: AdapterConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      errors.push('apiKey is required and must be a string');
    }

    if (!config.projectId || typeof config.projectId !== 'string') {
      errors.push('projectId is required and must be a string');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Pull events from the PostHog Events API.
   * @param config - Must contain apiKey and projectId. Optional host for self-hosted.
   * @param timeRange - Unix ms start/end
   * @param _cursor - Optional resume cursor (unused, included for interface compliance)
   * @yields {PullBatch} Batches of normalized events
   */
  async *pull(
    config: AdapterConfig,
    timeRange: TimeRange,
    _cursor?: Cursor,
  ): AsyncIterable<PullBatch> {
    const apiKey = config.apiKey as string;
    const projectId = config.projectId as string;
    const host =
      typeof config.host === 'string' ? config.host : DEFAULT_HOST;

    const after = new Date(timeRange.start).toISOString();
    const before = new Date(timeRange.end).toISOString();

    let url: string | null =
      `${host}/api/projects/${projectId}/events?after=${encodeURIComponent(after)}&before=${encodeURIComponent(before)}`;

    let batch: MahoragaEvent[] = [];
    let lastTimestamp = '';

    while (url) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `PostHog API returned ${response.status}: ${response.statusText}`,
        );
      }

      const body = (await response.json()) as {
        results?: unknown[];
        next?: string | null;
      };

      const results = Array.isArray(body.results) ? body.results : [];

      for (const raw of results) {
        const event = transformPostHogEvent(raw);
        if (!event) continue;

        batch.push(event);
        lastTimestamp = String(event.timestamp);

        if (batch.length >= BATCH_SIZE) {
          yield {
            events: batch,
            cursor: { value: lastTimestamp, updatedAt: Date.now() },
          };
          batch = [];
        }
      }

      url = typeof body.next === 'string' ? body.next : null;
    }

    if (batch.length > 0) {
      yield {
        events: batch,
        cursor: { value: lastTimestamp, updatedAt: Date.now() },
      };
    }
  }
}
