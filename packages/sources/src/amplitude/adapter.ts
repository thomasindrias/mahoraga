import { createIdempotencyKey } from '@mahoraga/core';
import type { MahoragaEvent, Cursor, TimeRange, EventPayload } from '@mahoraga/core';
import type {
  SourceAdapter,
  AdapterConfig,
  ValidationResult,
  PullBatch,
} from '../adapter.js';

/** Batch size for yielding events */
const BATCH_SIZE = 1000;

/**
 * Transform a raw Amplitude event object into a MahoragaEvent.
 * @param raw - Raw Amplitude event (parsed from NDJSON)
 * @returns A normalized MahoragaEvent, or null if the event cannot be mapped
 */
export function transformAmplitudeEvent(raw: unknown): MahoragaEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const event = raw as Record<string, unknown>;

  const eventType = typeof event.event_type === 'string' ? event.event_type : null;
  if (!eventType) return null;

  const sessionId = event.session_id != null ? String(event.session_id) : null;
  if (!sessionId) return null;

  const eventTime = typeof event.event_time === 'string' ? event.event_time : null;
  const timestamp = eventTime ? new Date(eventTime).getTime() : null;
  if (!timestamp || Number.isNaN(timestamp)) return null;

  const url =
    typeof event.event_properties === 'object' &&
    event.event_properties !== null &&
    typeof (event.event_properties as Record<string, unknown>).current_url === 'string'
      ? ((event.event_properties as Record<string, unknown>).current_url as string)
      : 'unknown';

  const props =
    typeof event.event_properties === 'object' && event.event_properties !== null
      ? (event.event_properties as Record<string, unknown>)
      : {};

  const payload = mapPayload(eventType, props);
  const type = payload.type;

  const selector =
    type === 'click'
      ? (payload as { selector?: string }).selector ?? ''
      : type === 'error'
        ? (payload as { message?: string }).message ?? ''
        : eventType;

  const id = createIdempotencyKey('amplitude', eventType, sessionId, String(timestamp), selector);

  return {
    id,
    schemaVersion: 1,
    sessionId,
    timestamp,
    type,
    url,
    payload,
    metadata: {
      source: 'amplitude',
      rawEventType: eventType,
    },
  };
}

/**
 * Map an Amplitude event_type and properties to a MahoragaEvent payload.
 */
function mapPayload(
  eventType: string,
  props: Record<string, unknown>,
): EventPayload {
  const lower = eventType.toLowerCase();

  if (lower.includes('click') || lower.includes('tap')) {
    return {
      type: 'click',
      selector: typeof props.selector === 'string' ? props.selector : `[data-event="${eventType}"]`,
      text: typeof props.text === 'string' ? props.text : undefined,
      coordinates: {
        x: typeof props.x === 'number' ? props.x : 0,
        y: typeof props.y === 'number' ? props.y : 0,
      },
      isRageClick: false,
    };
  }

  if (lower.includes('error') || lower.includes('exception') || lower.includes('crash')) {
    return {
      type: 'error',
      message: typeof props.message === 'string' ? props.message : eventType,
      stack: typeof props.stack === 'string' ? props.stack : undefined,
      componentName: typeof props.componentName === 'string' ? props.componentName : undefined,
      frequency: typeof props.frequency === 'number' ? props.frequency : 1,
    };
  }

  if (lower.includes('navigate') || lower.includes('page') || lower.includes('view')) {
    return {
      type: 'navigation',
      from: typeof props.from === 'string' ? props.from : '',
      to: typeof props.to === 'string' ? props.to : (typeof props.current_url === 'string' ? props.current_url : ''),
      duration: typeof props.duration === 'number' ? props.duration : undefined,
    };
  }

  if (lower.includes('performance') || lower.includes('vitals') || lower.includes('lcp') || lower.includes('cls')) {
    return {
      type: 'performance',
      metric: typeof props.metric === 'string' ? props.metric : eventType,
      value: typeof props.value === 'number' ? props.value : 0,
      rating: isValidRating(props.rating) ? props.rating : 'needs-improvement',
    };
  }

  if (lower.includes('form') || lower.includes('submit') || lower.includes('input')) {
    return {
      type: 'form',
      formSelector: typeof props.formSelector === 'string' ? props.formSelector : `[data-form="${eventType}"]`,
      action: isValidFormAction(props.action) ? props.action : 'submit',
      fieldSelector: typeof props.fieldSelector === 'string' ? props.fieldSelector : undefined,
      duration: typeof props.duration === 'number' ? props.duration : undefined,
    };
  }

  // Fallback: custom event
  return {
    type: 'custom',
    name: eventType,
    properties: props,
  };
}

function isValidRating(v: unknown): v is 'good' | 'needs-improvement' | 'poor' {
  return v === 'good' || v === 'needs-improvement' || v === 'poor';
}

function isValidFormAction(v: unknown): v is 'focus' | 'blur' | 'submit' | 'abandon' {
  return v === 'focus' || v === 'blur' || v === 'submit' || v === 'abandon';
}

/**
 * Format a Unix ms timestamp to Amplitude's YYYYMMDDTHHmm format.
 */
function formatAmplitudeDate(timestampMs: number): string {
  const d = new Date(timestampMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}`;
}

/**
 * Amplitude Export API adapter.
 * Pulls events from Amplitude's Export API (GZIP-compressed NDJSON)
 * and transforms them to MahoragaEvent format.
 */
export class AmplitudeAdapter implements SourceAdapter {
  readonly name = 'amplitude';

  /**
   * Validate that the configuration contains required API credentials.
   * @param config - Must contain apiKey and secretKey
   */
  async validate(config: AdapterConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      errors.push('apiKey is required and must be a string');
    }

    if (!config.secretKey || typeof config.secretKey !== 'string') {
      errors.push('secretKey is required and must be a string');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Pull events from the Amplitude Export API.
   * @param config - Must contain apiKey and secretKey
   * @param timeRange - Unix ms start/end
   * @param cursor - Optional resume cursor (unused for Amplitude, included for interface compliance)
   */
  async *pull(
    config: AdapterConfig,
    timeRange: TimeRange,
    _cursor?: Cursor,
  ): AsyncIterable<PullBatch> {
    const apiKey = config.apiKey as string;
    const secretKey = config.secretKey as string;

    const start = formatAmplitudeDate(timeRange.start);
    const end = formatAmplitudeDate(timeRange.end);

    const url = `https://amplitude.com/api/2/export?start=${start}&end=${end}`;
    const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Amplitude API returned ${response.status}: ${response.statusText}`);
    }

    const body = await response.text();
    const lines = body.split('\n').filter((line) => line.trim().length > 0);

    let batch: MahoragaEvent[] = [];
    let lastTimestamp = '';

    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      const event = transformAmplitudeEvent(parsed);
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

    if (batch.length > 0) {
      yield {
        events: batch,
        cursor: { value: lastTimestamp, updatedAt: Date.now() },
      };
    }
  }
}
