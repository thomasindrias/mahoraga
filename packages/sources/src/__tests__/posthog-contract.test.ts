import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostHogAdapter } from '../posthog/adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtureDir = join(__dirname, '..', '__fixtures__');

const POSTHOG_BASE_URL = 'https://app.posthog.com';
const PROJECT_ID = 'proj-42';
const EVENTS_PATH = `/api/projects/${PROJECT_ID}/events`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('PostHogAdapter HTTP contract', () => {
  const adapter = new PostHogAdapter();
  const timeRange = { start: 1705286400000, end: 1705372800000 };
  const config = { apiKey: 'phx_test-key', projectId: PROJECT_ID };

  it('sends correct Bearer auth header', async () => {
    let capturedAuth: string | null = null;

    server.use(
      http.get(`${POSTHOG_BASE_URL}${EVENTS_PATH}`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ results: [], next: null });
      }),
    );

    for await (const _batch of adapter.pull(config, timeRange)) {
      /* drain */
    }

    expect(capturedAuth).toBe('Bearer phx_test-key');
  });

  it('constructs correct URL with project ID and time range', async () => {
    let capturedUrl = '';

    server.use(
      http.get(`${POSTHOG_BASE_URL}${EVENTS_PATH}`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ results: [], next: null });
      }),
    );

    for await (const _batch of adapter.pull(config, timeRange)) {
      /* drain */
    }

    expect(capturedUrl).toContain(`/api/projects/${PROJECT_ID}/events`);
    expect(capturedUrl).toContain('after=');
    expect(capturedUrl).toContain('before=');

    const url = new URL(capturedUrl);
    const after = url.searchParams.get('after');
    const before = url.searchParams.get('before');
    expect(after).toBe(new Date(timeRange.start).toISOString());
    expect(before).toBe(new Date(timeRange.end).toISOString());
  });

  it('parses fixture into MahoragaEvents', async () => {
    const fixture = readFileSync(
      join(fixtureDir, 'posthog-events.json'),
      'utf-8',
    );
    const fixtureData = JSON.parse(fixture) as { results: unknown[]; next: string | null };

    server.use(
      http.get(`${POSTHOG_BASE_URL}${EVENTS_PATH}`, () => {
        return HttpResponse.json(fixtureData);
      }),
    );

    const events = [];
    for await (const batch of adapter.pull(config, timeRange)) {
      events.push(...batch.events);
    }

    expect(events).toHaveLength(3);
    expect(events[0]!.type).toBe('navigation');
    expect(events[0]!.metadata.source).toBe('posthog');
    expect(events[1]!.type).toBe('click');
    expect(events[2]!.type).toBe('error');
  });

  it('follows pagination via next URL', async () => {
    const page1 = {
      results: [
        {
          uuid: 'uuid-1',
          event: '$pageview',
          distinct_id: 'user-1',
          properties: { $session_id: 'sess-1', $current_url: 'https://example.com' },
          timestamp: '2024-01-15T10:00:00.000Z',
        },
      ],
      next: `${POSTHOG_BASE_URL}${EVENTS_PATH}?after=2024-01-15T10:00:00.000Z&cursor=abc123`,
    };

    const page2 = {
      results: [
        {
          uuid: 'uuid-2',
          event: '$exception',
          distinct_id: 'user-1',
          properties: {
            $session_id: 'sess-1',
            $current_url: 'https://example.com',
            $exception_message: 'Error',
          },
          timestamp: '2024-01-15T10:01:00.000Z',
        },
      ],
      next: null,
    };

    let requestCount = 0;

    server.use(
      http.get(`${POSTHOG_BASE_URL}${EVENTS_PATH}`, () => {
        requestCount++;
        if (requestCount === 1) {
          return HttpResponse.json(page1);
        }
        return HttpResponse.json(page2);
      }),
    );

    const events = [];
    for await (const batch of adapter.pull(config, timeRange)) {
      events.push(...batch.events);
    }

    expect(requestCount).toBe(2);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('navigation');
    expect(events[1]!.type).toBe('error');
  });

  it('yields empty for empty response', async () => {
    server.use(
      http.get(`${POSTHOG_BASE_URL}${EVENTS_PATH}`, () => {
        return HttpResponse.json({ results: [], next: null });
      }),
    );

    const events = [];
    for await (const batch of adapter.pull(config, timeRange)) {
      events.push(...batch.events);
    }

    expect(events).toHaveLength(0);
  });

  it('throws on non-200 response', async () => {
    server.use(
      http.get(`${POSTHOG_BASE_URL}${EVENTS_PATH}`, () => {
        return new HttpResponse('Unauthorized', { status: 401 });
      }),
    );

    await expect(async () => {
      for await (const _batch of adapter.pull(config, timeRange)) {
        /* should throw before yielding */
      }
    }).rejects.toThrow(/401/);
  });

  it('supports custom host for self-hosted PostHog', async () => {
    const customHost = 'https://posthog.internal.company.com';
    let capturedUrl = '';

    server.use(
      http.get(`${customHost}${EVENTS_PATH}`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ results: [], next: null });
      }),
    );

    for await (const _batch of adapter.pull(
      { ...config, host: customHost },
      timeRange,
    )) {
      /* drain */
    }

    expect(capturedUrl).toContain(customHost);
  });
});

describe('PostHogAdapter validation', () => {
  const adapter = new PostHogAdapter();

  it('validates valid config', async () => {
    const result = await adapter.validate({
      apiKey: 'phx_key',
      projectId: 'proj-1',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('rejects missing apiKey', async () => {
    const result = await adapter.validate({ projectId: 'proj-1' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('apiKey is required and must be a string');
  });

  it('rejects missing projectId', async () => {
    const result = await adapter.validate({ apiKey: 'phx_key' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('projectId is required and must be a string');
  });

  it('rejects empty config', async () => {
    const result = await adapter.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
