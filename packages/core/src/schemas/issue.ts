import { z } from 'zod';

/** Summary of an event used as evidence */
export const EventSummarySchema = z.object({
  eventId: z.string(),
  type: z.string(),
  timestamp: z.number(),
  url: z.string(),
  summary: z.string(),
});

/** A single data point supporting an issue detection */
export const EvidenceSchema = z.object({
  type: z.enum(['event_cluster', 'frequency_spike', 'pattern_match', 'error_loop', 'abandonment_rate', 'poor_cls', 'slow_transitions']),
  description: z.string(),
  eventSummaries: z.array(EventSummarySchema),
});

/** Reference to a UI element affected by an issue */
export const ElementRefSchema = z.object({
  selector: z.string(),
  url: z.string(),
  componentName: z.string().optional(),
});

/** Severity levels for detected issues */
export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/** Issue status lifecycle */
export const IssueStatusSchema = z.enum([
  'detected',
  'dispatched',
  'pr_created',
  'no_fix',
  'cooldown',
]);

/**
 * A detected UI issue with evidence and affected elements.
 * Produced by detection rules in the analyzer.
 */
export const IssueSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  fingerprint: z.string(),
  severity: SeveritySchema,
  title: z.string(),
  description: z.string(),
  evidence: z.array(EvidenceSchema),
  affectedElements: z.array(ElementRefSchema),
  suggestedAction: z.string().optional(),
  frequency: z.number().int().nonnegative(),
});

/**
 * Persisted issue group in SQLite.
 * Extends Issue with lifecycle tracking fields.
 */
export const IssueGroupSchema = IssueSchema.extend({
  status: IssueStatusSchema,
  prUrl: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
