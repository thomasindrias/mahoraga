import type { MahoragaEvent, Cursor, TimeRange } from '@mahoraga/core';

/** Adapter-specific configuration passed to pull() and validate() */
export interface AdapterConfig {
  [key: string]: unknown;
}

/** Result of validating an adapter configuration */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/** A batch of events yielded by an adapter's pull() method */
export interface PullBatch {
  events: MahoragaEvent[];
  cursor: Cursor;
}

/** Outcome of a full pull run */
export type PullResult =
  | { status: 'ok'; eventCount: number }
  | { status: 'partial'; eventCount: number; error: Error }
  | { status: 'failed'; error: Error };

/**
 * Contract that all source adapters must implement.
 * Adapters transform vendor-specific event formats into MahoragaEvent.
 */
export interface SourceAdapter {
  /** Human-readable adapter name (used as checkpoint key) */
  readonly name: string;

  /**
   * Pull events from the source in batches.
   * @param config - Adapter-specific configuration (API keys, etc.)
   * @param timeRange - Time window to pull events from
   * @param cursor - Optional resume cursor from a previous run
   * @returns AsyncIterable of PullBatch
   */
  pull(
    config: AdapterConfig,
    timeRange: TimeRange,
    cursor?: Cursor,
  ): AsyncIterable<PullBatch>;

  /**
   * Validate that the adapter configuration is complete and correct.
   * @param config - Configuration to validate
   * @returns Validation result with any errors
   */
  validate(config: AdapterConfig): Promise<ValidationResult>;
}
