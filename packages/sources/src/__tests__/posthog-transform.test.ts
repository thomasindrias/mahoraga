import { describe, it, expect } from 'vitest';
import { transformPostHogEvent } from '../posthog/transform.js';

describe('transformPostHogEvent', () => {
  const baseEvent = {
    uuid: 'test-uuid',
    distinct_id: 'user-1',
    properties: {
      $session_id: 'sess-001',
      $current_url: 'https://example.com/page',
    },
    timestamp: '2024-01-15T10:30:00.000Z',
  };

  it('maps $pageview to navigation type', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: '$pageview',
      properties: {
        ...baseEvent.properties,
        $referrer: 'https://example.com/home',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('navigation');
    expect(result!.payload).toMatchObject({
      type: 'navigation',
      from: 'https://example.com/home',
      to: 'https://example.com/page',
    });
    expect(result!.metadata.source).toBe('posthog');
    expect(result!.metadata.rawEventType).toBe('$pageview');
  });

  it('maps $autocapture with button element to click type', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: '$autocapture',
      properties: {
        ...baseEvent.properties,
        $elements: [
          { tag_name: 'button', attr_id: 'submit-btn', $el_text: 'Submit' },
        ],
        $mouse_x: 150,
        $mouse_y: 300,
      },
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('click');
    expect(result!.payload).toMatchObject({
      type: 'click',
      selector: '#submit-btn',
      text: 'Submit',
      coordinates: { x: 150, y: 300 },
      isRageClick: false,
    });
  });

  it('maps $exception to error type', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: '$exception',
      properties: {
        ...baseEvent.properties,
        $exception_message: 'TypeError: null reference',
        $exception_stack_trace_string: 'at render (app.tsx:42)',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('error');
    expect(result!.payload).toMatchObject({
      type: 'error',
      message: 'TypeError: null reference',
      stack: 'at render (app.tsx:42)',
    });
  });

  it('maps $web_vitals to performance type', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: '$web_vitals',
      properties: {
        ...baseEvent.properties,
        $web_vitals_CLS_value: 0.15,
        $web_vitals_rating: 'poor',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('performance');
    expect(result!.payload).toMatchObject({
      type: 'performance',
      metric: 'CLS',
      value: 0.15,
      rating: 'poor',
    });
  });

  it('maps unknown event to custom type', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: 'user_signed_up',
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('custom');
    expect(result!.payload).toMatchObject({
      type: 'custom',
      name: 'user_signed_up',
    });
  });

  it('uses $session_id as sessionId', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: '$pageview',
    });

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('sess-001');
  });

  it('falls back to distinct_id when no $session_id', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: '$pageview',
      properties: {
        $current_url: 'https://example.com/page',
        // no $session_id
      },
    });

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('user-1');
  });

  it('returns null for invalid input', () => {
    expect(transformPostHogEvent(null)).toBeNull();
    expect(transformPostHogEvent(undefined)).toBeNull();
    expect(transformPostHogEvent('not-an-object')).toBeNull();
    expect(transformPostHogEvent(42)).toBeNull();
    expect(transformPostHogEvent({})).toBeNull();
    expect(transformPostHogEvent({ event: '$pageview' })).toBeNull(); // no distinct_id or session_id
  });

  it('maps $pageleave to navigation type', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: '$pageleave',
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('navigation');
  });

  it('maps $autocapture with anchor element to click type', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: '$autocapture',
      properties: {
        ...baseEvent.properties,
        $elements: [{ tag_name: 'a', attr_id: 'nav-link', $el_text: 'Home' }],
      },
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('click');
    expect(result!.payload).toMatchObject({
      type: 'click',
      selector: '#nav-link',
    });
  });

  it('maps event name containing "error" to error type', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: 'api_error_occurred',
      properties: {
        ...baseEvent.properties,
        message: 'Server returned 500',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('error');
    expect(result!.payload).toMatchObject({
      type: 'error',
      message: 'Server returned 500',
    });
  });

  it('detects web vitals from properties even without $web_vitals event name', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: 'custom_perf_event',
      properties: {
        ...baseEvent.properties,
        $web_vitals_LCP_value: 2500,
      },
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('performance');
    expect(result!.payload).toMatchObject({
      type: 'performance',
      metric: 'LCP',
      value: 2500,
    });
  });

  it('uses "unknown" as URL when $current_url is missing', () => {
    const result = transformPostHogEvent({
      ...baseEvent,
      event: '$pageview',
      properties: {
        $session_id: 'sess-001',
        // no $current_url
      },
    });

    expect(result).not.toBeNull();
    expect(result!.url).toBe('unknown');
  });

  it('generates deterministic idempotency keys', () => {
    const event1 = transformPostHogEvent({
      ...baseEvent,
      event: '$pageview',
    });
    const event2 = transformPostHogEvent({
      ...baseEvent,
      event: '$pageview',
    });

    expect(event1).not.toBeNull();
    expect(event2).not.toBeNull();
    expect(event1!.id).toBe(event2!.id);
  });
});
