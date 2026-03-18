import type { Issue, MahoragaEvent, ErrorPayload, Evidence, EventSummary } from 'mahoraga-core';
import { createFingerprint } from 'mahoraga-core';
import type { DetectionRule, AnalysisContext } from '../rule.js';

const MIN_LOOP_COUNT = 3;
const MIN_SESSION_COUNT = 2;
const MESSAGE_PREFIX_LENGTH = 100;

/**
 * Detects error loops where the same error repeats multiple times within single sessions.
 * A loop is 3+ occurrences of the same error in a session.
 * Requires 2+ sessions with loops for the same error to create an issue.
 */
export class ErrorLoopRule implements DetectionRule {
  readonly id = 'error-loops';
  readonly name = 'Error Loop Detector';
  readonly description =
    'Detects sessions where the same error repeats multiple times, indicating users stuck in error loops.';
  readonly requiredEventTypes: ('click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom')[] = ['error'];

  /**
   * Analyze error events to detect within-session repetition loops.
   * @param context - Analysis context
   * @returns Issues for each error message with loops in 2+ sessions
   */
  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const events = context.eventStore.query({
      type: 'error',
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });

    // Group by (sessionId, messagePrefix)
    const sessionGroups = groupBySessionAndMessage(events);

    // Find loops: groups with count >= MIN_LOOP_COUNT
    const loops = new Map<string, Array<{ sessionId: string; count: number; events: MahoragaEvent[] }>>();

    for (const [key, data] of sessionGroups) {
      if (data.count >= MIN_LOOP_COUNT) {
        const messagePrefix = key.split('||')[1]!;
        if (!loops.has(messagePrefix)) {
          loops.set(messagePrefix, []);
        }
        loops.get(messagePrefix)!.push({
          sessionId: key.split('||')[0]!,
          count: data.count,
          events: data.events,
        });
      }
    }

    const issues: Issue[] = [];

    // For each error message, check if 2+ sessions have loops
    for (const [messagePrefix, sessionLoops] of loops) {
      if (sessionLoops.length < MIN_SESSION_COUNT) continue;

      // Calculate average loop count across affected sessions
      const avgLoopCount = sessionLoops.reduce((sum, s) => sum + s.count, 0) / sessionLoops.length;
      const severity = getSeverity(avgLoopCount);

      // Take first URL from the first session's first event
      const url = sessionLoops[0]!.events[0]!.url;
      const fingerprint = createFingerprint('error-loops', messagePrefix);

      // Build event summaries from first session's events (up to 10)
      const eventSummaries: EventSummary[] = sessionLoops[0]!.events.slice(0, 10).map((evt) => {
        const payload = evt.payload as ErrorPayload;
        return {
          eventId: evt.id,
          type: evt.type,
          timestamp: evt.timestamp,
          url: evt.url,
          summary: payload.message,
        };
      });

      const evidence: Evidence[] = [
        {
          type: 'error_loop',
          description: `Error "${messagePrefix}" repeated ${avgLoopCount.toFixed(1)} times on average across ${sessionLoops.length} sessions`,
          eventSummaries,
        },
      ];

      issues.push({
        id: fingerprint,
        ruleId: this.id,
        fingerprint,
        severity,
        title: `Error loop: "${messagePrefix}"`,
        description: `Error "${messagePrefix}" repeated in ${sessionLoops.length} sessions (avg ${avgLoopCount.toFixed(1)} occurrences per session). Users are stuck in error loops.`,
        evidence,
        affectedElements: [{ selector: 'unknown', url }],
        frequency: sessionLoops.length,
      });
    }

    return issues;
  }
}

/**
 * Group error events by (sessionId, messagePrefix) and count occurrences.
 * @param events - Error events to group
 * @returns Map of "sessionId||messagePrefix" to count and events
 */
function groupBySessionAndMessage(
  events: MahoragaEvent[],
): Map<string, { count: number; events: MahoragaEvent[] }> {
  const groups = new Map<string, { count: number; events: MahoragaEvent[] }>();

  for (const event of events) {
    const payload = event.payload as ErrorPayload;
    const messagePrefix = payload.message.slice(0, MESSAGE_PREFIX_LENGTH);
    const key = `${event.sessionId}||${messagePrefix}`;

    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.events.push(event);
    } else {
      groups.set(key, { count: 1, events: [event] });
    }
  }

  return groups;
}

/**
 * Determine severity based on average loop count across sessions.
 * @param avgLoopCount - Average number of loops per session
 * @returns Severity level
 */
function getSeverity(avgLoopCount: number): Issue['severity'] {
  if (avgLoopCount >= 10) return 'critical';
  if (avgLoopCount >= 7) return 'high';
  if (avgLoopCount >= 5) return 'medium';
  return 'low';
}
