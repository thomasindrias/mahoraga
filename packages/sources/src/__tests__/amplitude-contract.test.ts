import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AmplitudeAdapter } from '../amplitude/adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtureDir = join(__dirname, '..', '__fixtures__');

const AMPLITUDE_EXPORT_URL = 'https://amplitude.com/api/2/export';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('AmplitudeAdapter HTTP contract', () => {
  const adapter = new AmplitudeAdapter();
  const timeRange = { start: 1705286400000, end: 1705372800000 };

  it('sends correct Basic auth header', async () => {
    let capturedAuth: string | null = null;

    server.use(
      http.get(AMPLITUDE_EXPORT_URL, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return new HttpResponse('', { status: 200 });
      }),
    );

    for await (const _batch of adapter.pull(
      { apiKey: 'test-key', secretKey: 'test-secret' },
      timeRange,
    )) { /* drain */ }

    expect(capturedAuth).toBe(
      `Basic ${Buffer.from('test-key:test-secret').toString('base64')}`,
    );
  });

  it('sends formatted start/end query params', async () => {
    let capturedUrl = '';

    server.use(
      http.get(AMPLITUDE_EXPORT_URL, ({ request }) => {
        capturedUrl = request.url;
        return new HttpResponse('', { status: 200 });
      }),
    );

    for await (const _batch of adapter.pull(
      { apiKey: 'k', secretKey: 's' },
      timeRange,
    )) { /* drain */ }

    expect(capturedUrl).toContain('start=20240115T0240');
    expect(capturedUrl).toContain('end=20240116T0240');
  });

  it('parses NDJSON fixture into MahoragaEvents', async () => {
    const fixture = readFileSync(
      join(fixtureDir, 'amplitude-export.ndjson'),
      'utf-8',
    );

    server.use(
      http.get(AMPLITUDE_EXPORT_URL, () => {
        return new HttpResponse(fixture, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const events = [];
    for await (const batch of adapter.pull(
      { apiKey: 'k', secretKey: 's' },
      timeRange,
    )) {
      events.push(...batch.events);
    }

    expect(events).toHaveLength(3);
    expect(events[0]!.type).toBe('click');
    expect(events[0]!.metadata.source).toBe('amplitude');
    expect(events[1]!.type).toBe('error');
    expect(events[2]!.type).toBe('navigation');
  });

  it('yields empty for empty response', async () => {
    server.use(
      http.get(AMPLITUDE_EXPORT_URL, () => {
        return new HttpResponse('', { status: 200 });
      }),
    );

    const events = [];
    for await (const batch of adapter.pull(
      { apiKey: 'k', secretKey: 's' },
      timeRange,
    )) {
      events.push(...batch.events);
    }
    expect(events).toHaveLength(0);
  });

  it('throws on non-200 response', async () => {
    server.use(
      http.get(AMPLITUDE_EXPORT_URL, () => {
        return new HttpResponse('Unauthorized', { status: 401 });
      }),
    );

    await expect(async () => {
      for await (const _batch of adapter.pull(
        { apiKey: 'bad', secretKey: 'bad' },
        timeRange,
      )) { /* should throw before yielding */ }
    }).rejects.toThrow(/401/);
  });
});
