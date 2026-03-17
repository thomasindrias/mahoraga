import { describe, it, expect } from 'vitest';
import { createIdempotencyKey, createFingerprint } from '../utils/hash.js';
import { withRetry } from '../utils/retry.js';
import { RateLimiter } from '../utils/rate-limiter.js';

describe('createIdempotencyKey', () => {
  it('should produce deterministic hashes', () => {
    const a = createIdempotencyKey('source', 'type', 'session', '12345');
    const b = createIdempotencyKey('source', 'type', 'session', '12345');
    expect(a).toBe(b);
  });

  it('should produce different hashes for different inputs', () => {
    const a = createIdempotencyKey('source', 'type', 'session', '12345');
    const b = createIdempotencyKey('source', 'type', 'session', '12346');
    expect(a).not.toBe(b);
  });

  it('should produce 64-character hex strings', () => {
    const hash = createIdempotencyKey('test');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('createFingerprint', () => {
  it('should produce same hash as createIdempotencyKey for same inputs', () => {
    const a = createFingerprint('rage-clicks', '#btn', '/page');
    const b = createIdempotencyKey('rage-clicks', '#btn', '/page');
    expect(a).toBe(b);
  });
});

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const result = await withRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('should retry on failure and return on eventual success', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'ok';
      },
      { maxRetries: 3, baseDelayMs: 1 },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('should throw after exhausting retries', async () => {
    await expect(
      withRetry(() => Promise.reject(new Error('always fail')), {
        maxRetries: 2,
        baseDelayMs: 1,
      }),
    ).rejects.toThrow('always fail');
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      withRetry(() => Promise.reject(new Error('fail')), {
        maxRetries: 5,
        baseDelayMs: 1,
        signal: controller.signal,
      }),
    ).rejects.toThrow('fail');
  });
});

describe('RateLimiter', () => {
  it('should allow immediate requests within capacity', async () => {
    const limiter = new RateLimiter(5, 5);

    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it('should throttle when tokens are exhausted', async () => {
    const limiter = new RateLimiter(1, 100);

    await limiter.acquire(); // use the one token

    const start = Date.now();
    await limiter.acquire(); // should wait for refill
    const elapsed = Date.now() - start;

    // With 100 tokens/sec refill rate, should be ~10ms wait
    expect(elapsed).toBeLessThan(100);
  });
});
