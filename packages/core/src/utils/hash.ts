import { createHash } from 'node:crypto';

/**
 * Create a deterministic SHA-256 hash for event idempotency.
 * @param parts - Strings to include in the hash
 * @returns Hex-encoded SHA-256 hash
 */
export function createIdempotencyKey(...parts: string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * Create a fingerprint hash for issue deduplication across runs.
 * @param parts - Strings to include in the fingerprint
 * @returns Hex-encoded SHA-256 hash
 */
export function createFingerprint(...parts: string[]): string {
  return createIdempotencyKey(...parts);
}
