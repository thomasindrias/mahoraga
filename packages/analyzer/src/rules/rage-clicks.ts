import type { Issue, MahoragaEvent, ClickPayload, Evidence, EventSummary } from 'mahoraga-core';
import { createFingerprint } from 'mahoraga-core';
import type { DetectionRule, AnalysisContext } from '../rule.js';

const RAGE_CLICK_THRESHOLD = 3;
const RAGE_CLICK_WINDOW_MS = 1000;

/**
 * Detects rage-click patterns: rapid repeated clicks on the same element.
 * A rage click is 3+ clicks on the same selector within 1 second.
 */
export class RageClickRule implements DetectionRule {
  readonly id = 'rage-clicks';
  readonly name = 'Rage Click Detector';
  readonly description =
    'Detects rapid repeated clicks on the same UI element, indicating user frustration.';
  readonly requiredEventTypes: ('click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom')[] = ['click'];

  /**
   * Analyze click events to detect rage-click patterns.
   * @param context - Analysis context
   * @returns Issues for each selector with rage clicks
   */
  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const events = context.eventStore.query({
      type: 'click',
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });

    if (events.length === 0) return [];

    // Group by (sessionId, selector)
    const groups = new Map<string, MahoragaEvent[]>();
    for (const event of events) {
      const payload = event.payload as ClickPayload;
      const key = `${event.sessionId}::${payload.selector}`;
      const group = groups.get(key);
      if (group) {
        group.push(event);
      } else {
        groups.set(key, [event]);
      }
    }

    // Find rage-click sequences and track affected selectors
    const selectorData = new Map<
      string,
      { sessions: Set<string>; events: MahoragaEvent[]; url: string }
    >();

    for (const [key, groupEvents] of groups) {
      const selector = key.split('::')[1]!;
      // Sort by timestamp
      groupEvents.sort((a, b) => a.timestamp - b.timestamp);

      // Sliding window: find sequences of 3+ clicks within 1 second
      for (let i = 0; i <= groupEvents.length - RAGE_CLICK_THRESHOLD; i++) {
        const windowEnd = groupEvents[i]!.timestamp + RAGE_CLICK_WINDOW_MS;
        let count = 0;
        for (let j = i; j < groupEvents.length && groupEvents[j]!.timestamp <= windowEnd; j++) {
          count++;
        }

        if (count >= RAGE_CLICK_THRESHOLD) {
          const existing = selectorData.get(selector);
          if (existing) {
            existing.sessions.add(groupEvents[i]!.sessionId);
            existing.events.push(...groupEvents.slice(i, i + count));
          } else {
            selectorData.set(selector, {
              sessions: new Set([groupEvents[i]!.sessionId]),
              events: [...groupEvents.slice(i, i + count)],
              url: groupEvents[i]!.url,
            });
          }
          break; // One rage-click per (session, selector) is enough
        }
      }
    }

    if (selectorData.size === 0) return [];

    // Count total unique sessions in the time window
    const allSessions = new Set(events.map((e) => e.sessionId));
    const totalSessions = allSessions.size;

    const issues: Issue[] = [];
    const seenFingerprints = new Set<string>();

    for (const [selector, data] of selectorData) {
      const fingerprint = createFingerprint('rage-clicks', selector, data.url);

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
          summary: `Click on ${payload.selector} at (${payload.coordinates.x}, ${payload.coordinates.y})`,
        });
      }

      const evidence: Evidence[] = [
        {
          type: 'event_cluster',
          description: `${data.sessions.size} session(s) had rage clicks on "${selector}" (${Math.round(sessionRatio * 100)}% of sessions)`,
          eventSummaries,
        },
      ];

      issues.push({
        id: fingerprint,
        ruleId: this.id,
        fingerprint,
        severity,
        title: `Rage clicks detected on "${selector}"`,
        description: `Users are rapidly clicking on "${selector}", indicating frustration. ${data.sessions.size} out of ${totalSessions} sessions affected.`,
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
 */
function getSeverity(sessionRatio: number): Issue['severity'] {
  if (sessionRatio >= 0.25) return 'critical';
  if (sessionRatio >= 0.1) return 'high';
  if (sessionRatio >= 0.05) return 'medium';
  return 'low';
}
