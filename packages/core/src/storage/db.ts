import type Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runMigrations } from './migrations/001-initial.js';

/**
 * SQLite connection manager with WAL mode and automatic migrations.
 * Use `createDatabase()` to get a configured database instance.
 *
 * Requires `better-sqlite3` as a peer dependency — only consumers that
 * use storage need to install it.
 */
export class DatabaseManager {
  readonly db: Database.Database;

  /** @internal Use `createDatabase()` instead. */
  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Create a configured database instance with migrations applied.
 * Dynamically imports `better-sqlite3` so consumers that only use
 * schemas/types don't need the native module installed.
 *
 * @param dbPath - Path to the SQLite database file. Use ':memory:' for in-memory databases.
 * @returns Configured DatabaseManager instance
 */
export async function createDatabase(dbPath: string): Promise<DatabaseManager> {
  const { default: Database } = await import('better-sqlite3');

  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  return new DatabaseManager(db);
}
