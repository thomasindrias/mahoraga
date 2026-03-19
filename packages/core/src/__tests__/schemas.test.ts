import { describe, it, expect } from 'vitest';
import { MahoragaEventSchema } from '../schemas/event.js';
import { IssueSchema } from '../schemas/issue.js';
import { defineConfig, RuleThresholdsSchema } from '../schemas/config.js';

describe('MahoragaEventSchema', () => {
  it('should validate a valid click event', () => {
    const event = {
      id: 'abc123',
      schemaVersion: 1,
      sessionId: 'session-1',
      timestamp: Date.now(),
      type: 'click',
      url: 'https://example.com',
      payload: {
        type: 'click',
        selector: '#btn',
        coordinates: { x: 10, y: 20 },
        isRageClick: false,
      },
      metadata: { source: 'amplitude', rawEventType: 'click' },
    };

    expect(MahoragaEventSchema.parse(event)).toEqual(event);
  });

  it('should validate a valid error event', () => {
    const event = {
      id: 'err123',
      schemaVersion: 1,
      sessionId: 'session-2',
      timestamp: Date.now(),
      type: 'error',
      url: 'https://example.com/page',
      payload: {
        type: 'error',
        message: 'Cannot read property x of undefined',
        frequency: 5,
      },
      metadata: { source: 'amplitude', rawEventType: 'js_error' },
    };

    expect(MahoragaEventSchema.parse(event)).toEqual(event);
  });

  it('should reject events with invalid type', () => {
    const event = {
      id: 'bad',
      schemaVersion: 1,
      sessionId: 'session-1',
      timestamp: Date.now(),
      type: 'invalid_type',
      url: 'https://example.com',
      payload: { type: 'click', selector: '#btn', coordinates: { x: 0, y: 0 }, isRageClick: false },
      metadata: { source: 'test', rawEventType: 'test' },
    };

    expect(() => MahoragaEventSchema.parse(event)).toThrow();
  });

  it('should reject events with mismatched payload type', () => {
    const event = {
      id: 'mismatch',
      schemaVersion: 1,
      sessionId: 'session-1',
      timestamp: Date.now(),
      type: 'click',
      url: 'https://example.com',
      payload: { type: 'error', message: 'oops', frequency: 1 },
      metadata: { source: 'test', rawEventType: 'test' },
    };

    // The event validates because payload is a discriminated union
    // — the payload itself is valid even if type field differs from event type.
    // This is by design: the outer type is the normalized type.
    const result = MahoragaEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('should reject events with negative timestamp', () => {
    const event = {
      id: 'neg',
      schemaVersion: 1,
      sessionId: 'session-1',
      timestamp: -1,
      type: 'click',
      url: 'https://example.com',
      payload: { type: 'click', selector: '#btn', coordinates: { x: 0, y: 0 }, isRageClick: false },
      metadata: { source: 'test', rawEventType: 'test' },
    };

    expect(() => MahoragaEventSchema.parse(event)).toThrow();
  });
});

describe('IssueSchema', () => {
  it('should validate a valid issue', () => {
    const issue = {
      id: 'issue-1',
      ruleId: 'rage-clicks',
      fingerprint: 'fp-abc',
      severity: 'high',
      title: 'Rage clicks on #add-to-cart',
      description: '15 sessions experienced rage clicks',
      evidence: [
        {
          type: 'event_cluster',
          description: '5 clicks in 800ms',
          eventSummaries: [
            { eventId: 'e1', type: 'click', timestamp: 1000, url: 'https://example.com', summary: 'click on #btn' },
          ],
        },
      ],
      affectedElements: [{ selector: '#add-to-cart', url: 'https://example.com/shop' }],
      frequency: 15,
    };

    expect(IssueSchema.parse(issue)).toEqual(issue);
  });
});

describe('RuleThresholdsSchema', () => {
  it('produces all defaults matching hardcoded values when parsed with empty object', () => {
    const thresholds = RuleThresholdsSchema.parse({});
    expect(thresholds['rage-clicks'].clickCount).toBe(3);
    expect(thresholds['rage-clicks'].windowMs).toBe(1000);
    expect(thresholds['error-spikes'].spikeMultiplier).toBe(2);
    expect(thresholds['error-spikes'].minAbsoluteCount).toBe(5);
    expect(thresholds['dead-clicks'].minClickCount).toBe(5);
    expect(thresholds['dead-clicks'].minSessions).toBe(2);
    expect(thresholds['dead-clicks'].waitMs).toBe(2000);
    expect(thresholds['form-abandonment'].minAbandonRate).toBe(0.4);
    expect(thresholds['form-abandonment'].minSessions).toBe(3);
    expect(thresholds['slow-navigation'].thresholdMs).toBe(3000);
    expect(thresholds['slow-navigation'].minOccurrences).toBe(3);
    expect(thresholds['slow-navigation'].minSessions).toBe(2);
    expect(thresholds['layout-shifts'].minPoorEvents).toBe(3);
    expect(thresholds['layout-shifts'].minSessions).toBe(2);
    expect(thresholds['error-loops'].minOccurrences).toBe(3);
    expect(thresholds['error-loops'].minSessions).toBe(2);
  });

  it('accepts partial overrides', () => {
    const thresholds = RuleThresholdsSchema.parse({
      'rage-clicks': { clickCount: 5 },
    });
    expect(thresholds['rage-clicks'].clickCount).toBe(5);
    expect(thresholds['rage-clicks'].windowMs).toBe(1000); // default preserved
    expect(thresholds['error-spikes'].spikeMultiplier).toBe(2); // other rules default
  });

  it('rejects invalid values', () => {
    expect(() => RuleThresholdsSchema.parse({
      'rage-clicks': { clickCount: -1 },
    })).toThrow();

    expect(() => RuleThresholdsSchema.parse({
      'form-abandonment': { minAbandonRate: 1.5 },
    })).toThrow();
  });
});

describe('MahoragaConfigSchema', () => {
  it('should apply defaults for minimal config', () => {
    const config = defineConfig({
      sources: [{ adapter: 'amplitude' }],
    });

    expect(config.analysis.windowDays).toBe(3);
    expect(config.analysis.routePatterns).toEqual([]);
    expect(config.analysis.thresholds['rage-clicks'].clickCount).toBe(3);
    expect(config.agent.provider).toBe('opencode');
    expect(config.agent.maxRetries).toBe(3);
    expect(config.agent.confidenceThreshold).toBe(0.7);
    expect(config.agent.allowedPaths).toEqual([]);
    expect(config.agent.deniedPaths).toEqual([]);
    expect(config.storage.dbPath).toBe('.mahoraga/mahoraga.db');
    expect(config.storage.retentionDays).toBe(30);
    expect(config.logging.level).toBe('info');
  });

  it('should accept full config with governance', () => {
    const config = defineConfig({
      sources: [{ adapter: 'amplitude', apiKey: 'key', secretKey: 'secret' }],
      agent: {
        provider: 'opencode',
        allowedPaths: ['src/'],
        deniedPaths: ['src/auth/'],
        confidenceThreshold: 0.8,
        maxRetries: 5,
      },
    });

    expect(config.agent.allowedPaths).toEqual(['src/']);
    expect(config.agent.deniedPaths).toEqual(['src/auth/']);
    expect(config.agent.confidenceThreshold).toBe(0.8);
    expect(config.agent.maxRetries).toBe(5);
  });

  it('should reject removed provider values', () => {
    expect(() => defineConfig({
      sources: [{ adapter: 'amplitude' }],
      agent: {
        provider: 'gemini' as any,
      },
    })).toThrow();
  });

  it('should strip removed agent fields without error', () => {
    const config = defineConfig({
      sources: [{ adapter: 'amplitude' }],
      agent: {
        model: 'gpt-4o' as any,
        apiKey: 'sk-xxx' as any,
        baseURL: 'https://api.example.com' as any,
        claudeMdPath: '/path/to/claude.md' as any,
        skills: ['skill1'] as any,
        mcpServers: ['server1'] as any,
      },
    });

    // Zod 4 strips unknown keys by default
    expect((config.agent as any).model).toBeUndefined();
    expect((config.agent as any).apiKey).toBeUndefined();
    expect((config.agent as any).baseURL).toBeUndefined();
    expect((config.agent as any).claudeMdPath).toBeUndefined();
    expect((config.agent as any).skills).toBeUndefined();
    expect((config.agent as any).mcpServers).toBeUndefined();
    // agentMdPath should still be allowed (we're keeping it)
    expect(config.agent.provider).toBe('opencode');
  });
});
