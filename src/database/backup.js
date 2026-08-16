/**
 * Automated Database Backup & Retention Manager.
 * Supports Daily, Weekly, and Monthly backup snapshots with automatic rotation policy:
 * - 7 Daily backups
 * - 4 Weekly backups
 * - 3 Monthly backups
 */

import fs from 'fs';
import path from 'path';
import { getDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

const BACKUP_DIR = path.resolve(process.cwd(), 'data', 'backups');

// Ensure backup folder exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export async function createDatabaseBackup(label = 'manual') {
  const db = getDb();
  if (!db) {
    throw new Error('Database is not initialized');
  }

  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${label}_${dateStr}.json`;
  const filePath = path.join(BACKUP_DIR, filename);

  const tables = [
    'economy',
    'levels',
    'warnings',
    'guild_configs',
    'reminders',
    'afk',
    'security_incidents',
    'security_snapshots',
    'trusted_users',
    'trusted_roles',
    'protected_resources',
    'cases',
    'mod_notes',
    'automod_filters',
    'punishment_rules',
    'temp_bans',
    'temp_roles',
    'jails',
    'ban_appeals',
    'mod_queue',
    'tickets',
    'ticket_messages',
    'ticket_notes',
    'ticket_panels',
    'ticket_feedback',
    'ticket_staff_stats',
    'giveaways',
    'reaction_roles',
    'starboard',
    'suggestions',
    'birthdays',
    'announcements',
  ];

  const backupData = {
    version: '1.0',
    createdAt: timestamp,
    iso: new Date(timestamp).toISOString(),
    label,
    tables: {},
  };

  for (const table of tables) {
    try {
      const hasTable = await db.schema.hasTable(table);
      if (hasTable) {
        const rows = await db(table).select('*');
        backupData.tables[table] = rows;
      }
    } catch (err) {
      logger.warn(`Backup: could not export table "${table}":`, err.message);
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');
  const sizeKb = Math.round(fs.statSync(filePath).size / 1024);
  logger.info(`Database backup created: ${filename} (${sizeKb} KB)`);

  // Run retention cleanup
  await pruneExpiredBackups();

  return {
    filename,
    filePath,
    sizeKb,
    tablesCount: Object.keys(backupData.tables).length,
    timestamp,
  };
}

/**
 * Retention Policy:
 * 7 Daily, 4 Weekly, 3 Monthly backups
 */
export async function pruneExpiredBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json'));
    const categorized = {
      daily: [],
      weekly: [],
      monthly: [],
      manual: [],
    };

    for (const file of files) {
      const fullPath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(fullPath);
      if (file.includes('daily')) categorized.daily.push({ file, path: fullPath, time: stat.mtimeMs });
      else if (file.includes('weekly')) categorized.weekly.push({ file, path: fullPath, time: stat.mtimeMs });
      else if (file.includes('monthly')) categorized.monthly.push({ file, path: fullPath, time: stat.mtimeMs });
      else categorized.manual.push({ file, path: fullPath, time: stat.mtimeMs });
    }

    const pruneCategory = (items, maxKeep) => {
      items.sort((a, b) => b.time - a.time); // newest first
      const toDelete = items.slice(maxKeep);
      for (const item of toDelete) {
        try {
          fs.unlinkSync(item.path);
          logger.info(`Backup Retention: Pruned expired backup ${item.file}`);
        } catch {
          /* ignore */
        }
      }
    };

    pruneCategory(categorized.daily, 7);
    pruneCategory(categorized.weekly, 4);
    pruneCategory(categorized.monthly, 3);
    pruneCategory(categorized.manual, 10);
  } catch (err) {
    logger.error('pruneExpiredBackups failed', err);
  }
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((file) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, file));
      return {
        file,
        sizeKb: Math.round(stat.size / 1024),
        modifiedAt: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}
