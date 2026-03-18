import { describe, it, expect } from 'vitest';
import {
  MockAgentExecutor,
  type AgentExecutionResult,
} from '../executor.js';
import { buildPrompt } from '../prompt-builder.js';
import { AgentDispatcher } from '../dispatcher.js';
import { generateTest } from '../test-generator.js';
import { runAdaptationLoop } from '../adaptation-loop.js';
import { buildPRTitle, buildPRBody } from '../pr-creator.js';
import {
  checkGovernance,
  checkDiffPaths,
  checkDiffSize,
} from '../governance.js';
import type { IssueGroup, AgentConfig, SourceLocation } from 'mahoraga-core';

const mockIssue: IssueGroup = {
  id: 'issue-1',
  ruleId: 'rage-clicks',
  fingerprint: 'fp-1',
  severity: 'high',
  title: 'Rage clicks on #add-to-cart',
  description: '15 sessions experienced rage clicks on the add-to-cart button',
  evidence: [
    {
      type: 'event_cluster',
      description: '5 clicks within 800ms on #add-to-cart',
      eventSummaries: [
        {
          eventId: 'e1',
          type: 'click',
          timestamp: 1000,
          url: 'https://shop.example.com/product',
          summary: 'click on #add-to-cart',
        },
      ],
    },
  ],
  affectedElements: [
    {
      selector: '#add-to-cart',
      url: 'https://shop.example.com/product',
      componentName: 'AddToCartButton',
    },
  ],
  frequency: 15,
  status: 'detected',
  prUrl: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const defaultConfig: AgentConfig = {
  provider: 'claude-code',
  workflow: 'plan-then-implement',
  createPR: true,
  baseBranch: 'main',
  draftPR: true,
  maxCostPerIssue: 2,
  maxCostPerRun: 20,
  maxDispatchesPerRun: 5,
  timeoutMs: 300_000,
  maxRetries: 3,
  postChecks: { build: true, test: true, maxDiffLines: 500 },
  allowedPaths: [],
  deniedPaths: [],
  confidenceThreshold: 0.7,
};

describe('MockAgentExecutor', () => {
  it('should return configured results in order', async () => {
    const results: AgentExecutionResult[] = [
      { success: true, costUsd: 0.5 },
      { success: false, error: 'timeout' },
    ];
    const executor = new MockAgentExecutor(results);

    const r1 = await executor.execute('prompt', '/work');
    expect(r1.success).toBe(true);

    const r2 = await executor.execute('prompt', '/work');
    expect(r2.success).toBe(false);
  });

  it('should track call count', async () => {
    const executor = new MockAgentExecutor([{ success: true }]);
    await executor.execute('p', '/w');
    await executor.execute('p', '/w');
    expect(executor.getCallCount()).toBe(2);
  });
});

describe('buildPrompt', () => {
  it('should include issue details in the prompt', () => {
    const locations = new Map<string, SourceLocation[]>();
    locations.set('#add-to-cart', [
      { filePath: 'src/Cart.tsx', line: 42, column: 5, componentName: 'AddToCartButton' },
    ]);

    const prompt = buildPrompt({
      issues: [mockIssue],
      codeLocations: locations,
      baseBranch: 'main',
    });

    expect(prompt).toContain('Rage clicks on #add-to-cart');
    expect(prompt).toContain('15 sessions affected');
    expect(prompt).toContain('src/Cart.tsx:42');
    expect(prompt).toContain('AddToCartButton');
    expect(prompt).toContain('event_cluster');
    expect(prompt).toContain('main');
  });

  it('should handle issues without code locations', () => {
    const prompt = buildPrompt({
      issues: [mockIssue],
      codeLocations: new Map(),
      baseBranch: 'main',
    });

    expect(prompt).toContain('Rage clicks on #add-to-cart');
    expect(prompt).toContain('#add-to-cart');
  });

  it('should include conventions when provided', () => {
    const prompt = buildPrompt({
      issues: [mockIssue],
      codeLocations: new Map(),
      baseBranch: 'main',
      conventions: 'Always use TypeScript strict mode',
    });

    expect(prompt).toContain('Always use TypeScript strict mode');
  });
});

describe('generateTest', () => {
  it('should generate a rage-click test', () => {
    const test = generateTest(mockIssue, '/tmp/work');
    expect(test.testPath).toContain('rage-clicks');
    expect(test.content).toContain('rage-click fix');
    expect(test.content).toContain('#add-to-cart');
    expect(test.runCommand).toContain('vitest');
  });

  it('should generate an error-spike test', () => {
    const errorIssue: IssueGroup = {
      ...mockIssue,
      ruleId: 'error-spikes',
      title: 'Error spike: Cannot read property',
    };
    const test = generateTest(errorIssue, '/tmp/work');
    expect(test.content).toContain('error-spike fix');
  });

  it('generates a generic test for unknown ruleId', () => {
    const customIssue = { ...mockIssue, ruleId: 'custom-user-rule' };
    const test = generateTest(customIssue, '/tmp');
    expect(test.content).toContain('expect');
    expect(test.testPath).toContain('custom-user-rule');
  });

  it('handles issue with empty affectedElements', () => {
    const emptyIssue = { ...mockIssue, affectedElements: [] };
    const test = generateTest(emptyIssue, '/tmp');
    expect(test.content).toBeDefined();
  });

  it('escapes special characters in issue title', () => {
    const specialIssue = { ...mockIssue, title: "Can't click \"button\" with `backtick`" };
    const test = generateTest(specialIssue, '/tmp');
    // The escapeString function escapes single quotes with backslash
    // When embedded in a template literal, it becomes: 'Can\'t'
    expect(test.content).toContain("Can\\'t");
  });
});

describe('runAdaptationLoop', () => {
  it('should succeed on first attempt when test passes', async () => {
    const executor = new MockAgentExecutor([{ success: true, costUsd: 0.5 }]);

    const result = await runAdaptationLoop(
      executor,
      'Fix the bug',
      mockIssue,
      '/tmp/work',
      {
        maxRetries: 3,
        testRunner: async () => null, // test passes
      },
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(executor.getCallCount()).toBe(1);
  });

  it('should retry when test fails then passes', async () => {
    const executor = new MockAgentExecutor([
      { success: true, costUsd: 0.3 },
      { success: true, costUsd: 0.4 },
    ]);

    let testAttempt = 0;
    const result = await runAdaptationLoop(
      executor,
      'Fix the bug',
      mockIssue,
      '/tmp/work',
      {
        maxRetries: 3,
        testRunner: async () => {
          testAttempt++;
          return testAttempt === 1 ? 'assertion failed' : null;
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.attemptErrors).toHaveLength(1);
  });

  it('should fail after exhausting retries', async () => {
    const executor = new MockAgentExecutor([{ success: true }]);

    const result = await runAdaptationLoop(
      executor,
      'Fix the bug',
      mockIssue,
      '/tmp/work',
      {
        maxRetries: 2,
        testRunner: async () => 'always fails',
      },
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3); // initial + 2 retries
  });

  it('should handle agent execution failure', async () => {
    const executor = new MockAgentExecutor([
      { success: false, error: 'timeout' },
      { success: true },
    ]);

    const result = await runAdaptationLoop(
      executor,
      'Fix the bug',
      mockIssue,
      '/tmp/work',
      {
        maxRetries: 1,
        testRunner: async () => null,
      },
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.attemptErrors).toHaveLength(1);
  });

  it('fails immediately when maxRetries is 0 and test fails', async () => {
    const executor = new MockAgentExecutor([{ success: true, costUsd: 0.1 }]);
    const result = await runAdaptationLoop(executor, 'prompt', mockIssue, '/tmp', {
      maxRetries: 0,
      testRunner: async () => 'test failed',
    });
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('records all attempt errors when agent always fails', async () => {
    const executor = new MockAgentExecutor([
      { success: false, error: 'agent crash' },
      { success: false, error: 'agent crash' },
      { success: false, error: 'agent crash' },
    ]);
    const result = await runAdaptationLoop(executor, 'prompt', mockIssue, '/tmp', {
      maxRetries: 2,
    });
    expect(result.success).toBe(false);
    expect(result.attemptErrors).toHaveLength(3);
    expect(result.attemptErrors[0]).toContain('Agent failed');
  });

  it('handles testRunner that throws an exception', async () => {
    const executor = new MockAgentExecutor([{ success: true, costUsd: 0.1 }]);
    const result = await runAdaptationLoop(executor, 'prompt', mockIssue, '/tmp', {
      maxRetries: 0,
      testRunner: async () => { throw new Error('runner exploded'); },
    });
    expect(result.success).toBe(false);
    expect(result.attemptErrors[0]).toContain('runner exploded');
  });
});

describe('PR creation helpers', () => {
  it('should build single-issue PR title', () => {
    const title = buildPRTitle([mockIssue]);
    expect(title).toBe('fix: Rage clicks on #add-to-cart');
  });

  it('should build multi-issue PR title', () => {
    const title = buildPRTitle([mockIssue, { ...mockIssue, id: 'issue-2' }]);
    expect(title).toContain('2 UI issues');
  });

  it('should build rich PR body with analytics context', () => {
    const body = buildPRBody([mockIssue], {
      success: true,
      attempts: 2,
      generatedTest: {
        testPath: '/test.ts',
        content: '',
        runCommand: 'vitest',
      },
      executionResult: { success: true, costUsd: 0.75 },
      attemptErrors: ['Attempt 1: Test failed — assertion error'],
    });

    expect(body).toContain('Rage clicks on #add-to-cart');
    expect(body).toContain('15 sessions affected');
    expect(body).toContain('rage-clicks');
    expect(body).toContain('Adaptation attempts:** 2');
    expect(body).toContain('$0.75');
    expect(body).toContain('Attempt History');
    expect(body).toContain('Mahoraga');
  });
});

describe('Governance', () => {
  it('should allow dispatch within budget', () => {
    const result = checkGovernance(mockIssue, defaultConfig, 5);
    expect(result.allowed).toBe(true);
  });

  it('should deny dispatch when budget exceeded', () => {
    const result = checkGovernance(mockIssue, defaultConfig, 25);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('budget exceeded');
  });

  it('should recommend create_pr for high severity', () => {
    const result = checkGovernance(mockIssue, defaultConfig);
    expect(result.action).toBe('create_pr');
  });

  it('should recommend create_issue for low severity below threshold', () => {
    const lowIssue: IssueGroup = { ...mockIssue, severity: 'low' };
    const result = checkGovernance(lowIssue, defaultConfig);
    expect(result.action).toBe('create_issue');
  });

  it('should check diff paths against denied list', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      deniedPaths: ['src/auth/**'],
    };

    const allowed = checkDiffPaths(['src/cart/Cart.tsx'], config);
    expect(allowed.allowed).toBe(true);

    const denied = checkDiffPaths(['src/auth/login.tsx'], config);
    expect(denied.allowed).toBe(false);
  });

  it('should check diff paths against allowed list', () => {
    const config: AgentConfig = {
      ...defaultConfig,
      allowedPaths: ['src/components/**'],
    };

    const allowed = checkDiffPaths(['src/components/Cart.tsx'], config);
    expect(allowed.allowed).toBe(true);

    const denied = checkDiffPaths(['src/utils/helpers.ts'], config);
    expect(denied.allowed).toBe(false);
  });

  it('should deny pre-dispatch when affected component matches denied path', () => {
    const issueWithComponent: IssueGroup = {
      ...mockIssue,
      affectedElements: [
        { selector: '#login-btn', url: 'https://example.com', componentName: 'src/auth/LoginButton.tsx' },
      ],
    };
    const config: AgentConfig = {
      ...defaultConfig,
      deniedPaths: ['src/auth/**'],
    };

    const result = checkGovernance(issueWithComponent, config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('denied path');
  });

  it('should check diff size', () => {
    const small = checkDiffSize(100, 500);
    expect(small.allowed).toBe(true);

    const big = checkDiffSize(600, 500);
    expect(big.allowed).toBe(false);
  });

  it('denies when runCostSoFar exactly equals maxCostPerRun', () => {
    const result = checkGovernance(mockIssue, defaultConfig, defaultConfig.maxCostPerRun);
    expect(result.allowed).toBe(false);
  });

  it('allows when runCostSoFar is one cent below maxCostPerRun', () => {
    const result = checkGovernance(mockIssue, defaultConfig, defaultConfig.maxCostPerRun - 0.01);
    expect(result.allowed).toBe(true);
  });

  it('allows checkDiffSize when diffLineCount exactly equals maxDiffLines', () => {
    const result = checkDiffSize(500, 500);
    expect(result.allowed).toBe(true);
  });

  it('allows checkDiffSize with 0 lines', () => {
    const result = checkDiffSize(0, 500);
    expect(result.allowed).toBe(true);
  });

  it('allows checkDiffPaths with empty diffFiles array', () => {
    const result = checkDiffPaths([], defaultConfig);
    expect(result.allowed).toBe(true);
  });

  it('denies when file matches both allowed and denied paths', () => {
    const dualConfig = { ...defaultConfig, allowedPaths: ['src/**'], deniedPaths: ['src/secret/**'] };
    const result = checkDiffPaths(['src/secret/keys.ts'], dualConfig);
    expect(result.allowed).toBe(false);
  });

  it('defaults to 0.5 confidence for unknown severity', () => {
    const weirdIssue = { ...mockIssue, severity: 'unknown' as any };
    const highThresholdConfig = { ...defaultConfig, confidenceThreshold: 0.6 };
    const result = checkGovernance(weirdIssue, highThresholdConfig);
    expect(result.action).toBe('create_issue');
  });
});

describe('AgentDispatcher', () => {
  it('returns error status when dispatched with empty issues array', async () => {
    const executor = new MockAgentExecutor([]);
    const dispatcher = new AgentDispatcher(executor, null, defaultConfig);
    const result = await dispatcher.dispatch([], '/tmp');
    expect(result.status).toBe('error');
    expect(result.summary).toBe('No issues provided');
    expect(result.issueIds).toEqual([]);
  });
});
