import type { Issue, MahoragaEvent, FormPayload, Evidence, EventSummary } from 'mahoraga-core';
import { createFingerprint } from 'mahoraga-core';
import type { DetectionRule, AnalysisContext } from '../rule.js';

const DEFAULT_MIN_SESSIONS = 3;
const DEFAULT_MIN_ABANDON_RATE = 0.4; // 40%

/**
 * Detects forms with high abandonment rates indicating UX friction.
 * A form is considered problematic if it has >= 3 abandon sessions AND >= 40% abandon rate.
 */
export class FormAbandonmentRule implements DetectionRule {
  readonly id = 'form-abandonment';
  readonly name = 'Form Abandonment Detector';
  readonly description = 'Detects forms with high abandonment rates indicating UX friction.';
  readonly requiredEventTypes: ('click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom')[] = ['form'];

  /**
   * Analyze form events to detect high abandonment rates.
   * @param context - Analysis context
   * @returns Issues for each form with high abandonment
   */
  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const thresholds = context.thresholds?.['form-abandonment'];
    const minSessions = thresholds?.minSessions ?? DEFAULT_MIN_SESSIONS;
    const minAbandonRate = thresholds?.minAbandonRate ?? DEFAULT_MIN_ABANDON_RATE;

    const events = context.eventStore.query({
      type: 'form',
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });

    if (events.length === 0) return [];

    // Group by (sessionId, formSelector)
    const sessionFormGroups = new Map<string, MahoragaEvent[]>();
    for (const event of events) {
      const payload = event.payload as FormPayload;
      const key = `${event.sessionId}::${payload.formSelector}`;
      const group = sessionFormGroups.get(key);
      if (group) {
        group.push(event);
      } else {
        sessionFormGroups.set(key, [event]);
      }
    }

    // Determine session outcome per (sessionId, formSelector)
    const formData = new Map<
      string,
      {
        abandonSessions: Set<string>;
        submitSessions: Set<string>;
        events: MahoragaEvent[];
        url: string;
      }
    >();

    for (const [key, groupEvents] of sessionFormGroups) {
      const formSelector = key.split('::')[1]!;
      const sessionId = key.split('::')[0]!;

      // Check if this session has submit or abandon
      const hasSubmit = groupEvents.some((e) => (e.payload as FormPayload).action === 'submit');
      const hasAbandon = groupEvents.some((e) => (e.payload as FormPayload).action === 'abandon');

      const existing = formData.get(formSelector);
      const url = groupEvents[0]!.url;

      if (!existing) {
        formData.set(formSelector, {
          abandonSessions: new Set(),
          submitSessions: new Set(),
          events: [],
          url,
        });
      }

      const data = formData.get(formSelector)!;

      // If session has submit, count as submit (even if it also has abandon)
      if (hasSubmit) {
        data.submitSessions.add(sessionId);
      } else if (hasAbandon) {
        // Only count as abandon if no submit in this session
        data.abandonSessions.add(sessionId);
      }

      // Collect abandon events for evidence
      if (hasAbandon && !hasSubmit) {
        const abandonEvents = groupEvents.filter(
          (e) => (e.payload as FormPayload).action === 'abandon',
        );
        data.events.push(...abandonEvents);
      }
    }

    const issues: Issue[] = [];

    for (const [formSelector, data] of formData) {
      const abandonCount = data.abandonSessions.size;
      const submitCount = data.submitSessions.size;
      const totalSessions = abandonCount + submitCount;

      // Check thresholds
      if (abandonCount < minSessions) continue;
      if (totalSessions === 0) continue;

      const abandonRate = abandonCount / totalSessions;
      if (abandonRate < minAbandonRate) continue;

      const severity = getSeverity(abandonRate);
      const fingerprint = createFingerprint('form-abandonment', formSelector);

      // Create event summaries from abandon events (limit to 10 for readability)
      const eventSummaries: EventSummary[] = data.events.slice(0, 10).map((evt) => {
        const payload = evt.payload as FormPayload;
        return {
          eventId: evt.id,
          type: evt.type,
          timestamp: evt.timestamp,
          url: evt.url,
          summary: `Form "${payload.formSelector}" abandoned`,
        };
      });

      const ratePercent = Math.round(abandonRate * 100);
      const evidence: Evidence[] = [
        {
          type: 'abandonment_rate',
          description: `Form "${formSelector}" has ${abandonCount} abandon sessions and ${submitCount} submit sessions (${ratePercent}% abandonment rate)`,
          eventSummaries,
        },
      ];

      issues.push({
        id: fingerprint,
        ruleId: this.id,
        fingerprint,
        severity,
        title: `High form abandonment on "${formSelector}"`,
        description: `Form "${formSelector}" has a ${ratePercent}% abandonment rate with ${abandonCount} sessions abandoned out of ${totalSessions} total sessions.`,
        evidence,
        affectedElements: [{ selector: formSelector, url: data.url }],
        frequency: abandonCount,
      });
    }

    return issues;
  }
}

/**
 * Determine severity based on abandonment rate.
 * @param abandonRate - Ratio of abandon sessions to total sessions
 * @returns Severity level
 */
function getSeverity(abandonRate: number): Issue['severity'] {
  if (abandonRate >= 0.8) return 'critical'; // >= 80%
  if (abandonRate >= 0.6) return 'high'; // >= 60%
  if (abandonRate >= 0.4) return 'medium'; // >= 40%
  return 'low';
}
