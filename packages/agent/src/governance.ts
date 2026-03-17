import type { AgentConfig, IssueGroup } from 'mahoraga-core';
import { minimatch } from 'minimatch';

/**
 * Result of a governance check.
 */
export interface GovernanceResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for denial if not allowed */
  reason?: string;
  /** Recommended action based on confidence */
  action: 'create_pr' | 'create_issue' | 'skip';
}

/**
 * Check whether an issue dispatch is allowed by governance rules.
 * @param issue - Issue to check
 * @param config - Agent configuration with governance settings
 * @param runCostSoFar - Total cost spent in this run so far
 * @returns Governance result
 */
export function checkGovernance(
  issue: IssueGroup,
  config: AgentConfig,
  runCostSoFar = 0,
): GovernanceResult {
  // Check cost budget
  if (runCostSoFar >= config.maxCostPerRun) {
    return {
      allowed: false,
      reason: `Run cost budget exceeded ($${runCostSoFar.toFixed(2)} >= $${config.maxCostPerRun})`,
      action: 'skip',
    };
  }

  // Check affected paths against allowed/denied lists
  const pathCheckResult = checkPaths(issue, config);
  if (!pathCheckResult.allowed) {
    return pathCheckResult;
  }

  // Determine action based on confidence/severity
  const action = determineAction(issue, config);

  return {
    allowed: true,
    action,
  };
}

/**
 * Validate that a diff doesn't modify denied paths.
 * @param diffFiles - List of file paths modified in the diff
 * @param config - Agent configuration
 * @returns Governance result
 */
export function checkDiffPaths(
  diffFiles: string[],
  config: AgentConfig,
): GovernanceResult {
  for (const file of diffFiles) {
    // Check denied paths
    for (const pattern of config.deniedPaths) {
      if (minimatch(file, pattern)) {
        return {
          allowed: false,
          reason: `File ${file} matches denied path pattern: ${pattern}`,
          action: 'skip',
        };
      }
    }

    // If allowedPaths is set, file must match at least one
    if (config.allowedPaths.length > 0) {
      const isAllowed = config.allowedPaths.some((pattern) =>
        minimatch(file, pattern),
      );
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `File ${file} does not match any allowed path pattern`,
          action: 'skip',
        };
      }
    }
  }

  return { allowed: true, action: 'create_pr' };
}

/**
 * Check diff size against the configured maximum.
 * @param diffLineCount - Number of lines in the diff
 * @param maxDiffLines - Maximum allowed diff lines
 * @returns Governance result
 */
export function checkDiffSize(
  diffLineCount: number,
  maxDiffLines: number,
): GovernanceResult {
  if (diffLineCount > maxDiffLines) {
    return {
      allowed: false,
      reason: `Diff size (${diffLineCount} lines) exceeds maximum (${maxDiffLines} lines)`,
      action: 'skip',
    };
  }

  return { allowed: true, action: 'create_pr' };
}

function checkPaths(
  issue: IssueGroup,
  config: AgentConfig,
): GovernanceResult {
  // No path restrictions configured — allow everything
  if (config.allowedPaths.length === 0 && config.deniedPaths.length === 0) {
    return { allowed: true, action: 'create_pr' };
  }

  // Pre-dispatch path check: if code mapper resolved source locations
  // for affected elements, verify they don't fall in denied paths.
  // This is a best-effort heuristic — full path checking happens
  // post-agent via checkDiffPaths on the actual diff.
  for (const element of issue.affectedElements) {
    if (element.componentName) {
      for (const pattern of config.deniedPaths) {
        if (minimatch(element.componentName, pattern)) {
          return {
            allowed: false,
            reason: `Affected component "${element.componentName}" matches denied path pattern: ${pattern}`,
            action: 'skip',
          };
        }
      }
    }
  }

  return { allowed: true, action: 'create_pr' };
}

function determineAction(
  issue: IssueGroup,
  config: AgentConfig,
): 'create_pr' | 'create_issue' {
  // Map severity to a confidence proxy
  const severityConfidence: Record<string, number> = {
    critical: 0.9,
    high: 0.75,
    medium: 0.5,
    low: 0.3,
  };

  const confidence = severityConfidence[issue.severity] ?? 0.5;

  if (confidence < config.confidenceThreshold) {
    return 'create_issue';
  }

  return 'create_pr';
}
