/**
 * Token bucket rate limiter for API calls.
 * Shared across adapters to respect per-source rate limits.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  /**
   * Create a new rate limiter.
   * @param maxTokens - Maximum tokens in the bucket
   * @param refillRatePerSecond - Tokens added per second
   */
  constructor(
    private readonly maxTokens: number,
    private readonly refillRatePerSecond: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Wait until a token is available, then consume it.
   * @returns Promise that resolves when the request can proceed
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const waitMs = ((1 - this.tokens) / this.refillRatePerSecond) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRatePerSecond,
    );
    this.lastRefill = now;
  }
}
