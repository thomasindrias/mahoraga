import type Database from 'better-sqlite3';
import type { Cursor } from '../types/index.js';

/**
 * Checkpoint storage for tracking adapter pull progress.
 * Enables resume-from-failure by persisting cursor state per source.
 */
export class CheckpointStore {
  /**
   * Create a CheckpointStore.
   * @param db - Database instance
   */
  constructor(private readonly db: Database.Database) {}

  /**
   * Get the cursor for a source adapter.
   * @param source - Adapter name
   * @returns Cursor if one exists, null otherwise
   */
  get(source: string): Cursor | null {
    const row = this.db
      .prepare('SELECT cursor, last_pulled_at FROM checkpoints WHERE source = ?')
      .get(source) as { cursor: string; last_pulled_at: number } | undefined;

    if (!row) return null;

    return {
      value: row.cursor,
      updatedAt: row.last_pulled_at,
    };
  }

  /**
   * Set or update the cursor for a source adapter.
   * @param source - Adapter name
   * @param cursor - Cursor to persist
   */
  set(source: string, cursor: Cursor): void {
    this.db
      .prepare(
        `INSERT INTO checkpoints (source, cursor, last_pulled_at)
         VALUES (?, ?, ?)
         ON CONFLICT(source) DO UPDATE SET cursor = excluded.cursor, last_pulled_at = excluded.last_pulled_at`,
      )
      .run(source, cursor.value, cursor.updatedAt);
  }

  /**
   * Delete the cursor for a source adapter.
   * @param source - Adapter name
   */
  delete(source: string): void {
    this.db.prepare('DELETE FROM checkpoints WHERE source = ?').run(source);
  }
}
