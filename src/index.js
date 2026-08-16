import { createClient } from './client.js';
import { config } from './config.js';
import { loadCommands, loadEvents } from './handlers/loader.js';
import { initDatabase } from './utils/database.js';
import { cache } from './utils/redis.js';
import { registerGracefulShutdown } from './utils/lifecycle.js';
import { startDashboardServer } from './dashboard/server.js';
import { logger } from './utils/logger.js';

const client = createClient();

// 1. Initialize PostgreSQL & Redis State
await initDatabase();
await cache.init();

// 2. Register 5-Phase Graceful Shutdown
registerGracefulShutdown(client);

// 3. Load Commands & Events
await loadCommands(client);
await loadEvents(client);

// 4. Start Web Dashboard (Phase 5)
startDashboardServer(client, Number(process.env.DASHBOARD_PORT || 3000));

// 5. Connect to Discord Gateway
try {
  await client.login(config.token);
} catch (err) {
  logger.error('เข้าสู่ระบบ Discord ไม่สำเร็จ ตรวจ Token และ Intents', err);
  process.exit(1);
}
