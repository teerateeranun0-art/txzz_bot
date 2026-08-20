/**
 * Production Job Queue & Background Worker System.
 * Offloads long-running and periodic jobs from the main Discord Gateway event loop.
 * Features:
 * - Worker isolation (failure in a worker doesn't crash the bot)
 * - Retries with exponential backoff
 * - Dead-Letter Queue (DLQ) for failed jobs
 * - Concurrency control & job metrics
 * - Graceful drain on shutdown
 */

import { logger } from './logger.js';

class JobQueue {
  constructor() {
    this.handlers = new Map();
    this.queue = [];
    this.scheduled = new Map(); // jobId -> timeoutRef
    this.intervals = new Map(); // name -> intervalRef
    this.activeJobs = new Set();
    this.concurrency = 5;
    this.isDraining = false;
    this.stats = {
      processed: 0,
      failed: 0,
      retried: 0,
      dlqCount: 0,
    };
    this.dlq = [];
    this.running = false;
  }

  /**
   * Register a worker handler for a specific job name.
   */
  register(jobName, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler for job "${jobName}" must be a function`);
    }
    this.handlers.set(jobName, { handler, options });
    return this;
  }

  /**
   * Push a job into the queue for immediate or delayed execution.
   */
  push(jobName, data = {}, options = {}) {
    if (this.isDraining) {
      logger.warn(`Queue is draining. Rejected job: ${jobName}`);
      return null;
    }

    const worker = this.handlers.get(jobName);
    const workerOptions = worker?.options || {};

    const maxAttempts = options.maxAttempts ?? options.maxRetries ?? workerOptions.maxAttempts ?? workerOptions.maxRetries ?? 3;
    const retryDelayMs = options.retryDelayMs ?? workerOptions.retryDelayMs ?? null;

    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: jobName,
      data,
      attempts: 0,
      maxAttempts,
      retryDelayMs,
      delayMs: options.delayMs ?? 0,
      createdAt: Date.now(),
      runAt: Date.now() + (options.delayMs ?? 0),
    };

    if (job.delayMs > 0) {
      const timeout = setTimeout(() => {
        this.scheduled.delete(job.id);
        this.queue.push(job);
        this.processNext();
      }, job.delayMs);
      this.scheduled.set(job.id, timeout);
    } else {
      this.queue.push(job);
      this.processNext();
    }

    return job.id;
  }

  /**
   * Register a recurring cron/interval task.
   */
  scheduleInterval(name, intervalMs, data = {}) {
    if (this.intervals.has(name)) {
      clearInterval(this.intervals.get(name));
    }

    const intervalRef = setInterval(() => {
      this.push(name, data);
    }, intervalMs);

    this.intervals.set(name, intervalRef);
    logger.info(`Scheduled background worker: [${name}] every ${Math.round(intervalMs / 1000)}s`);
  }

  /**
   * Process jobs in queue respecting concurrency limits.
   */
  async processNext() {
    if (this.activeJobs.size >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeJobs.add(job.id);

    try {
      const worker = this.handlers.get(job.name);
      const handler = typeof worker === 'function' ? worker : worker?.handler;
      if (!handler) {
        throw new Error(`No worker registered for job type: ${job.name}`);
      }

      job.attempts += 1;
      const startTime = Date.now();
      await handler(job.data, job);
      const duration = Date.now() - startTime;

      this.stats.processed += 1;
    } catch (err) {
      this.stats.failed += 1;
      logger.error(`Job [${job.name}] failed (Attempt ${job.attempts}/${job.maxAttempts}):`, err);

      if (job.attempts < job.maxAttempts && !this.isDraining) {
        this.stats.retried += 1;
        const backoffMs = job.retryDelayMs ?? Math.min(1000 * Math.pow(2, job.attempts), 30_000);
        setTimeout(() => {
          this.queue.unshift(job);
          this.processNext();
        }, backoffMs);
      } else {
        this.stats.dlqCount += 1;
        this.dlq.push({
          taskName: job.name,
          job,
          error: err.message,
          stack: err.stack,
          failedAt: Date.now(),
        });
        if (this.dlq.length > 100) this.dlq.shift();
      }
    } finally {
      this.activeJobs.delete(job.id);
      this.processNext();
    }
  }

  /**
   * Get captured Dead-Letter Queue items.
   */
  getDeadLetters() {
    return [...this.dlq];
  }

  /**
   * Get count of currently active running jobs.
   */
  getActiveCount() {
    return this.activeJobs.size;
  }

  /**
   * Get queue health and diagnostic statistics.
   */
  getStats() {
    return {
      status: this.isDraining ? 'DRAINING' : 'ONLINE',
      activeJobs: this.activeJobs.size,
      queuedJobs: this.queue.length,
      scheduledJobs: this.scheduled.size,
      registeredWorkers: Array.from(this.handlers.keys()),
      processedCount: this.stats.processed,
      failedCount: this.stats.failed,
      retriedCount: this.stats.retried,
      dlqCount: this.stats.dlqCount,
    };
  }

  /**
   * Gracefully drain all pending and active jobs before process exit.
   */
  async drain(timeoutMs = 10_000) {
    this.isDraining = true;
    logger.info('Queue: Draining active and pending jobs...');

    // Clear all interval timers
    for (const [, timer] of this.intervals.entries()) {
      clearInterval(timer);
    }
    this.intervals.clear();

    // Clear scheduled timers
    for (const [, timer] of this.scheduled.entries()) {
      clearTimeout(timer);
    }
    this.scheduled.clear();

    const start = Date.now();
    while ((this.activeJobs.size > 0 || this.queue.length > 0) && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 50));
    }

    logger.info(`Queue: Drain complete. Remaining active: ${this.activeJobs.size}, queue: ${this.queue.length}`);
  }
}

export const jobQueue = new JobQueue();
