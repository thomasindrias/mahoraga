import type Database from 'better-sqlite3';
import type { Issue, IssueGroup, IssueStatus } from '../types/index.js';

/**
 * Issue group storage — CRUD operations for detected issues.
 */
export class IssueStore {
  /**
   * Create an IssueStore.
   * @param db - Database instance
   */
  constructor(private readonly db: Database.Database) {}

  /**
   * Upsert an issue group. If the fingerprint exists, updates frequency and evidence.
   * @param issue - Issue to upsert
   */
  upsert(issue: Issue): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO issue_groups (id, rule_id, fingerprint, severity, title, description, evidence, affected_elements, frequency, status, pr_url, created_at, updated_at)
         VALUES (@id, @ruleId, @fingerprint, @severity, @title, @description, @evidence, @affectedElements, @frequency, 'detected', NULL, @now, @now)
         ON CONFLICT(fingerprint) DO UPDATE SET
           severity = excluded.severity,
           title = excluded.title,
           description = excluded.description,
           evidence = excluded.evidence,
           affected_elements = excluded.affected_elements,
           frequency = excluded.frequency,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: issue.id,
        ruleId: issue.ruleId,
        fingerprint: issue.fingerprint,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        evidence: JSON.stringify(issue.evidence),
        affectedElements: JSON.stringify(issue.affectedElements),
        frequency: issue.frequency,
        now,
      });
  }

  /**
   * Get an issue group by ID.
   * @param id - Issue group ID
   * @returns Issue group or null
   */
  getById(id: string): IssueGroup | null {
    const row = this.db
      .prepare('SELECT * FROM issue_groups WHERE id = ?')
      .get(id) as IssueGroupRow | undefined;

    return row ? rowToIssueGroup(row) : null;
  }

  /**
   * Get issue groups by status.
   * @param status - Status to filter by
   * @returns Matching issue groups
   */
  getByStatus(status: IssueStatus): IssueGroup[] {
    const rows = this.db
      .prepare('SELECT * FROM issue_groups WHERE status = ? ORDER BY updated_at DESC')
      .all(status) as IssueGroupRow[];

    return rows.map(rowToIssueGroup);
  }

  /**
   * Update the status and optionally the PR URL of an issue group.
   * @param id - Issue group ID
   * @param status - New status
   * @param prUrl - Optional PR URL
   */
  updateStatus(id: string, status: IssueStatus, prUrl?: string): void {
    this.db
      .prepare(
        'UPDATE issue_groups SET status = ?, pr_url = ?, updated_at = ? WHERE id = ?',
      )
      .run(status, prUrl ?? null, Date.now(), id);
  }

  /**
   * Get all issue groups ordered by most recent update.
   * @param limit - Maximum number of results
   * @returns Issue groups
   */
  getAll(limit = 100): IssueGroup[] {
    const rows = this.db
      .prepare('SELECT * FROM issue_groups ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as IssueGroupRow[];

    return rows.map(rowToIssueGroup);
  }
}

interface IssueGroupRow {
  id: string;
  rule_id: string;
  fingerprint: string;
  severity: string;
  title: string;
  description: string;
  evidence: string;
  affected_elements: string;
  frequency: number;
  status: string;
  pr_url: string | null;
  created_at: number;
  updated_at: number;
}

function rowToIssueGroup(row: IssueGroupRow): IssueGroup {
  return {
    id: row.id,
    ruleId: row.rule_id,
    fingerprint: row.fingerprint,
    severity: row.severity as IssueGroup['severity'],
    title: row.title,
    description: row.description,
    evidence: JSON.parse(row.evidence),
    affectedElements: JSON.parse(row.affected_elements),
    frequency: row.frequency,
    status: row.status as IssueGroup['status'],
    prUrl: row.pr_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    suggestedAction: undefined,
  };
}
