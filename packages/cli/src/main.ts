import { runInit } from './commands/init.js';
import { runAnalyze } from './commands/analyze.js';
import { runMap } from './commands/map.js';
import { runInspect } from './commands/inspect.js';
import { runStatus } from './commands/status.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * CLI entry point. Parses arguments and dispatches to command handlers.
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const cwd = process.cwd();

  // Load .mahoraga.env if it exists
  const envPath = join(cwd, '.mahoraga.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          process.env[key] = valueParts.join('=');
        }
      }
    }
  }

  switch (command) {
    case 'init':
      await runInit(cwd);
      break;

    case 'analyze': {
      const config = await loadConfig(cwd);
      if (!config) return;
      await runAnalyze(config, cwd, {
        dryRun: args.includes('--dry-run'),
        verbose: args.includes('--verbose'),
      });
      break;
    }

    case 'map':
      await runMap(cwd);
      break;

    case 'inspect': {
      const config = await loadConfig(cwd);
      if (!config) return;
      const sub = args[1] as 'events' | 'issues';
      if (!sub || !['events', 'issues'].includes(sub)) {
        console.error('Usage: mahoraga inspect <events|issues>');
        process.exit(1);
      }
      await runInspect(config, sub);
      break;
    }

    case 'status': {
      const config = await loadConfig(cwd);
      if (!config) return;
      await runStatus(config);
      break;
    }

    case 'gc': {
      const config = await loadConfig(cwd);
      if (!config) return;
      const { createDatabase, EventStore } = await import('@mahoraga/core');
      const db = createDatabase(config.storage.dbPath);
      const store = new EventStore(db.db);
      const cutoff = Date.now() - config.storage.retentionDays * 24 * 60 * 60 * 1000;
      const deleted = store.deleteOlderThan(cutoff);
      console.log(`Deleted ${deleted} expired events.`);
      db.close();
      break;
    }

    default:
      console.log(`Mahoraga — Self-Evolving Frontend Intelligence

Commands:
  init                Interactive setup
  analyze             Full pipeline: pull → analyze → dispatch
  analyze --dry-run   Pull + analyze only, no agent dispatch
  map                 Rebuild code-to-event index
  inspect events      Query local event database
  inspect issues      Show detected issue groups
  status              Show run history
  gc                  Manual data retention cleanup
`);
  }
}

async function loadConfig(cwd: string) {
  const configPath = resolve(cwd, 'mahoraga.config.ts');
  if (!existsSync(configPath)) {
    console.error(
      'No mahoraga.config.ts found. Run: npx mahoraga init',
    );
    process.exit(1);
  }

  try {
    // Use dynamic import for the config file
    // In production this would need tsx or ts-node
    const mod = await import(configPath);
    return mod.default;
  } catch (error) {
    console.error(
      `Failed to load config: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
