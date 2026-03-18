import type { Issue, MahoragaEvent, PerformancePayload, Evidence, EventSummary } from 'mahoraga-core';
import { createFingerprint } from 'mahoraga-core';
import type { DetectionRule, AnalysisContext } from '../rule.js';

const MIN_POOR_CLS_EVENTS = 3;
const MIN_AFFECTED_SESSIONS = 2;

/**
 * Detects pages with consistently poor Cumulative Layout Shift scores.
 * A layout shift issue is detected when a URL has 3+ poor CLS events across 2+ sessions.
 */
export class LayoutShiftRule implements DetectionRule {
  readonly id = 'layout-shifts';
  readonly name = 'Layout Shift Detector';
  readonly description =
    'Detects pages with consistently poor Cumulative Layout Shift scores.';
  readonly requiredEventTypes: ('click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom')[] = ['performance'];

  /**
   * Analyze performance events to detect poor CLS patterns.
   * @param context - Analysis context
   * @returns Issues for each URL with poor CLS scores
   */
  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const events = context.eventStore.query({
      type: 'performance',
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });

    if (events.length === 0) return [];

    // Filter for poor CLS events only
    const poorClsEvents = events.filter((event) => {
      const payload = event.payload as PerformancePayload;
      return payload.metric === 'CLS' && payload.rating === 'poor';
    });

    if (poorClsEvents.length === 0) return [];

    // Group by URL
    const urlData = new Map<
      string,
      { sessions: Set<string>; events: MahoragaEvent[]; clsValues: number[] }
    >();

    for (const event of poorClsEvents) {
      const url = event.url;
      const existing = urlData.get(url);
      const payload = event.payload as PerformancePayload;

      if (existing) {
        existing.sessions.add(event.sessionId);
        existing.events.push(event);
        existing.clsValues.push(payload.value);
      } else {
        urlData.set(url, {
          sessions: new Set([event.sessionId]),
          events: [event],
          clsValues: [payload.value],
        });
      }
    }

    const issues: Issue[] = [];

    for (const [url, data] of urlData) {
      // Check thresholds
      if (data.events.length < MIN_POOR_CLS_EVENTS) continue;
      if (data.sessions.size < MIN_AFFECTED_SESSIONS) continue;

      // Calculate average CLS value
      const avgCls = data.clsValues.reduce((sum, val) => sum + val, 0) / data.clsValues.length;
      const severity = getSeverity(avgCls);

      const fingerprint = createFingerprint('layout-shifts', url);

      // Create event summaries (limit to first 10)
      const eventSummaries: EventSummary[] = data.events.slice(0, 10).map((evt) => {
        const payload = evt.payload as PerformancePayload;
        return {
          eventId: evt.id,
          type: evt.type,
          timestamp: evt.timestamp,
          url: evt.url,
          summary: `CLS: ${payload.value.toFixed(3)} (${payload.rating})`,
        };
      });

      const evidence: Evidence[] = [
        {
          type: 'poor_cls',
          description: `${data.events.length} poor CLS event(s) across ${data.sessions.size} session(s). Average CLS: ${avgCls.toFixed(3)}`,
          eventSummaries,
        },
      ];

      issues.push({
        id: fingerprint,
        ruleId: this.id,
        fingerprint,
        severity,
        title: `Layout shifts detected on ${url}`,
        description: `Page "${url}" has consistently poor Cumulative Layout Shift scores. ${data.events.length} poor CLS events across ${data.sessions.size} sessions. Average CLS: ${avgCls.toFixed(3)}`,
        evidence,
        affectedElements: [{ selector: 'unknown', url }],
        frequency: data.events.length,
      });
    }

    return issues;
  }
}

/**
 * Determine severity based on average CLS value.
 * @param avgCls - Average CLS value
 * @returns Severity level
 */
function getSeverity(avgCls: number): Issue['severity'] {
  if (avgCls >= 0.5) return 'critical';
  if (avgCls >= 0.25) return 'high';
  if (avgCls >= 0.1) return 'medium';
  return 'low';
}
