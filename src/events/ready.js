import { Events, ActivityType } from 'discord.js';
import {
  getReminders,
  removeReminder,
  getTodayBirthdays,
  markBirthdayCelebrated,
  getPendingAnnouncements,
  markAnnouncementSent,
} from '../utils/database.js';
import { infoEmbed } from '../utils/embeds.js';
import { mentionUsers, safeText } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';
import { checkLockdownExpiry } from '../security/lockdown.js';
import { checkExpiredPunishments } from '../moderation/temp-punish.js';
import { checkExpiredJails } from '../moderation/jail.js';
import { checkAutoClose } from '../tickets/autoclose.js';
import { autoEndGiveaways } from '../commands/giveaway.js';
import { jobQueue } from '../utils/queue.js';
import { runHealthCheck } from '../utils/health.js';
import { createDatabaseBackup } from '../database/backup.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    client.startTime = Date.now();
    logger.info(`เข้าสู่ระบบเป็น ${client.user.tag}`);
    logger.info(`อยู่ใน ${client.guilds.cache.size} เซิร์ฟเวอร์`);
    client.user.setActivity('/help | Ultimate Enterprise Bot', { type: ActivityType.Watching });

    // Initial 5-Tier Health Check (await so we can decide whether to run background workers)
    const health = await runHealthCheck(client);
    logger.info(`System Health Status: [${health.overallStatus}] (DB: ${health.database.status}, Cache: ${health.cache.status}, Queue: ${health.queue.status})`);

    // If DB is offline, skip background workers to avoid repeated errors in development fallback
    if (health.database.status !== 'ONLINE') {
      logger.warn('Database is OFFLINE — skipping background job scheduling (running in development fallback mode)');
      return;
    }

    // ── Register Job Queue Workers ──

    // 1. Reminders Worker
    jobQueue.register('worker_reminders', async () => {
      const now = Date.now();
      for (const reminder of await getReminders()) {
        if (reminder.time > now) continue;
        try {
          const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
          if (channel?.isTextBased()) {
            await channel.send({
              content: `<@${reminder.userId}>`,
              embeds: [infoEmbed('เตือนความจำ', safeText(reminder.message, 200))],
              allowedMentions: mentionUsers(reminder.userId),
            }).catch(() => {});
          }
        } finally {
          await removeReminder(reminder.id);
        }
      }
    });

    // 2. Temp Punishments & Jails Worker
    jobQueue.register('worker_moderation', async () => {
      await checkLockdownExpiry(client);
      await checkExpiredPunishments(client);
      await checkExpiredJails(client);
    });

    // 3. Ticket Auto-Close Worker
    jobQueue.register('worker_tickets', async () => {
      await checkAutoClose(client);
    });

    // 4. Community Events Worker (Giveaways & Announcements)
    jobQueue.register('worker_community', async () => {
      await autoEndGiveaways(client);

      const pending = await getPendingAnnouncements();
      for (const ann of pending) {
        try {
          const channel = await client.channels.fetch(ann.channel_id).catch(() => null);
          if (channel?.isTextBased()) {
            await channel.send({ content: `📢 **Announcement**\n${ann.content}` });
          }
        } catch {
          /* channel gone */
        }
        await markAnnouncementSent(ann.id);
      }
    });

    // 5. Birthdays Worker (Daily)
    jobQueue.register('worker_birthdays', async () => {
      for (const [, guild] of client.guilds.cache) {
        const todayBds = await getTodayBirthdays(guild.id);
        for (const bd of todayBds) {
          const oneDayMs = 24 * 60 * 60 * 1000;
          if (bd.last_celebrated && Date.now() - Number(bd.last_celebrated) < oneDayMs) continue;

          const systemChannel = guild.systemChannel || guild.channels.cache.find((c) => c.isTextBased() && c.name.includes('general'));
          if (systemChannel) {
            await systemChannel.send(`🎂🎉 Happy Birthday <@${bd.user_id}>! 🎉🎂`).catch(() => {});
          }
          await markBirthdayCelebrated(guild.id, bd.user_id);
        }
      }
    });

    // 6. Automated Daily Database Backup Worker
    jobQueue.register('worker_backup_daily', async () => {
      try {
        await createDatabaseBackup('daily_auto');
      } catch (err) {
        logger.error('worker_backup_daily failed', err);
      }
    });

    // ── Schedule Background Jobs into Queue ──
    jobQueue.scheduleInterval('worker_reminders', 15_000);
    jobQueue.scheduleInterval('worker_moderation', 20_000);
    jobQueue.scheduleInterval('worker_tickets', 60_000);
    jobQueue.scheduleInterval('worker_community', 30_000);
    jobQueue.scheduleInterval('worker_birthdays', 60 * 60 * 1000); // Check hourly
    jobQueue.scheduleInterval('worker_backup_daily', 24 * 60 * 60 * 1000); // Daily backup

    logger.info('Decoupled Job Queue workers registered and active.');
  },
};
