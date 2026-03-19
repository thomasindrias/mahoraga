import { z } from 'zod';

/** Source adapter configuration schema */
export const SourceConfigSchema = z.object({
  adapter: z.string(),
  module: z.string().optional(),
  apiKey: z.string().optional(),
  secretKey: z.string().optional(),
  projectId: z.string().optional(),
  host: z.string().optional(),
}).passthrough();

/** Per-rule threshold overrides */
export const RuleThresholdsSchema = z.object({
  'rage-clicks': z.object({
    clickCount: z.number().int().positive().default(3),
    windowMs: z.number().int().positive().default(1000),
  }).prefault({}),
  'error-spikes': z.object({
    spikeMultiplier: z.number().positive().default(2),
    minAbsoluteCount: z.number().int().positive().default(5),
  }).prefault({}),
  'dead-clicks': z.object({
    minClickCount: z.number().int().positive().default(5),
    minSessions: z.number().int().positive().default(2),
    waitMs: z.number().int().positive().default(2000),
  }).prefault({}),
  'form-abandonment': z.object({
    minAbandonRate: z.number().min(0).max(1).default(0.4),
    minSessions: z.number().int().positive().default(3),
  }).prefault({}),
  'slow-navigation': z.object({
    thresholdMs: z.number().int().positive().default(3000),
    minOccurrences: z.number().int().positive().default(3),
    minSessions: z.number().int().positive().default(2),
  }).prefault({}),
  'layout-shifts': z.object({
    minPoorEvents: z.number().int().positive().default(3),
    minSessions: z.number().int().positive().default(2),
  }).prefault({}),
  'error-loops': z.object({
    minOccurrences: z.number().int().positive().default(3),
    minSessions: z.number().int().positive().default(2),
  }).prefault({}),
}).prefault({});

/** Inferred type for rule thresholds */
export type RuleThresholds = z.infer<typeof RuleThresholdsSchema>;

/** Analysis configuration schema */
export const AnalysisConfigSchema = z.object({
  windowDays: z.number().int().positive().default(3),
  rules: z.array(z.string()).default(['rage-clicks', 'error-spikes']),
  customRules: z.array(z.unknown()).default([]),
  thresholds: RuleThresholdsSchema,
  routePatterns: z.array(z.string()).default([]),
});

/** Post-agent validation checks */
export const PostChecksSchema = z.object({
  build: z.boolean().default(true),
  test: z.boolean().default(true),
  maxDiffLines: z.number().int().positive().default(500),
});

/** Agent configuration schema with governance controls */
export const AgentConfigSchema = z.object({
  provider: z.enum(['claude-code', 'gemini', 'openai']).default('claude-code'),
  claudeMdPath: z.string().optional(),
  agentMdPath: z.string().optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional(),
  workflow: z.literal('plan-then-implement').default('plan-then-implement'),
  createPR: z.boolean().default(true),
  baseBranch: z.string().default('main'),
  draftPR: z.boolean().default(true),
  maxCostPerIssue: z.number().positive().default(2),
  maxCostPerRun: z.number().positive().default(20),
  maxDispatchesPerRun: z.number().int().positive().default(5),
  timeoutMs: z.number().int().positive().default(300_000),
  maxRetries: z.number().int().nonnegative().default(3),
  postChecks: PostChecksSchema.prefault({}),
  /** Paths the agent is allowed to modify */
  allowedPaths: z.array(z.string()).default([]),
  /** Paths the agent must not modify */
  deniedPaths: z.array(z.string()).default([]),
  /** Minimum confidence to create PR (below this → create issue instead) */
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
});

/** Storage configuration schema */
export const StorageConfigSchema = z.object({
  dbPath: z.string().default('.mahoraga/mahoraga.db'),
  retentionDays: z.number().int().positive().default(30),
});

/** Logging configuration schema */
export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['pretty', 'json']).default('pretty'),
});

/**
 * Full Mahoraga configuration schema.
 * Used by `defineConfig()` to provide type-safe configuration.
 */
export const MahoragaConfigSchema = z.object({
  sources: z.array(SourceConfigSchema),
  analysis: AnalysisConfigSchema.prefault({}),
  agent: AgentConfigSchema.prefault({}),
  storage: StorageConfigSchema.prefault({}),
  logging: LoggingConfigSchema.prefault({}),
});

/**
 * Helper for type-safe configuration.
 * @param config - Raw configuration object
 * @returns Validated and defaulted configuration
 */
export function defineConfig(
  config: z.input<typeof MahoragaConfigSchema>,
): z.infer<typeof MahoragaConfigSchema> {
  return MahoragaConfigSchema.parse(config);
}
