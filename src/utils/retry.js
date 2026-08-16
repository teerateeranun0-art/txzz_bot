/**
 * Retry utility with exponential backoff and jitter.
 * Handles transient network/API failures, Discord 429 rate limits, and 5xx server errors.
 */

import { logger } from './logger.js';

export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 500,
    maxDelayMs = 10_000,
    factor = 2,
    jitter = true,
    shouldRetry = (err) => {
      // Retry on network errors, Discord 429, or 5xx server errors
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'EAI_AGAIN') return true;
      if (err.status === 429 || err.status >= 500) return true;
      if (err.code === 50035) return false; // Invalid form body - not retryable
      return false;
    },
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= maxRetries || !shouldRetry(err)) {
        throw err;
      }

      // If Discord returned retry_after
      const retryAfterMs = err.retryAfter ? err.retryAfter * 1000 : null;
      let waitMs = retryAfterMs || delay;

      if (jitter && !retryAfterMs) {
        waitMs = waitMs * (0.8 + Math.random() * 0.4);
      }

      logger.warn(`API call failed (Attempt ${attempt}/${maxRetries}), retrying in ${Math.round(waitMs)}ms: ${err.message}`);
      await new Promise((r) => setTimeout(r, waitMs));
      delay = Math.min(delay * factor, maxDelayMs);
    }
  }
}
