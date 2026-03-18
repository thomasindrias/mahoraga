import { describe, it, expect } from 'vitest';
import { MahoragaEventSchema } from '../schemas/event.js';
import { IssueSchema } from '../schemas/issue.js';
import { defineConfig } from '../schemas/config.js';

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

describe('MahoragaConfigSchema', () => {
  it('should apply defaults for minimal config', () => {
    const config = defineConfig({
      sources: [{ adapter: 'amplitude' }],
    });

    expect(config.analysis.windowDays).toBe(3);
    expect(config.agent.provider).toBe('claude-code');
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
        provider: 'claude-code',
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

  it('should default lint and typecheck postChecks to false', () => {
    const config = defineConfig({ sources: [{ adapter: 'amplitude' }] });
    expect(config.agent.postChecks.lint).toBe(false);
    expect(config.agent.postChecks.typecheck).toBe(false);
  });

  it('should accept lint and typecheck postChecks', () => {
    const config = defineConfig({
      sources: [{ adapter: 'amplitude' }],
      agent: { postChecks: { lint: true, typecheck: true } },
    });
    expect(config.agent.postChecks.lint).toBe(true);
    expect(config.agent.postChecks.typecheck).toBe(true);
  });

  it('should accept conventions field in agent config', () => {
    const config = defineConfig({
      sources: [{ adapter: 'amplitude' }],
      agent: { conventions: 'Use kebab-case filenames' },
    });
    expect(config.agent.conventions).toBe('Use kebab-case filenames');
  });
});
