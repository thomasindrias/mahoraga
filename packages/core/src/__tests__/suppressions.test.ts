import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../storage/db.js';
import { SuppressionStore } from '../storage/suppressions.js';
import type { DatabaseManager } from '../storage/db.js';

let dbManager: DatabaseManager;
let store: SuppressionStore;

beforeEach(() => {
  dbManager = createDatabase(':memory:');
  store = new SuppressionStore(dbManager.db);
});

describe('SuppressionStore', () => {
  it('suppress() makes isSuppressed() return true', () => {
    store.suppress('fp-1', 'rage-clicks');
    expect(store.isSuppressed('fp-1')).toBe(true);
  });

  it('isSuppressed() returns false for unknown fingerprint', () => {
    expect(store.isSuppressed('unknown')).toBe(false);
  });

  it('suppress() is idempotent (no error on double call)', () => {
    store.suppress('fp-1', 'rage-clicks', 'reason 1');
    store.suppress('fp-1', 'rage-clicks', 'reason 2');
    expect(store.isSuppressed('fp-1')).toBe(true);
    // Updated reason
    const all = store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.reason).toBe('reason 2');
  });

  it('suppress() stores reason', () => {
    store.suppress('fp-1', 'error-spikes', 'known issue');
    const all = store.getAll();
    expect(all[0]!.reason).toBe('known issue');
  });

  it('unsuppress() removes the suppression', () => {
    store.suppress('fp-1', 'rage-clicks');
    store.unsuppress('fp-1');
    expect(store.isSuppressed('fp-1')).toBe(false);
  });

  it('unsuppress() is no-op for non-existent fingerprint', () => {
    expect(() => store.unsuppress('non-existent')).not.toThrow();
  });

  it('filterSuppressed() returns set of suppressed fingerprints', () => {
    store.suppress('fp-a', 'rage-clicks');
    store.suppress('fp-c', 'error-spikes');

    const suppressed = store.filterSuppressed(['fp-a', 'fp-b', 'fp-c']);
    expect(suppressed).toEqual(new Set(['fp-a', 'fp-c']));
  });

  it('filterSuppressed() returns empty set for empty input', () => {
    const result = store.filterSuppressed([]);
    expect(result).toEqual(new Set());
  });

  it('getAll() returns suppressions sorted by suppressed_at ascending', () => {
    store.suppress('fp-1', 'rule-1');
    store.suppress('fp-2', 'rule-2');
    store.suppress('fp-3', 'rule-3');

    const all = store.getAll();
    expect(all).toHaveLength(3);
    expect(all[0]!.fingerprint).toBe('fp-1');
    expect(all[2]!.fingerprint).toBe('fp-3');
    // Ascending order
    expect(all[0]!.suppressedAt).toBeLessThanOrEqual(all[1]!.suppressedAt);
    expect(all[1]!.suppressedAt).toBeLessThanOrEqual(all[2]!.suppressedAt);
  });

  it('getAll() returns empty array on fresh database', () => {
    expect(store.getAll()).toEqual([]);
  });
});
