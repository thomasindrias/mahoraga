import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runMigrations } from './migrations/001-initial.js';

/**
 * SQLite connection manager with WAL mode and automatic migrations.
 * Use `createDatabase()` to get a configured database instance.
 */
export class DatabaseManager {
  readonly db: Database.Database;

  /**
   * Create a new database manager.
   * @param dbPath - Path to the SQLite database file. Use ':memory:' for in-memory databases.
   */
  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    runMigrations(this.db);
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
 * @param dbPath - Path to the SQLite database file. Use ':memory:' for in-memory databases.
 * @returns Configured DatabaseManager instance
 */
export function createDatabase(dbPath: string): DatabaseManager {
  return new DatabaseManager(dbPath);
}
