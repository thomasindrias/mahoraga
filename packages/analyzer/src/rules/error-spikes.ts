import type { Issue, MahoragaEvent, ErrorPayload, Evidence, EventSummary } from '@mahoraga/core';
import { createFingerprint } from '@mahoraga/core';
import type { DetectionRule, AnalysisContext } from '../rule.js';

const MIN_SPIKE_COUNT = 5;
const MIN_SPIKE_RATIO = 2;
const MESSAGE_PREFIX_LENGTH = 100;

/**
 * Detects error spikes by comparing error rates between current and previous time windows.
 * A spike is current count > 2x previous count AND current count >= 5.
 */
export class ErrorSpikeRule implements DetectionRule {
  readonly id = 'error-spikes';
  readonly name = 'Error Spike Detector';
  readonly description =
    'Detects sudden increases in error frequency compared to the previous time window.';
  readonly requiredEventTypes: ('click' | 'error' | 'navigation' | 'performance' | 'form' | 'custom')[] = ['error'];

  /**
   * Analyze error events to detect frequency spikes.
   * @param context - Analysis context
   * @returns Issues for each error message with a spike
   */
  async analyze(context: AnalysisContext): Promise<Issue[]> {
    const currentEvents = context.eventStore.query({
      type: 'error',
      start: context.timeWindow.start,
      end: context.timeWindow.end,
    });

    const previousEvents = context.eventStore.query({
      type: 'error',
      start: context.previousWindow.start,
      end: context.previousWindow.end,
    });

    // Group by message prefix
    const currentCounts = groupByMessage(currentEvents);
    const previousCounts = groupByMessage(previousEvents);

    const issues: Issue[] = [];

    for (const [messagePrefix, data] of currentCounts) {
      const currentCount = data.count;
      const previousCount = previousCounts.get(messagePrefix)?.count ?? 0;

      // Check spike conditions
      if (currentCount < MIN_SPIKE_COUNT) continue;
      if (previousCount > 0 && currentCount / previousCount <= MIN_SPIKE_RATIO) continue;
      // If previousCount is 0 and currentCount >= MIN_SPIKE_COUNT, it's a new error spike

      const ratio = previousCount > 0 ? currentCount / previousCount : Infinity;
      const severity = getSeverity(ratio, currentCount);

      const url = data.events[0]!.url;
      const fingerprint = createFingerprint('error-spikes', messagePrefix, url);

      const eventSummaries: EventSummary[] = data.events.slice(0, 10).map((evt) => {
        const payload = evt.payload as ErrorPayload;
        return {
          eventId: evt.id,
          type: evt.type,
          timestamp: evt.timestamp,
          url: evt.url,
          summary: payload.message,
        };
      });

      const ratioStr = previousCount > 0 ? `${ratio.toFixed(1)}x` : 'new';
      const evidence: Evidence[] = [
        {
          type: 'frequency_spike',
          description: `Error "${messagePrefix}" spiked from ${previousCount} to ${currentCount} occurrences (${ratioStr} increase)`,
          eventSummaries,
        },
      ];

      issues.push({
        id: fingerprint,
        ruleId: this.id,
        fingerprint,
        severity,
        title: `Error spike: "${messagePrefix}"`,
        description: `Error "${messagePrefix}" increased from ${previousCount} to ${currentCount} occurrences (${ratioStr}).`,
        evidence,
        affectedElements: [{ selector: 'unknown', url }],
        frequency: currentCount,
      });
    }

    return issues;
  }
}

/**
 * Group error events by message prefix and count occurrences.
 */
function groupByMessage(
  events: MahoragaEvent[],
): Map<string, { count: number; events: MahoragaEvent[] }> {
  const groups = new Map<string, { count: number; events: MahoragaEvent[] }>();

  for (const event of events) {
    const payload = event.payload as ErrorPayload;
    const prefix = payload.message.slice(0, MESSAGE_PREFIX_LENGTH);
    const existing = groups.get(prefix);
    if (existing) {
      existing.count++;
      existing.events.push(event);
    } else {
      groups.set(prefix, { count: 1, events: [event] });
    }
  }

  return groups;
}

/**
 * Determine severity based on spike ratio and absolute count.
 */
function getSeverity(ratio: number, count: number): Issue['severity'] {
  if (ratio >= 10 || count >= 100) return 'critical';
  if (ratio >= 5 || count >= 50) return 'high';
  if (ratio >= 3 || count >= 20) return 'medium';
  return 'low';
}
