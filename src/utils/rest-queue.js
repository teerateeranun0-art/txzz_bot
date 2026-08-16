/**
 * Discord REST Request Queue.
 * Controls concurrency and rate limits for bulk outgoing Discord API calls
 * (e.g. bulk channel restorations, mass role assignments, lockdown permission sweeps).
 */

import { retryWithBackoff } from './retry.js';
import { logger } from './logger.js';

class RestQueue {
  constructor(concurrency = 3, delayBetweenMs = 150) {
    this.concurrency = concurrency;
    this.delayBetweenMs = delayBetweenMs;
    this.queue = [];
    this.active = 0;
  }

  /**
   * Enqueue a Discord REST API task.
   */
  enqueue(taskFn, priority = false) {
    return new Promise((resolve, reject) => {
      const item = {
        taskFn,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      if (priority) {
        this.queue.unshift(item);
      } else {
        this.queue.push(item);
      }

      this.process();
    });
  }

  async process() {
    if (this.active >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.active += 1;
    const item = this.queue.shift();
    if (!item) {
      this.active -= 1;
      return;
    }

    try {
      const result = await retryWithBackoff(item.taskFn);
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.active -= 1;
      if (this.delayBetweenMs > 0) {
        await new Promise((r) => setTimeout(r, this.delayBetweenMs));
      }
      this.process();
    }
  }

  getStats() {
    return {
      active: this.active,
      queued: this.queue.length,
      concurrency: this.concurrency,
    };
  }
}

export const restQueue = new RestQueue(3, 150);
