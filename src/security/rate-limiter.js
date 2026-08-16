/**
 * In-memory sliding window rate limiter.
 * Tracks action counts per guild+type+executor over configurable time windows.
 */

class SlidingWindow {
  constructor() {
    this.entries = [];
  }

  add(timestamp) {
    this.entries.push(timestamp);
  }

  countSince(since) {
    let count = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i] >= since) count++;
      else break;
    }
    return count;
  }

  cleanup(since) {
    while (this.entries.length && this.entries[0] < since) {
      this.entries.shift();
    }
  }
}

class RateLimiter {
  constructor() {
    /** @type {Map<string, SlidingWindow>} */
    this.windows = new Map();
    this._cleanupInterval = setInterval(() => this._globalCleanup(), 60_000);
  }

  /**
   * Record an action and check if it exceeds the threshold.
   * @param {string} guildId
   * @param {string} actionType - e.g. 'ban', 'kick', 'role_delete', 'message'
   * @param {string} executorId - user who performed the action
   * @param {number} windowMs - sliding window size
   * @param {number} maxCount - max actions allowed in window
   * @returns {{ exceeded: boolean, count: number, remaining: number }}
   */
  check(guildId, actionType, executorId, windowMs, maxCount) {
    const key = `${guildId}:${actionType}:${executorId}`;
    const now = Date.now();
    const since = now - windowMs;

    let window = this.windows.get(key);
    if (!window) {
      window = new SlidingWindow();
      this.windows.set(key, window);
    }

    window.cleanup(since);
    window.add(now);
    const count = window.countSince(since);

    return {
      exceeded: count > maxCount,
      count,
      remaining: Math.max(0, maxCount - count),
    };
  }

  /**
   * Check guild-wide rate (not per-executor).
   */
  checkGuild(guildId, actionType, windowMs, maxCount) {
    return this.check(guildId, actionType, '__guild__', windowMs, maxCount);
  }

  /**
   * Get the count without incrementing.
   */
  peek(guildId, actionType, executorId, windowMs) {
    const key = `${guildId}:${actionType}:${executorId}`;
    const window = this.windows.get(key);
    if (!window) return 0;
    const since = Date.now() - windowMs;
    return window.countSince(since);
  }

  /**
   * Reset a specific counter.
   */
  reset(guildId, actionType, executorId) {
    const key = `${guildId}:${actionType}:${executorId}`;
    this.windows.delete(key);
  }

  /**
   * Reset all counters for a guild.
   */
  resetGuild(guildId) {
    for (const key of this.windows.keys()) {
      if (key.startsWith(`${guildId}:`)) {
        this.windows.delete(key);
      }
    }
  }

  _globalCleanup() {
    const cutoff = Date.now() - 120_000; // 2 minutes
    for (const [key, window] of this.windows) {
      window.cleanup(cutoff);
      if (!window.entries.length) {
        this.windows.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    this.windows.clear();
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
