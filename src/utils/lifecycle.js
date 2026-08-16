/**
 * Application Lifecycle & Graceful Shutdown Manager.
 * Executes a 5-Phase shutdown procedure:
 * 1. Mark status as shutting down & stop accepting new inputs
 * 2. Drain active Job Queue tasks (10s timeout)
 * 3. Destroy Discord Client WebSocket connection
 * 4. Close Redis and PostgreSQL database connection pools
 * 5. Cleanly exit process
 */

import { logger } from './logger.js';
import { jobQueue } from './queue.js';
import { cache } from './redis.js';
import { closeDatabase } from './database.js';

let isShuttingDown = false;

export function registerGracefulShutdown(client) {
  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`═══════════════════════════════════════════════════`);
    logger.info(`🛑 Received ${signal} — Initiating 5-Phase Graceful Shutdown...`);
    logger.info(`═══════════════════════════════════════════════════`);

    // Phase 1: Stop accepting jobs / set status
    try {
      if (client?.user) {
        client.user.setStatus('invisible');
      }
    } catch {
      /* ignore */
    }

    // Phase 2: Drain Job Queue
    try {
      logger.info('Phase 2/5: Draining active worker jobs...');
      await jobQueue.drain(10_000);
      logger.info('Phase 2/5: Worker jobs drained.');
    } catch (err) {
      logger.error('Phase 2/5 Error during queue drain', err);
    }

    // Phase 3: Close Discord Client Gateway connection
    try {
      logger.info('Phase 3/5: Disconnecting Discord Gateway...');
      client?.destroy();
      logger.info('Phase 3/5: Discord Gateway disconnected.');
    } catch (err) {
      logger.error('Phase 3/5 Error during client destroy', err);
    }

    // Phase 4: Close Redis & Database connection pools
    try {
      logger.info('Phase 4/5: Closing Redis & PostgreSQL pools...');
      await cache.close();
      await closeDatabase();
      logger.info('Phase 4/5: All database pools closed.');
    } catch (err) {
      logger.error('Phase 4/5 Error during database pool close', err);
    }

    // Phase 5: Exit process
    logger.info('Phase 5/5: Graceful shutdown complete. Exiting.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    shutdown('uncaughtException');
  });
}
