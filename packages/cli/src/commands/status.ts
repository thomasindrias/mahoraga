import { createDatabase, RunStore } from '@mahoraga/core';
import type { MahoragaConfig } from '@mahoraga/core';

/**
 * Show recent run history and outcomes.
 * @param config - Mahoraga configuration
 * @param options - Display options
 */
export async function runStatus(
  config: MahoragaConfig,
  options: { limit?: number } = {},
): Promise<void> {
  const dbManager = createDatabase(config.storage.dbPath);

  try {
    const store = new RunStore(dbManager.db);
    const runs = store.getRecent(options.limit ?? 10);

    if (runs.length === 0) {
      console.log('\nNo runs recorded yet. Run: npx mahoraga analyze\n');
      return;
    }

    console.log(`\nRecent Runs (${runs.length}):\n`);

    for (const run of runs) {
      const startDate = new Date(run.startedAt).toISOString();
      const duration = run.finishedAt
        ? `${((run.finishedAt - run.startedAt) / 1000).toFixed(1)}s`
        : 'running';

      const statusIcon =
        run.status === 'completed' ? '✅' : run.status === 'running' ? '🔄' : '❌';

      console.log(`  ${statusIcon} ${startDate} (${duration})`);
      console.log(
        `     Events: ${run.eventsPulled} | Issues: ${run.issuesDetected} | PRs: ${run.prsCreated}`,
      );

      if (run.errors.length > 0) {
        console.log(`     Errors: ${run.errors.length}`);
        for (const error of run.errors.slice(0, 3)) {
          console.log(`       - [${error.phase}] ${error.message}`);
        }
      }
      console.log('');
    }
  } finally {
    dbManager.close();
  }
}
