import { z } from 'zod';
import {
  MahoragaEventSchema,
  EventPayloadSchema,
  EventTypeSchema,
  ClickPayloadSchema,
  ErrorPayloadSchema,
  NavigationPayloadSchema,
  PerformancePayloadSchema,
  FormPayloadSchema,
  CustomPayloadSchema,
} from '../schemas/event.js';
import {
  IssueSchema,
  IssueGroupSchema,
  EvidenceSchema,
  ElementRefSchema,
  EventSummarySchema,
  SeveritySchema,
  IssueStatusSchema,
} from '../schemas/issue.js';
import {
  MahoragaConfigSchema,
  SourceConfigSchema,
  AnalysisConfigSchema,
  AgentConfigSchema,
  StorageConfigSchema,
  LoggingConfigSchema,
  PostChecksSchema,
} from '../schemas/config.js';

/** Normalized event from any analytics source */
export type MahoragaEvent = z.infer<typeof MahoragaEventSchema>;

/** Supported event types */
export type EventType = z.infer<typeof EventTypeSchema>;

/** Discriminated union of all event payloads */
export type EventPayload = z.infer<typeof EventPayloadSchema>;

/** Click interaction data */
export type ClickPayload = z.infer<typeof ClickPayloadSchema>;

/** JavaScript error data */
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

/** Navigation data */
export type NavigationPayload = z.infer<typeof NavigationPayloadSchema>;

/** Performance metric data */
export type PerformancePayload = z.infer<typeof PerformancePayloadSchema>;

/** Form interaction data */
export type FormPayload = z.infer<typeof FormPayloadSchema>;

/** Custom event data */
export type CustomPayload = z.infer<typeof CustomPayloadSchema>;

/** A detected UI issue */
export type Issue = z.infer<typeof IssueSchema>;

/** Persisted issue group with lifecycle */
export type IssueGroup = z.infer<typeof IssueGroupSchema>;

/** Evidence supporting an issue */
export type Evidence = z.infer<typeof EvidenceSchema>;

/** Reference to a UI element */
export type ElementRef = z.infer<typeof ElementRefSchema>;

/** Summary of an event used as evidence */
export type EventSummary = z.infer<typeof EventSummarySchema>;

/** Issue severity level */
export type Severity = z.infer<typeof SeveritySchema>;

/** Issue status in lifecycle */
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

/** Full Mahoraga configuration */
export type MahoragaConfig = z.infer<typeof MahoragaConfigSchema>;

/** Source adapter configuration */
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

/** Analysis configuration */
export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;

/** Agent configuration */
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** Storage configuration */
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

/** Logging configuration */
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

/** Post-agent validation checks */
export type PostChecks = z.infer<typeof PostChecksSchema>;

/** Time range for queries */
export interface TimeRange {
  start: number;
  end: number;
}

/** Adapter-specific cursor for resume-from-failure */
export interface Cursor {
  value: string;
  updatedAt: number;
}

/** Run report for observability */
export interface RunReport {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  eventsPulled: number;
  issuesDetected: number;
  prsCreated: number;
  status: 'running' | 'completed' | 'failed';
  errors: RunError[];
}

/** Error captured during a run */
export interface RunError {
  phase: 'pull' | 'analyze' | 'dispatch';
  message: string;
  stack?: string;
  timestamp: number;
}

/** Source location resolved by the code mapper */
export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
  componentName?: string;
}

/** Result of an agent dispatch operation */
export interface DispatchResult {
  issueIds: string[];
  status:
    | 'pr_created'
    | 'issue_created'
    | 'no_fix_found'
    | 'build_failed'
    | 'lint_failed'
    | 'typecheck_failed'
    | 'diff_too_large'
    | 'timeout'
    | 'cost_exceeded'
    | 'error';
  prUrl?: string;
  issueUrl?: string;
  branchName?: string;
  summary: string;
  costUsd?: number;
  adaptationAttempts: number;
  generatedTestPath?: string;
}
