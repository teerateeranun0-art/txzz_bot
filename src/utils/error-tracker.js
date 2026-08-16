/**
 * Production Error Tracking & Diagnostics Engine.
 * Captures, indexes, and surfaces errors with unique Error IDs.
 */

import crypto from 'crypto';
import { logger } from './logger.js';

class ErrorTracker {
  constructor(maxStored = 200) {
    this.errors = new Map(); // errorId -> ErrorContext
    this.recentErrors = [];   // Array of errorIds
    this.maxStored = maxStored;
  }

  /**
   * Capture an error and generate an Error ID.
   */
  capture(err, context = {}) {
    const errorId = `ERR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const entry = {
      id: errorId,
      message: err?.message || String(err),
      stack: err?.stack || '',
      guildId: context.guildId || null,
      userId: context.userId || null,
      commandName: context.commandName || context.action || 'unknown',
      details: context.details || {},
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
    };

    this.errors.set(errorId, entry);
    this.recentErrors.unshift(errorId);

    // Evict oldest if exceeding capacity
    if (this.recentErrors.length > this.maxStored) {
      const evictedId = this.recentErrors.pop();
      this.errors.delete(evictedId);
    }

    logger.error(`[${errorId}] ${entry.commandName}: ${entry.message}`, err);
    return entry;
  }

  /**
   * Lookup an error by ID.
   */
  get(errorId) {
    if (!errorId) return null;
    const formatted = errorId.trim().toUpperCase();
    return this.errors.get(formatted) || null;
  }

  /**
   * Get recent errors list.
   */
  getRecent(limit = 10) {
    return this.recentErrors.slice(0, limit).map((id) => this.errors.get(id));
  }

  /**
   * Summary stats for health/diagnostics.
   */
  getStats() {
    const now = Date.now();
    const last10m = this.recentErrors.filter((id) => {
      const err = this.errors.get(id);
      return err && now - err.timestamp < 10 * 60 * 1000;
    }).length;

    return {
      totalCaptured: this.recentErrors.length,
      last10Minutes: last10m,
    };
  }
}

export const errorTracker = new ErrorTracker();
