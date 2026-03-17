import type Database from 'better-sqlite3';
import type { MahoragaEvent, EventType } from '../types/index.js';

/**
 * Event storage operations — insert (with dedup) and query.
 */
export class EventStore {
  private readonly insertStmt: Database.Statement;

  /**
   * Create an EventStore.
   * @param db - Database instance
   */
  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT OR IGNORE INTO events (id, schema_version, source, event_type, session_id, timestamp, url, payload, metadata, ingested_at)
      VALUES (@id, @schemaVersion, @source, @eventType, @sessionId, @timestamp, @url, @payload, @metadata, @ingestedAt)
    `);
  }

  /**
   * Insert events with automatic deduplication via INSERT OR IGNORE.
   * @param events - Normalized events to insert
   * @returns Number of events actually inserted (excluding duplicates)
   */
  insertBatch(events: MahoragaEvent[]): number {
    const now = Date.now();
    let inserted = 0;

    const transaction = this.db.transaction((evts: MahoragaEvent[]) => {
      for (const event of evts) {
        const result = this.insertStmt.run({
          id: event.id,
          schemaVersion: event.schemaVersion,
          source: event.metadata.source,
          eventType: event.type,
          sessionId: event.sessionId,
          timestamp: event.timestamp,
          url: event.url,
          payload: JSON.stringify(event.payload),
          metadata: JSON.stringify(event.metadata),
          ingestedAt: now,
        });
        inserted += result.changes;
      }
    });

    transaction(events);
    return inserted;
  }

  /**
   * Query events by type and time range.
   * @param options - Query options
   * @returns Matching events
   */
  query(options: {
    type?: EventType;
    start?: number;
    end?: number;
    sessionId?: string;
    limit?: number;
  }): MahoragaEvent[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (options.type) {
      conditions.push('event_type = @type');
      params.type = options.type;
    }
    if (options.start !== undefined) {
      conditions.push('timestamp >= @start');
      params.start = options.start;
    }
    if (options.end !== undefined) {
      conditions.push('timestamp < @end');
      params.end = options.end;
    }
    if (options.sessionId) {
      conditions.push('session_id = @sessionId');
      params.sessionId = options.sessionId;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ? `LIMIT ${options.limit}` : '';

    const rows = this.db
      .prepare(`SELECT * FROM events ${where} ORDER BY timestamp ASC ${limit}`)
      .all(params) as EventRow[];

    return rows.map(rowToEvent);
  }

  /**
   * Delete events older than the given timestamp.
   * @param beforeTimestamp - Unix timestamp in milliseconds
   * @returns Number of events deleted
   */
  deleteOlderThan(beforeTimestamp: number): number {
    const result = this.db
      .prepare('DELETE FROM events WHERE timestamp < ?')
      .run(beforeTimestamp);
    return result.changes;
  }

  /**
   * Count events matching the given criteria.
   * @param options - Query options
   * @returns Count of matching events
   */
  count(options: {
    type?: EventType;
    start?: number;
    end?: number;
  }): number {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (options.type) {
      conditions.push('event_type = @type');
      params.type = options.type;
    }
    if (options.start !== undefined) {
      conditions.push('timestamp >= @start');
      params.start = options.start;
    }
    if (options.end !== undefined) {
      conditions.push('timestamp < @end');
      params.end = options.end;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM events ${where}`)
      .get(params) as { count: number };

    return row.count;
  }
}

interface EventRow {
  id: string;
  schema_version: number;
  source: string;
  event_type: string;
  session_id: string;
  timestamp: number;
  url: string;
  payload: string;
  metadata: string;
  ingested_at: number;
}

function rowToEvent(row: EventRow): MahoragaEvent {
  return {
    id: row.id,
    schemaVersion: row.schema_version as 1,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    type: row.event_type as EventType,
    url: row.url,
    payload: JSON.parse(row.payload),
    metadata: JSON.parse(row.metadata),
  };
}
