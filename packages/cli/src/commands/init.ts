import * as p from '@clack/prompts';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Interactive setup command.
 * Creates config file, env template, and gitignore entries.
 * @param cwd - Working directory
 */
export async function runInit(cwd: string): Promise<void> {
  p.intro('Mahoraga — Self-Evolving Frontend Intelligence');

  const source = await p.select({
    message: 'Which analytics source do you use?',
    options: [
      { value: 'amplitude', label: 'Amplitude' },
      { value: 'posthog', label: 'PostHog (coming soon)', hint: 'V2' },
    ],
  });

  if (p.isCancel(source)) {
    p.cancel('Setup cancelled.');
    return;
  }

  const baseBranch = await p.text({
    message: 'What is your main branch?',
    initialValue: 'main',
  });

  if (p.isCancel(baseBranch)) {
    p.cancel('Setup cancelled.');
    return;
  }

  const generateCI = await p.confirm({
    message: 'Generate GitHub Actions workflow?',
    initialValue: true,
  });

  if (p.isCancel(generateCI)) {
    p.cancel('Setup cancelled.');
    return;
  }

  const s = p.spinner();

  // Create config file
  s.start('Creating configuration');
  const configContent = buildConfigFile(source as string, baseBranch as string);
  writeFileSync(join(cwd, 'mahoraga.config.ts'), configContent);
  s.stop('Configuration created');

  // Create .mahoraga.env template
  s.start('Creating environment template');
  const envContent = buildEnvTemplate(source as string);
  writeFileSync(join(cwd, '.mahoraga.env'), envContent);
  s.stop('Environment template created');

  // Create .mahoraga directory
  mkdirSync(join(cwd, '.mahoraga'), { recursive: true });

  // Update .gitignore
  s.start('Updating .gitignore');
  updateGitignore(cwd);
  s.stop('.gitignore updated');

  // Generate GitHub Actions workflow
  if (generateCI) {
    s.start('Generating GitHub Actions workflow');
    const workflowDir = join(cwd, '.github', 'workflows');
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(
      join(workflowDir, 'mahoraga.yml'),
      buildGitHubWorkflow(baseBranch as string),
    );
    s.stop('GitHub Actions workflow generated');
  }

  p.outro('Setup complete! Next steps:\n  1. Fill in .mahoraga.env with your API keys\n  2. Run: npx mahoraga analyze --dry-run');
}

function buildConfigFile(source: string, baseBranch: string): string {
  return `import { defineConfig } from '@mahoraga/core';

export default defineConfig({
  sources: [
    {
      adapter: '${source}',
      apiKey: process.env.MAHORAGA_${source.toUpperCase()}_API_KEY!,
      secretKey: process.env.MAHORAGA_${source.toUpperCase()}_SECRET_KEY!,
    },
  ],

  analysis: {
    windowDays: 3,
    rules: ['rage-clicks', 'error-spikes'],
  },

  agent: {
    provider: 'claude-code',
    claudeMdPath: './CLAUDE.md',
    workflow: 'plan-then-implement',
    createPR: true,
    draftPR: true,
    baseBranch: '${baseBranch}',
    maxCostPerIssue: 2,
    maxCostPerRun: 20,
    maxRetries: 3,
    confidenceThreshold: 0.7,
    postChecks: {
      build: true,
      test: true,
      maxDiffLines: 500,
    },
  },

  storage: {
    dbPath: '.mahoraga/mahoraga.db',
    retentionDays: 30,
  },

  logging: {
    level: 'info',
    format: 'pretty',
  },
});
`;
}

function buildEnvTemplate(source: string): string {
  const lines = [
    '# Mahoraga Environment Variables',
    '# Copy this to .mahoraga.env and fill in your keys',
    '',
  ];

  if (source === 'amplitude') {
    lines.push('MAHORAGA_AMPLITUDE_API_KEY=');
    lines.push('MAHORAGA_AMPLITUDE_SECRET_KEY=');
  }

  lines.push('');
  lines.push('# Required for agent dispatch');
  lines.push('ANTHROPIC_API_KEY=');
  lines.push('');

  return lines.join('\n');
}

function updateGitignore(cwd: string): void {
  const gitignorePath = join(cwd, '.gitignore');
  const entries = ['.mahoraga/', '.mahoraga.env'];
  let content = '';

  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf-8');
  }

  const toAdd = entries.filter((e) => !content.includes(e));
  if (toAdd.length > 0) {
    const addition = '\n# Mahoraga\n' + toAdd.join('\n') + '\n';
    writeFileSync(gitignorePath, content + addition);
  }
}

function buildGitHubWorkflow(baseBranch: string): string {
  return `name: Mahoraga Analysis
on:
  schedule:
    - cron: '0 0 */3 * *'  # Every 3 days
  workflow_dispatch: {}

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - uses: actions/cache@v4
        with:
          path: .mahoraga/
          key: mahoraga-state-\${{ github.ref }}
      - run: npx mahoraga analyze
        env:
          MAHORAGA_AMPLITUDE_API_KEY: \${{ secrets.AMPLITUDE_API_KEY }}
          MAHORAGA_AMPLITUDE_SECRET_KEY: \${{ secrets.AMPLITUDE_SECRET_KEY }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;
}
