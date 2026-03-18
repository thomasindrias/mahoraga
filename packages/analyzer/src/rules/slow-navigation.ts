import type { Issue, MahoragaEvent, NavigationPayload, Evidence, EventSummary } from 'mahoraga-core';
import { createFingerprint, normalizeUrl } from 'mahoraga-core';
import type { DetectionRule, AnalysisContext } from '../rule.js';

const DEFAULT_THRESHOLD_MS = 3000;
const DEFAULT_MIN_OCCURRENCES = 3;
const DEFAULT_MIN_SESSIONS = 2;

/**
 * Detects route transitions that consistently take too long.
 * A slow navigation is a route change that takes more than 3 seconds.
 * Flags routes with 3+ slow navigations across 2+ sessions.
 */
export class SlowNavigationRule implements DetectionRule {
  readonly id = 'slow-navigation';
  readonly name = 'Slow Navigation Detector';
  readonly description = 'Detects route transitions that consistently take too long.';
  readonly requiredEventTypes: ('click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom')[] = ['navigation'];

  /**
   * Analyze navigation events to detect slow route transitions.
   * @param context - Analysis context with event store and time windows
   * @returns Issues for each route pair with slow navigations
   */
  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const thresholds = context.thresholds?.['slow-navigation'];
    const thresholdMs = thresholds?.thresholdMs ?? DEFAULT_THRESHOLD_MS;
    const minOccurrences = thresholds?.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
    const minSessions = thresholds?.minSessions ?? DEFAULT_MIN_SESSIONS;
    const routePatterns = context.routePatterns ?? [];

    const events = context.eventStore.query({
      type: 'navigation',
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });

    if (events.length === 0) return [];

    // Filter events with duration > thresholdMs
    const slowEvents = events.filter((event) => {
      const payload = event.payload as NavigationPayload;
      return payload.duration !== undefined && payload.duration > thresholdMs;
    });

    if (slowEvents.length === 0) return [];

    // Group by route pair: from -> to
    const routeData = new Map<
      string,
      { sessions: Set<string>; events: MahoragaEvent[]; durations: number[]; url: string }
    >();

    for (const event of slowEvents) {
      const payload = event.payload as NavigationPayload;
      const from = normalizeUrl(payload.from, routePatterns);
      const to = normalizeUrl(payload.to, routePatterns);
      const routePair = `${from}->${to}`;

      const existing = routeData.get(routePair);
      if (existing) {
        existing.sessions.add(event.sessionId);
        existing.events.push(event);
        existing.durations.push(payload.duration!);
      } else {
        routeData.set(routePair, {
          sessions: new Set([event.sessionId]),
          events: [event],
          durations: [payload.duration!],
          url: event.url,
        });
      }
    }

    // Filter routes that meet thresholds
    const issues: Issue[] = [];

    for (const [routePair, data] of routeData) {
      if (data.events.length < minOccurrences || data.sessions.size < minSessions) {
        continue;
      }

      const fingerprint = createFingerprint('slow-navigation', routePair);

      // Calculate median duration
      const sortedDurations = [...data.durations].sort((a, b) => a - b);
      const medianIndex = Math.floor(sortedDurations.length / 2);
      const median = sortedDurations[medianIndex]!;

      const severity = getSeverity(median);

      // Create event summaries
      const eventSummaries: EventSummary[] = data.events.slice(0, 10).map((evt) => {
        const payload = evt.payload as NavigationPayload;
        return {
          eventId: evt.id,
          type: evt.type,
          timestamp: evt.timestamp,
          url: evt.url,
          summary: `Navigation from ${payload.from} to ${payload.to} took ${payload.duration}ms`,
        };
      });

      const evidence: Evidence[] = [
        {
          type: 'slow_transitions',
          description: `${data.events.length} slow navigations on route "${routePair}" across ${data.sessions.size} session(s). Median duration: ${median}ms`,
          eventSummaries,
        },
      ];

      issues.push({
        id: fingerprint,
        ruleId: this.id,
        fingerprint,
        severity,
        title: `Slow navigation: ${routePair}`,
        description: `Route transition "${routePair}" is consistently slow. ${data.events.length} occurrences across ${data.sessions.size} sessions with median duration of ${median}ms.`,
        evidence,
        affectedElements: [{ selector: routePair, url: data.url }],
        frequency: data.sessions.size,
      });
    }

    return issues;
  }
}

/**
 * Determine severity based on median navigation duration.
 * @param medianDuration - Median duration in milliseconds
 * @returns Severity level
 */
function getSeverity(medianDuration: number): Issue['severity'] {
  if (medianDuration > 10000) return 'critical';
  if (medianDuration > 7000) return 'high';
  if (medianDuration > 5000) return 'medium';
  return 'low';
}
