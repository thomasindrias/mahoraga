import { z } from 'zod';

/** Click interaction payload schema */
export const ClickPayloadSchema = z.object({
  type: z.literal('click'),
  selector: z.string(),
  text: z.string().optional(),
  coordinates: z.object({ x: z.number(), y: z.number() }),
  isRageClick: z.boolean(),
});

/** JavaScript error payload schema */
export const ErrorPayloadSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  stack: z.string().optional(),
  componentName: z.string().optional(),
  frequency: z.number().int().nonnegative(),
});

/** Page navigation payload schema */
export const NavigationPayloadSchema = z.object({
  type: z.literal('navigation'),
  from: z.string(),
  to: z.string(),
  duration: z.number().nonnegative().optional(),
});

/** Performance metric payload schema */
export const PerformancePayloadSchema = z.object({
  type: z.literal('performance'),
  metric: z.string(),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
});

/** Form interaction payload schema */
export const FormPayloadSchema = z.object({
  type: z.literal('form'),
  formSelector: z.string(),
  action: z.enum(['focus', 'blur', 'submit', 'abandon']),
  fieldSelector: z.string().optional(),
  duration: z.number().nonnegative().optional(),
});

/** Custom event payload schema */
export const CustomPayloadSchema = z.object({
  type: z.literal('custom'),
  name: z.string(),
  properties: z.record(z.unknown()),
});

/** Discriminated union of all event payload types */
export const EventPayloadSchema = z.discriminatedUnion('type', [
  ClickPayloadSchema,
  ErrorPayloadSchema,
  NavigationPayloadSchema,
  PerformancePayloadSchema,
  FormPayloadSchema,
  CustomPayloadSchema,
]);

/** Supported event types */
export const EventTypeSchema = z.enum([
  'click',
  'error',
  'navigation',
  'performance',
  'form',
  'custom',
]);

/**
 * Normalized event schema — the foundation of the entire pipeline.
 * All source adapters must transform their native format into this schema.
 * Validated by Zod at the ingestion boundary.
 */
export const MahoragaEventSchema = z.object({
  /** Idempotency key — deterministic hash of (source, rawEventType, sessionId, timestamp, selector/message) */
  id: z.string(),
  /** Schema version for forward compatibility */
  schemaVersion: z.literal(1),
  /** Ephemeral session identifier — anonymous, no user correlation */
  sessionId: z.string(),
  /** Unix timestamp in milliseconds */
  timestamp: z.number().int().positive(),
  /** Normalized event type */
  type: EventTypeSchema,
  /** Page URL where the event occurred */
  url: z.string(),
  /** Type-specific payload */
  payload: EventPayloadSchema,
  /** Source provenance metadata */
  metadata: z.object({
    /** Which adapter produced this event */
    source: z.string(),
    /** Original event name in the source platform */
    rawEventType: z.string(),
  }),
});
