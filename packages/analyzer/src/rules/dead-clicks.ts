import type { Issue, MahoragaEvent, ClickPayload, Evidence, EventSummary } from 'mahoraga-core';
import { createFingerprint } from 'mahoraga-core';
import type { DetectionRule, AnalysisContext } from '../rule.js';

const DEAD_CLICK_THRESHOLD = 5;
const DEAD_CLICK_SESSION_THRESHOLD = 2;
const NAVIGATION_TIMEOUT_MS = 2000;

/**
 * Detects dead clicks: clicks on elements that never trigger navigation within 2 seconds.
 * A dead click is a click that has no navigation event within 2000ms from the same session.
 */
export class DeadClickRule implements DetectionRule {
  readonly id = 'dead-clicks';
  readonly name = 'Dead Click Detector';
  readonly description =
    'Detects clicks on elements that never trigger navigation or form submission.';
  readonly requiredEventTypes: ('click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom')[] = ['click', 'navigation'];

  /**
   * Analyze click and navigation events to detect dead-click patterns.
   * @param context - Analysis context
   * @returns Issues for each selector with dead clicks
   */
  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const clickEvents = context.eventStore.query({
      type: 'click',
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });

    if (clickEvents.length === 0) return [];

    const navigationEvents = context.eventStore.query({
      type: 'navigation',
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });

    // For each click, check if any navigation follows within 2s from the same session
    const deadClicks: MahoragaEvent[] = [];

    for (const click of clickEvents) {
      const hasNavigation = navigationEvents.some(
        (nav) =>
          nav.sessionId === click.sessionId &&
          nav.timestamp > click.timestamp &&
          nav.timestamp <= click.timestamp + NAVIGATION_TIMEOUT_MS,
      );

      if (!hasNavigation) {
        deadClicks.push(click);
      }
    }

    if (deadClicks.length === 0) return [];

    // Group dead clicks by selector
    const selectorData = new Map<
      string,
      { sessions: Set<string>; events: MahoragaEvent[]; url: string }
    >();

    for (const click of deadClicks) {
      const payload = click.payload as ClickPayload;
      const selector = payload.selector;

      const existing = selectorData.get(selector);
      if (existing) {
        existing.sessions.add(click.sessionId);
        existing.events.push(click);
      } else {
        selectorData.set(selector, {
          sessions: new Set([click.sessionId]),
          events: [click],
          url: click.url,
        });
      }
    }

    // Filter by threshold: >= 5 dead clicks across >= 2 sessions
    const qualifyingSelectors = Array.from(selectorData.entries()).filter(
      ([_selector, data]) =>
        data.events.length >= DEAD_CLICK_THRESHOLD &&
        data.sessions.size >= DEAD_CLICK_SESSION_THRESHOLD,
    );

    if (qualifyingSelectors.length === 0) return [];

    // Count total unique sessions in the time window
    const allSessions = new Set(clickEvents.map((e) => e.sessionId));
    const totalSessions = allSessions.size;

    const issues: Issue[] = [];
    const seenFingerprints = new Set<string>();

    for (const [selector, data] of qualifyingSelectors) {
      const fingerprint = createFingerprint('dead-clicks', selector, data.url);

      if (seenFingerprints.has(fingerprint)) continue;
      seenFingerprints.add(fingerprint);

      const sessionRatio = data.sessions.size / totalSessions;
      const severity = getSeverity(sessionRatio);

      // Deduplicate event summaries by eventId
      const seenEventIds = new Set<string>();
      const eventSummaries: EventSummary[] = [];
      for (const evt of data.events) {
        if (seenEventIds.has(evt.id)) continue;
        seenEventIds.add(evt.id);
        const payload = evt.payload as ClickPayload;
        eventSummaries.push({
          eventId: evt.id,
          type: evt.type,
          timestamp: evt.timestamp,
          url: evt.url,
          summary: `Click on ${payload.selector} at (${payload.coordinates.x}, ${payload.coordinates.y}) - no navigation`,
        });
      }

      const evidence: Evidence[] = [
        {
          type: 'event_cluster',
          description: `${data.sessions.size} session(s) had dead clicks on "${selector}" (${Math.round(sessionRatio * 100)}% of sessions)`,
          eventSummaries,
        },
      ];

      issues.push({
        id: fingerprint,
        ruleId: this.id,
        fingerprint,
        severity,
        title: `Dead clicks detected on "${selector}"`,
        description: `Users are clicking on "${selector}" but no navigation occurs. ${data.sessions.size} out of ${totalSessions} sessions affected.`,
        evidence,
        affectedElements: [{ selector, url: data.url }],
        frequency: data.sessions.size,
      });
    }

    return issues;
  }
}

/**
 * Determine severity based on the ratio of sessions affected.
 * @param sessionRatio - Ratio of affected sessions
 * @returns Severity level
 */
function getSeverity(sessionRatio: number): Issue['severity'] {
  if (sessionRatio >= 0.25) return 'critical';
  if (sessionRatio >= 0.1) return 'high';
  if (sessionRatio >= 0.05) return 'medium';
  return 'low';
}
