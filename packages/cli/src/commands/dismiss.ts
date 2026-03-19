import { createDatabase, SuppressionStore } from 'mahoraga-core';
import type { MahoragaConfig } from 'mahoraga-core';

/**
 * Options for the dismiss command.
 */
export interface DismissOptions {
  /** List all active suppressions */
  list?: boolean;
  /** Remove a suppression */
  undo?: string;
  /** Reason for suppression */
  reason?: string;
}

/**
 * Suppress, list, or undo suppression of issue fingerprints.
 * @param config - Mahoraga configuration
 * @param fingerprint - Fingerprint to suppress (optional if --list)
 * @param options - Command options
 */
export async function runDismiss(
  config: MahoragaConfig,
  fingerprint: string | undefined,
  options: DismissOptions = {},
): Promise<void> {
  const dbManager = await createDatabase(config.storage.dbPath);
  const store = new SuppressionStore(dbManager.db);

  try {
    if (options.list) {
      const suppressions = store.getAll();
      if (suppressions.length === 0) {
        console.log('No active suppressions.');
        return;
      }

      console.log(`\nActive suppressions (${suppressions.length}):\n`);
      console.log('  Fingerprint                            Rule                 Reason');
      console.log('  ' + '-'.repeat(78));
      for (const s of suppressions) {
        const fp = s.fingerprint.slice(0, 40).padEnd(40);
        const rule = s.ruleId.padEnd(20);
        const reason = s.reason ?? '-';
        console.log(`  ${fp} ${rule} ${reason}`);
      }
      return;
    }

    if (options.undo) {
      store.unsuppress(options.undo);
      console.log(`Removed suppression for ${options.undo}`);
      return;
    }

    if (!fingerprint) {
      console.error('Usage: mahoraga dismiss <fingerprint> [--reason "..."]');
      console.error('       mahoraga dismiss --list');
      console.error('       mahoraga dismiss --undo <fingerprint>');
      process.exit(1);
    }

    // Need ruleId — look it up from issue_groups table
    const row = dbManager.db
      .prepare('SELECT rule_id FROM issue_groups WHERE fingerprint = ?')
      .get(fingerprint) as { rule_id: string } | undefined;

    const ruleId = row?.rule_id ?? 'unknown';
    store.suppress(fingerprint, ruleId, options.reason);
    console.log(`Suppressed issue ${fingerprint} (rule: ${ruleId})`);
  } finally {
    dbManager.close();
  }
}
