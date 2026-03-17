import type Database from 'better-sqlite3';
import type { RunReport, RunError } from '../types/index.js';

/**
 * Run report storage for observability.
 */
export class RunStore {
  /**
   * Create a RunStore.
   * @param db - Database instance
   */
  constructor(private readonly db: Database.Database) {}

  /**
   * Create a new run report.
   * @param id - Unique run ID
   * @returns The run ID
   */
  create(id: string): string {
    this.db
      .prepare(
        `INSERT INTO runs (id, started_at, status) VALUES (?, ?, 'running')`,
      )
      .run(id, Date.now());
    return id;
  }

  /**
   * Update run counters incrementally.
   * @param id - Run ID
   * @param updates - Fields to update
   * @param updates.eventsPulled - Number of events pulled to add
   * @param updates.issuesDetected - Number of issues detected to add
   * @param updates.prsCreated - Number of PRs created to add
   */
  update(
    id: string,
    updates: {
      eventsPulled?: number;
      issuesDetected?: number;
      prsCreated?: number;
    },
  ): void {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (updates.eventsPulled !== undefined) {
      sets.push('events_pulled = events_pulled + @eventsPulled');
      params.eventsPulled = updates.eventsPulled;
    }
    if (updates.issuesDetected !== undefined) {
      sets.push('issues_detected = issues_detected + @issuesDetected');
      params.issuesDetected = updates.issuesDetected;
    }
    if (updates.prsCreated !== undefined) {
      sets.push('prs_created = prs_created + @prsCreated');
      params.prsCreated = updates.prsCreated;
    }

    if (sets.length > 0) {
      this.db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = @id`).run(params);
    }
  }

  /**
   * Complete a run with final status.
   * @param id - Run ID
   * @param status - Final status
   * @param errors - Any errors that occurred
   */
  complete(
    id: string,
    status: 'completed' | 'failed',
    errors: RunError[] = [],
  ): void {
    this.db
      .prepare(
        'UPDATE runs SET finished_at = ?, status = ?, errors = ? WHERE id = ?',
      )
      .run(Date.now(), status, JSON.stringify(errors), id);
  }

  /**
   * Get a run by ID.
   * @param id - Run ID
   * @returns Run report or null
   */
  getById(id: string): RunReport | null {
    const row = this.db
      .prepare('SELECT * FROM runs WHERE id = ?')
      .get(id) as RunRow | undefined;

    return row ? rowToRunReport(row) : null;
  }

  /**
   * Get recent runs.
   * @param limit - Maximum number of results
   * @returns Recent run reports
   */
  getRecent(limit = 10): RunReport[] {
    const rows = this.db
      .prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?')
      .all(limit) as RunRow[];

    return rows.map(rowToRunReport);
  }
}

interface RunRow {
  id: string;
  started_at: number;
  finished_at: number | null;
  events_pulled: number;
  issues_detected: number;
  prs_created: number;
  status: string;
  errors: string;
}

function rowToRunReport(row: RunRow): RunReport {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    eventsPulled: row.events_pulled,
    issuesDetected: row.issues_detected,
    prsCreated: row.prs_created,
    status: row.status as RunReport['status'],
    errors: JSON.parse(row.errors),
  };
}
