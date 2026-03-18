import { createIdempotencyKey } from 'mahoraga-core';
import type { MahoragaEvent, EventPayload } from 'mahoraga-core';

/**
 * Transform a raw PostHog event object into a MahoragaEvent.
 * @param raw - Raw PostHog event (parsed from JSON response)
 * @returns A normalized MahoragaEvent, or null if the event cannot be mapped
 */
export function transformPostHogEvent(raw: unknown): MahoragaEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const event = raw as Record<string, unknown>;

  const eventName = typeof event.event === 'string' ? event.event : null;
  if (!eventName) return null;

  const properties =
    typeof event.properties === 'object' && event.properties !== null
      ? (event.properties as Record<string, unknown>)
      : {};

  const distinctId = typeof event.distinct_id === 'string' ? event.distinct_id : null;
  const sessionId =
    typeof properties.$session_id === 'string'
      ? properties.$session_id
      : distinctId;
  if (!sessionId) return null;

  const rawTimestamp = typeof event.timestamp === 'string' ? event.timestamp : null;
  const timestamp = rawTimestamp ? new Date(rawTimestamp).getTime() : null;
  if (!timestamp || Number.isNaN(timestamp)) return null;

  const url =
    typeof properties.$current_url === 'string'
      ? properties.$current_url
      : 'unknown';

  const payload = mapPayload(eventName, properties);
  const type = payload.type;

  const distinguishingField = getDistinguishingField(type, payload, eventName);

  const id = createIdempotencyKey(
    'posthog',
    eventName,
    sessionId,
    String(timestamp),
    distinguishingField,
  );

  return {
    id,
    schemaVersion: 1,
    sessionId,
    timestamp,
    type,
    url,
    payload,
    metadata: {
      source: 'posthog',
      rawEventType: eventName,
    },
  };
}

/**
 * Get a distinguishing field for idempotency key generation.
 * @param type - The mapped event type
 * @param payload - The event payload
 * @param eventName - The raw PostHog event name
 * @returns A string to use as the distinguishing field
 */
function getDistinguishingField(
  type: string,
  payload: EventPayload,
  eventName: string,
): string {
  if (type === 'click') {
    return (payload as { selector?: string }).selector ?? '';
  }
  if (type === 'error') {
    return (payload as { message?: string }).message ?? '';
  }
  return eventName;
}

/**
 * Map a PostHog event name and properties to a MahoragaEvent payload.
 * @param eventName - PostHog event name
 * @param props - Event properties object
 * @returns Normalized event payload
 */
function mapPayload(
  eventName: string,
  props: Record<string, unknown>,
): EventPayload {
  // Navigation: $pageview / $pageleave
  if (eventName === '$pageview' || eventName === '$pageleave') {
    return {
      type: 'navigation',
      from: typeof props.$referrer === 'string' ? props.$referrer : '',
      to: typeof props.$current_url === 'string' ? props.$current_url : '',
      duration: typeof props.duration === 'number' ? props.duration : undefined,
    };
  }

  // Click: $autocapture with button/a element
  if (eventName === '$autocapture') {
    const elements = Array.isArray(props.$elements) ? props.$elements : [];
    const firstElement =
      elements.length > 0 && typeof elements[0] === 'object' && elements[0] !== null
        ? (elements[0] as Record<string, unknown>)
        : null;
    const tagName =
      firstElement && typeof firstElement.tag_name === 'string'
        ? firstElement.tag_name
        : '';

    if (tagName === 'button' || tagName === 'a') {
      const selector =
        firstElement && typeof firstElement.attr_id === 'string'
          ? `#${firstElement.attr_id}`
          : typeof firstElement?.tag_name === 'string'
            ? firstElement.tag_name
            : '[data-autocapture]';

      return {
        type: 'click',
        selector,
        text:
          firstElement && typeof firstElement.$el_text === 'string'
            ? firstElement.$el_text
            : undefined,
        coordinates: {
          x: typeof props.$mouse_x === 'number' ? props.$mouse_x : 0,
          y: typeof props.$mouse_y === 'number' ? props.$mouse_y : 0,
        },
        isRageClick: false,
      };
    }
  }

  // Error: $exception or event name containing "error"
  if (eventName === '$exception' || eventName.toLowerCase().includes('error')) {
    return {
      type: 'error',
      message:
        typeof props.$exception_message === 'string'
          ? props.$exception_message
          : typeof props.message === 'string'
            ? props.message
            : eventName,
      stack:
        typeof props.$exception_stack_trace_string === 'string'
          ? props.$exception_stack_trace_string
          : typeof props.stack === 'string'
            ? props.stack
            : undefined,
      componentName:
        typeof props.componentName === 'string' ? props.componentName : undefined,
      frequency: typeof props.frequency === 'number' ? props.frequency : 1,
    };
  }

  // Performance: $web_vitals or properties with web vitals values
  if (
    eventName === '$web_vitals' ||
    hasWebVitalsProperties(props)
  ) {
    const metric = resolveWebVitalsMetric(eventName, props);
    const value = resolveWebVitalsValue(props);
    return {
      type: 'performance',
      metric,
      value,
      rating: isValidRating(props.$web_vitals_rating)
        ? props.$web_vitals_rating
        : 'needs-improvement',
    };
  }

  // Fallback: custom event
  return {
    type: 'custom',
    name: eventName,
    properties: props,
  };
}

/**
 * Check if properties contain web vitals metric values.
 * @param props - Event properties
 * @returns True if web vitals properties are present
 */
function hasWebVitalsProperties(props: Record<string, unknown>): boolean {
  return (
    '$web_vitals_CLS_value' in props ||
    '$web_vitals_LCP_value' in props ||
    '$web_vitals_FID_value' in props ||
    '$web_vitals_INP_value' in props ||
    '$web_vitals_FCP_value' in props
  );
}

/**
 * Resolve the web vitals metric name from properties.
 * @param eventName - PostHog event name
 * @param props - Event properties
 * @returns The metric name
 */
function resolveWebVitalsMetric(
  eventName: string,
  props: Record<string, unknown>,
): string {
  if ('$web_vitals_CLS_value' in props) return 'CLS';
  if ('$web_vitals_LCP_value' in props) return 'LCP';
  if ('$web_vitals_FID_value' in props) return 'FID';
  if ('$web_vitals_INP_value' in props) return 'INP';
  if ('$web_vitals_FCP_value' in props) return 'FCP';
  return eventName;
}

/**
 * Resolve the web vitals value from properties.
 * @param props - Event properties
 * @returns The metric value
 */
function resolveWebVitalsValue(props: Record<string, unknown>): number {
  for (const key of [
    '$web_vitals_CLS_value',
    '$web_vitals_LCP_value',
    '$web_vitals_FID_value',
    '$web_vitals_INP_value',
    '$web_vitals_FCP_value',
  ]) {
    if (typeof props[key] === 'number') return props[key];
  }
  return 0;
}

function isValidRating(v: unknown): v is 'good' | 'needs-improvement' | 'poor' {
  return v === 'good' || v === 'needs-improvement' || v === 'poor';
}
