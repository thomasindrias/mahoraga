import type Database from 'better-sqlite3';

/** A persisted suppression record */
export interface Suppression {
  fingerprint: string;
  ruleId: string;
  reason: string | null;
  suppressedAt: number;
}

/**
 * Manages issue suppression for false-positive filtering.
 * Suppressed fingerprints are excluded from dispatch after analysis.
 */
export class SuppressionStore {
  private db: Database.Database;

  /**
   * @param db - better-sqlite3 database instance
   */
  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Suppress an issue fingerprint. Idempotent (upserts).
   * @param fingerprint - Issue fingerprint to suppress
   * @param ruleId - Rule that produced the issue
   * @param reason - Optional reason for suppression
   */
  suppress(fingerprint: string, ruleId: string, reason?: string): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO suppressions (fingerprint, rule_id, reason, suppressed_at) VALUES (?, ?, ?, ?)',
      )
      .run(fingerprint, ruleId, reason ?? null, Date.now());
  }

  /**
   * Remove a suppression. No-op if fingerprint is not suppressed.
   * @param fingerprint - Issue fingerprint to unsuppress
   */
  unsuppress(fingerprint: string): void {
    this.db
      .prepare('DELETE FROM suppressions WHERE fingerprint = ?')
      .run(fingerprint);
  }

  /**
   * Check if a fingerprint is suppressed.
   * @param fingerprint - Issue fingerprint to check
   * @returns True if suppressed
   */
  isSuppressed(fingerprint: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM suppressions WHERE fingerprint = ?')
      .get(fingerprint);
    return row !== undefined;
  }

  /**
   * Filter an array of fingerprints, returning those that are suppressed.
   * @param fingerprints - Array of fingerprints to check
   * @returns Set of suppressed fingerprints
   */
  filterSuppressed(fingerprints: string[]): Set<string> {
    if (fingerprints.length === 0) return new Set();

    const placeholders = fingerprints.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT fingerprint FROM suppressions WHERE fingerprint IN (${placeholders})`)
      .all(...fingerprints) as { fingerprint: string }[];

    return new Set(rows.map((r) => r.fingerprint));
  }

  /**
   * Get all active suppressions, sorted by suppressed_at ascending.
   * @returns Array of all suppression records
   */
  getAll(): Suppression[] {
    const rows = this.db
      .prepare('SELECT fingerprint, rule_id, reason, suppressed_at FROM suppressions ORDER BY suppressed_at ASC')
      .all() as { fingerprint: string; rule_id: string; reason: string | null; suppressed_at: number }[];

    return rows.map((r) => ({
      fingerprint: r.fingerprint,
      ruleId: r.rule_id,
      reason: r.reason,
      suppressedAt: r.suppressed_at,
    }));
  }
}
