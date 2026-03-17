import type { IssueGroup, SourceLocation } from 'mahoraga-core';

/**
 * Context for building agent prompts.
 */
export interface PromptContext {
  /** Issue groups to fix */
  issues: IssueGroup[];
  /** Resolved source locations per selector */
  codeLocations: Map<string, SourceLocation[]>;
  /** Base branch for the PR */
  baseBranch: string;
  /** Additional project conventions */
  conventions?: string;
}

/**
 * Build a structured prompt for the AI agent from issue data and code locations.
 * @param context - Prompt context with issues and code locations
 * @returns Structured prompt string
 */
export function buildPrompt(context: PromptContext): string {
  const { issues, codeLocations, baseBranch, conventions } = context;

  const sections: string[] = [];

  // Header
  sections.push('# Mahoraga Auto-Fix Task\n');
  sections.push(
    'You are fixing UI issues detected by automated analytics analysis.',
  );
  sections.push(
    'Create a focused fix, then verify it works. Do not make unrelated changes.\n',
  );

  // Issues section
  sections.push('## Detected Issues\n');
  for (const issue of issues) {
    sections.push(`### ${issue.title}`);
    sections.push(`- **Severity:** ${issue.severity}`);
    sections.push(`- **Rule:** ${issue.ruleId}`);
    sections.push(`- **Frequency:** ${issue.frequency} sessions affected`);
    sections.push(`- **Description:** ${issue.description}`);

    if (issue.suggestedAction) {
      sections.push(`- **Suggested action:** ${issue.suggestedAction}`);
    }

    // Affected elements with resolved code locations
    if (issue.affectedElements.length > 0) {
      sections.push('\n**Affected Elements:**');
      for (const element of issue.affectedElements) {
        const locations = codeLocations.get(element.selector);
        sections.push(`- Selector: \`${element.selector}\` on ${element.url}`);
        if (element.componentName) {
          sections.push(`  - Component: ${element.componentName}`);
        }
        if (locations && locations.length > 0) {
          for (const loc of locations) {
            sections.push(
              `  - Source: \`${loc.filePath}:${loc.line}\`${loc.componentName ? ` (${loc.componentName})` : ''}`,
            );
          }
        }
      }
    }

    // Evidence
    if (issue.evidence.length > 0) {
      sections.push('\n**Evidence:**');
      for (const ev of issue.evidence) {
        sections.push(`- [${ev.type}] ${ev.description}`);
      }
    }

    sections.push('');
  }

  // Instructions
  sections.push('## Instructions\n');
  sections.push('1. Analyze the issue and affected source files');
  sections.push('2. Create a focused fix that addresses the root cause');
  sections.push('3. Ensure the fix does not break existing functionality');
  sections.push(`4. Base your work on the \`${baseBranch}\` branch`);
  sections.push('5. Keep the diff minimal — only change what is necessary\n');

  if (conventions) {
    sections.push('## Project Conventions\n');
    sections.push(conventions);
    sections.push('');
  }

  return sections.join('\n');
}
