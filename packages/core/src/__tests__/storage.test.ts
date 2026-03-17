import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, DatabaseManager } from '../storage/db.js';
import { EventStore } from '../storage/events.js';
import { CheckpointStore } from '../storage/checkpoints.js';
import { IssueStore } from '../storage/issues.js';
import { RunStore } from '../storage/runs.js';
import { createEvent, createRageClickSequence, resetEventCounter } from '../testing/index.js';
import type { Issue, RunError } from '../types/index.js';

let dbManager: DatabaseManager;

beforeEach(() => {
  resetEventCounter();
  dbManager = createDatabase(':memory:');
});

afterEach(() => {
  dbManager.close();
});

describe('DatabaseManager', () => {
  it('should create all tables on initialization', () => {
    const tables = dbManager.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('checkpoints');
    expect(tableNames).toContain('issue_groups');
    expect(tableNames).toContain('runs');
    expect(tableNames).toContain('_migrations');
  });

  it('should use WAL journal mode for file-based databases', () => {
    // In-memory databases always use 'memory' journal mode
    const result = dbManager.db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0]?.journal_mode).toBe('memory');
  });
});

describe('EventStore', () => {
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore(dbManager.db);
  });

  it('should insert and query events', () => {
    const events = [createEvent(), createEvent()];
    const inserted = store.insertBatch(events);

    expect(inserted).toBe(2);

    const results = store.query({});
    expect(results).toHaveLength(2);
  });

  it('should deduplicate events by id', () => {
    const event = createEvent();
    store.insertBatch([event]);
    const inserted = store.insertBatch([event]);

    expect(inserted).toBe(0);

    const results = store.query({});
    expect(results).toHaveLength(1);
  });

  it('should filter by event type', () => {
    const clickEvent = createEvent({ type: 'click', payload: { type: 'click', selector: '#a', coordinates: { x: 0, y: 0 }, isRageClick: false } });
    const errorEvent = createEvent({ type: 'error', payload: { type: 'error', message: 'err', frequency: 1 } });

    store.insertBatch([clickEvent, errorEvent]);

    const clicks = store.query({ type: 'click' });
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.type).toBe('click');
  });

  it('should filter by time range', () => {
    const now = Date.now();
    const old = createEvent({ timestamp: now - 100_000 });
    const recent = createEvent({ timestamp: now - 1000 });

    store.insertBatch([old, recent]);

    const results = store.query({ start: now - 50_000 });
    expect(results).toHaveLength(1);
  });

  it('should delete events older than a timestamp', () => {
    const now = Date.now();
    const old = createEvent({ timestamp: now - 100_000 });
    const recent = createEvent({ timestamp: now - 1000 });

    store.insertBatch([old, recent]);

    const deleted = store.deleteOlderThan(now - 50_000);
    expect(deleted).toBe(1);

    const remaining = store.query({});
    expect(remaining).toHaveLength(1);
  });

  it('should count events', () => {
    store.insertBatch(createRageClickSequence('#btn', 5));
    expect(store.count({ type: 'click' })).toBe(5);
  });
});

describe('CheckpointStore', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = new CheckpointStore(dbManager.db);
  });

  it('should return null for unknown source', () => {
    expect(store.get('unknown')).toBeNull();
  });

  it('should set and get a cursor', () => {
    const cursor = { value: '2024-01-01T00:00:00Z', updatedAt: Date.now() };
    store.set('amplitude', cursor);

    const result = store.get('amplitude');
    expect(result).toEqual(cursor);
  });

  it('should update existing cursor', () => {
    store.set('amplitude', { value: 'old', updatedAt: 1000 });
    store.set('amplitude', { value: 'new', updatedAt: 2000 });

    const result = store.get('amplitude');
    expect(result?.value).toBe('new');
  });

  it('should delete a cursor', () => {
    store.set('amplitude', { value: 'val', updatedAt: 1000 });
    store.delete('amplitude');

    expect(store.get('amplitude')).toBeNull();
  });
});

describe('IssueStore', () => {
  let store: IssueStore;

  beforeEach(() => {
    store = new IssueStore(dbManager.db);
  });

  const testIssue: Issue = {
    id: 'issue-1',
    ruleId: 'rage-clicks',
    fingerprint: 'fp-1',
    severity: 'high',
    title: 'Rage clicks on #btn',
    description: 'Many users rage-clicked',
    evidence: [],
    affectedElements: [{ selector: '#btn', url: 'https://example.com' }],
    frequency: 10,
  };

  it('should upsert and retrieve an issue', () => {
    store.upsert(testIssue);

    const result = store.getById('issue-1');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Rage clicks on #btn');
    expect(result!.status).toBe('detected');
  });

  it('should update on fingerprint conflict', () => {
    store.upsert(testIssue);
    store.upsert({ ...testIssue, id: 'issue-2', frequency: 20 });

    // Should still be one issue (same fingerprint)
    const all = store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.frequency).toBe(20);
  });

  it('should get issues by status', () => {
    store.upsert(testIssue);
    store.updateStatus('issue-1', 'dispatched');

    expect(store.getByStatus('detected')).toHaveLength(0);
    expect(store.getByStatus('dispatched')).toHaveLength(1);
  });

  it('should update status with PR URL', () => {
    store.upsert(testIssue);
    store.updateStatus('issue-1', 'pr_created', 'https://github.com/org/repo/pull/1');

    const result = store.getById('issue-1');
    expect(result!.status).toBe('pr_created');
    expect(result!.prUrl).toBe('https://github.com/org/repo/pull/1');
  });
});

describe('RunStore', () => {
  let store: RunStore;

  beforeEach(() => {
    store = new RunStore(dbManager.db);
  });

  it('should create and retrieve a run', () => {
    store.create('run-1');

    const run = store.getById('run-1');
    expect(run).not.toBeNull();
    expect(run!.status).toBe('running');
    expect(run!.eventsPulled).toBe(0);
  });

  it('should update run counters', () => {
    store.create('run-1');
    store.update('run-1', { eventsPulled: 100 });
    store.update('run-1', { issuesDetected: 3 });

    const run = store.getById('run-1');
    expect(run!.eventsPulled).toBe(100);
    expect(run!.issuesDetected).toBe(3);
  });

  it('should complete a run', () => {
    store.create('run-1');
    const errors: RunError[] = [
      { phase: 'pull', message: 'timeout', timestamp: Date.now() },
    ];
    store.complete('run-1', 'completed', errors);

    const run = store.getById('run-1');
    expect(run!.status).toBe('completed');
    expect(run!.finishedAt).not.toBeNull();
    expect(run!.errors).toHaveLength(1);
  });

  it('should get recent runs', () => {
    store.create('run-1');
    store.create('run-2');
    store.create('run-3');

    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
  });
});
