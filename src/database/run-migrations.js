/**
 * Standalone Migration Runner with PostgreSQL Advisory Lock.
 * Can be run via `npm run db:migrate` or during bot startup.
 */

import { initDatabase, closeDatabase } from '../utils/database.js';
import { logger } from '../utils/logger.js';

try {
  logger.info('Starting standalone database migration...');
  await initDatabase();
  logger.info('Database migrations completed successfully.');
  await closeDatabase();
  process.exit(0);
} catch (err) {
  logger.error('Database migration failed:', err);
  process.exit(1);
}
