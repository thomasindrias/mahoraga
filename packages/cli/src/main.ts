import { runInit } from './commands/init.js';
import { runAnalyze } from './commands/analyze.js';
import { runMap } from './commands/map.js';
import { runInspect } from './commands/inspect.js';
import { runStatus } from './commands/status.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Parse a .env file content into key-value pairs.
 * Skips empty lines and lines starting with #.
 * @param content - Raw file content
 * @returns Parsed key-value pairs
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

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
    const envVars = parseEnvFile(envContent);
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value;
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
      const { createDatabase, EventStore } = await import('mahoraga-core');
      const db = createDatabase(config.storage.dbPath);
      const store = new EventStore(db.db);
      const cutoff = Date.now() - config.storage.retentionDays * 24 * 60 * 60 * 1000;
      const deleted = store.deleteOlderThan(cutoff);
      console.log(`Deleted ${deleted} expired events.`);
      db.close();
      break;
    }

    case 'dismiss': {
      const config = await loadConfig(cwd);
      if (!config) return;
      const { runDismiss } = await import('./commands/dismiss.js');
      const dismissArgs = args.slice(1);
      const isList = dismissArgs.includes('--list');
      const undoIndex = dismissArgs.indexOf('--undo');
      const reasonIndex = dismissArgs.indexOf('--reason');
      const undo = undoIndex !== -1 ? dismissArgs[undoIndex + 1] ?? undefined : undefined;
      if (undoIndex !== -1 && !undo) {
        console.error('Usage: mahoraga dismiss --undo <fingerprint>');
        process.exit(1);
      }
      const reason = reasonIndex !== -1 ? dismissArgs[reasonIndex + 1] : undefined;
      const fingerprint = dismissArgs.find((a) => !a.startsWith('--') && a !== undo && a !== reason);
      await runDismiss(config, fingerprint, { list: isList, undo, reason });
      break;
    }

    case 'create-rule': {
      const { interactiveCreateRule } = await import('./commands/create-rule.js');
      await interactiveCreateRule(cwd);
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
  dismiss <fp>        Suppress an issue fingerprint
  dismiss --list      Show all active suppressions
  dismiss --undo <fp> Remove a suppression
  create-rule         Scaffold a custom detection rule
`);
  }
}

async function loadConfig(cwd: string) {
  const extensions = ['ts', 'mjs', 'js'];
  let configPath: string | null = null;

  for (const ext of extensions) {
    const candidate = resolve(cwd, `mahoraga.config.${ext}`);
    if (existsSync(candidate)) {
      configPath = candidate;
      break;
    }
  }

  if (!configPath) {
    console.error(
      'No mahoraga.config.{ts,mjs,js} found. Run: npx mahoraga init',
    );
    process.exit(1);
  }

  try {
    const mod = await import(configPath);
    return mod.default;
  } catch (error) {
    const isTs = configPath.endsWith('.ts');
    if (isTs) {
      console.error(
        `Failed to load TypeScript config. Ensure tsx is installed:\n  npm install -D tsx\n\nOr use mahoraga.config.mjs instead.\n\nError: ${error instanceof Error ? error.message : String(error)}`,
      );
    } else {
      console.error(
        `Failed to load config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
