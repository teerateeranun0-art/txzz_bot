/**
 * 5-Tier Production Health Check & Diagnostic Probe.
 * Probes: Discord Gateway, PostgreSQL, Redis/Cache, Job Queue, and Node.js Runtime.
 */

import { getDb } from './database.js';
import { cache } from './redis.js';
import { jobQueue } from './queue.js';
import { metrics } from './metrics.js';
import { errorTracker } from './error-tracker.js';

export async function runHealthCheck(client) {
  const start = Date.now();

  // 1. Discord Gateway probe
  const discordStatus = {
    status: client?.ws?.status === 0 ? 'ONLINE' : 'DEGRADED',
    ping: client?.ws?.ping ?? -1,
    guilds: client?.guilds?.cache?.size ?? 0,
    users: client?.users?.cache?.size ?? 0,
    uptime: process.uptime(),
  };

  // 2. PostgreSQL probe
  let dbStatus = { status: 'OFFLINE', latency: -1, pool: {} };
  const db = getDb();
  if (db) {
    const dbStart = Date.now();
    try {
      await db.raw('SELECT 1');
      const dbLatency = Date.now() - dbStart;
      metrics.recordDbQuery('healthCheck', dbLatency);
      const pool = db.client?.pool;
      dbStatus = {
        status: 'ONLINE',
        latency: `${dbLatency}ms`,
        pool: {
          min: pool?.min ?? 0,
          max: pool?.max ?? 0,
          used: typeof pool?.numUsed === 'function' ? pool.numUsed() : 0,
          free: typeof pool?.numFree === 'function' ? pool.numFree() : 0,
        },
      };
    } catch (err) {
      dbStatus = { status: 'OFFLINE', error: err.message };
    }
  }

  // 3. Redis / Cache probe
  const cacheStatus = await cache.getStatus();

  // 4. Job Queue probe
  const queueStatus = jobQueue.getStats();

  // 5. System Runtime probe
  const mem = process.memoryUsage();
  const runtimeStatus = {
    nodeVersion: process.version,
    platform: process.platform,
    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
  };

  const isHealthy =
    discordStatus.status === 'ONLINE' &&
    dbStatus.status === 'ONLINE' &&
    queueStatus.status !== 'DEGRADED';

  return {
    overallStatus: isHealthy ? 'HEALTHY' : 'UNHEALTHY',
    checkDuration: `${Date.now() - start}ms`,
    timestamp: new Date().toISOString(),
    discord: discordStatus,
    database: dbStatus,
    cache: cacheStatus,
    queue: queueStatus,
    runtime: runtimeStatus,
    metrics: {
      commands: metrics.getCommandMetrics(),
      throughput: metrics.getThroughput(),
      errors: errorTracker.getStats(),
    },
  };
}
