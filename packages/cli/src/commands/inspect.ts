import { createDatabase, EventStore, IssueStore } from '@mahoraga/core';
import type { MahoragaConfig } from '@mahoraga/core';

/**
 * Inspect command — query local SQLite data.
 * @param config - Mahoraga configuration
 * @param subcommand - What to inspect: 'events' or 'issues'
 * @param options - Query options
 */
export async function runInspect(
  config: MahoragaConfig,
  subcommand: 'events' | 'issues',
  options: { limit?: number } = {},
): Promise<void> {
  const dbManager = createDatabase(config.storage.dbPath);

  try {
    if (subcommand === 'events') {
      const store = new EventStore(dbManager.db);
      const total = store.count({});
      const events = store.query({ limit: options.limit ?? 20 });

      console.log(`\nTotal events: ${total}\n`);
      console.log('Recent events:');
      for (const event of events) {
        const date = new Date(event.timestamp).toISOString();
        console.log(
          `  [${event.type}] ${date} — ${event.url} (session: ${event.sessionId.substring(0, 8)}...)`,
        );
      }
    } else if (subcommand === 'issues') {
      const store = new IssueStore(dbManager.db);
      const issues = store.getAll(options.limit ?? 20);

      console.log(`\nTotal issue groups: ${issues.length}\n`);
      for (const issue of issues) {
        const statusIcon =
          issue.status === 'pr_created'
            ? '✅'
            : issue.status === 'detected'
              ? '🔍'
              : issue.status === 'dispatched'
                ? '🚀'
                : '⏸️';
        console.log(
          `  ${statusIcon} [${issue.severity.toUpperCase()}] ${issue.title} (${issue.frequency} sessions) — ${issue.status}`,
        );
        if (issue.prUrl) {
          console.log(`     PR: ${issue.prUrl}`);
        }
      }
    }
  } finally {
    dbManager.close();
  }
}
