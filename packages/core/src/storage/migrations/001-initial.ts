import type Database from 'better-sqlite3';

/**
 * Run the initial migration to create all tables and indexes.
 * Safe to call multiple times — uses IF NOT EXISTS.
 * @param db - Database instance
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = db
    .prepare('SELECT name FROM _migrations')
    .all() as { name: string }[];
  const appliedSet = new Set(applied.map((r) => r.name));

  if (!appliedSet.has('001-initial')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE events (
          id TEXT PRIMARY KEY,
          schema_version INTEGER NOT NULL DEFAULT 1,
          source TEXT NOT NULL,
          event_type TEXT NOT NULL,
          session_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          url TEXT NOT NULL,
          payload JSON NOT NULL,
          metadata JSON NOT NULL,
          ingested_at INTEGER NOT NULL
        );

        CREATE TABLE checkpoints (
          source TEXT PRIMARY KEY,
          cursor TEXT NOT NULL,
          last_pulled_at INTEGER NOT NULL
        );

        CREATE TABLE issue_groups (
          id TEXT PRIMARY KEY,
          rule_id TEXT NOT NULL,
          fingerprint TEXT UNIQUE NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          evidence JSON NOT NULL,
          affected_elements JSON NOT NULL,
          frequency INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'detected',
          pr_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE runs (
          id TEXT PRIMARY KEY,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          events_pulled INTEGER DEFAULT 0,
          issues_detected INTEGER DEFAULT 0,
          prs_created INTEGER DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'running',
          errors JSON DEFAULT '[]'
        );

        CREATE INDEX idx_events_session ON events(session_id, timestamp);
        CREATE INDEX idx_events_type_time ON events(event_type, timestamp);
        CREATE INDEX idx_events_source_time ON events(source, timestamp);
        CREATE INDEX idx_issue_groups_status ON issue_groups(status);
      `);

      db.prepare(
        'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
      ).run('001-initial', Date.now());
    })();
  }

  if (!appliedSet.has('002-suppressions')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE suppressions (
          fingerprint TEXT PRIMARY KEY,
          rule_id TEXT NOT NULL,
          reason TEXT,
          suppressed_at INTEGER NOT NULL
        );

        CREATE INDEX idx_suppressions_rule ON suppressions(rule_id);
      `);

      db.prepare(
        'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
      ).run('002-suppressions', Date.now());
    })();
  }
}
