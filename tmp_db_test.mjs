import { initDatabase, setGuildSubscription } from './src/utils/database.js';

(async () => {
  try {
    await initDatabase();
    const res = await setGuildSubscription('999999', { plan: 'PRO', status: 'ACTIVE', features: { pro: true }, limits: { maxSnapshots: 50 } });
    console.log('setGuildSubscription ok:', res);
    process.exit(0);
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
})();