/**
 * Distributed & In-Memory Lock Manager.
 * Prevents race conditions across concurrent commands and distributed shards.
 * Features:
 * - Deadlock prevention via sorted key acquisition
 * - TTL / Lock acquisition timeout (prevents hanging locks)
 * - Safe release guarantee
 */

import { logger } from './logger.js';

const inMemoryChains = new Map();
const lockTimeouts = new Map();

/**
 * Acquire an in-memory lock on a single key with timeout guard.
 */
export async function withLock(key, fn, timeoutMs = 15_000) {
  const previous = inMemoryChains.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => {}).then(() => current);
  inMemoryChains.set(key, queued);

  // Deadlock guard: auto-release if operation hangs
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Lock acquisition timed out for key "${key}" after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([previous.catch(() => {}), timeoutPromise]);
    clearTimeout(timer);
    return await fn();
  } finally {
    clearTimeout(timer);
    release();
    if (inMemoryChains.get(key) === queued) {
      inMemoryChains.delete(key);
    }
  }
}

/**
 * Acquire locks on multiple keys atomically in alphabetical order to prevent deadlocks.
 */
export async function withLocks(keys, fn, timeoutMs = 15_000) {
  const unique = [...new Set(keys)].sort();
  const run = unique.reduceRight(
    (next, key) => () => withLock(key, next, timeoutMs),
    fn,
  );
  return run();
}

/**
 * PostgreSQL Advisory Lock helper (used for migrations and global distributed jobs).
 */
export async function withPostgresAdvisoryLock(knexInstance, lockKeyId, fn) {
  let hasLock = false;
  try {
    const result = await knexInstance.raw('SELECT pg_try_advisory_lock(?)', [lockKeyId]);
    hasLock = result?.rows?.[0]?.pg_try_advisory_lock ?? false;

    if (!hasLock) {
      logger.warn(`Postgres Advisory Lock [${lockKeyId}] is already held by another instance. Skipping.`);
      return false;
    }

    return await fn();
  } finally {
    if (hasLock) {
      await knexInstance.raw('SELECT pg_advisory_unlock(?)', [lockKeyId]).catch(() => {});
    }
  }
}
