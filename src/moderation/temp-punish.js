/**
 * Temp Punishments — Temporary bans, timeouts, and roles with auto-expiry.
 * Provides:
 * - tempBan: Ban a user for a duration, auto-unban when expired
 * - tempRole: Give a role temporarily, auto-remove when expired
 * - checkExpired: Periodic check that resolves expired temp punishments
 */
import {
  addTempBan,
  getTempBans,
  resolveTempBan,
  getExpiredTempBans,
  addTempRole,
  getTempRoles,
  resolveTempRole,
  getExpiredTempRoles,
} from '../utils/database.js';
import { createModCase } from './case-manager.js';
import { sendModLog } from '../utils/modlog.js';
import { parseDuration } from '../utils/duration.js';
import { logger } from '../utils/logger.js';

/**
 * Apply a temporary ban.
 * @param {Guild} guild
 * @param {string} userId - user to ban
 * @param {GuildMember} moderator
 * @param {string} reason
 * @param {string} durationStr - e.g. "7d", "2w", "30d"
 * @param {number} deleteDays - days of messages to delete
 */
export async function tempBan(guild, userId, moderator, reason, durationStr, deleteDays = 0) {
  const ms = parseDuration(durationStr, { min: 60_000, max: 365 * 24 * 60 * 60 * 1000 });
  if (!ms) throw new Error('Duration ไม่ถูกต้อง (1 นาที - 365 วัน) เช่น 1h, 1d, 7d, 30d');

  const expiresAt = Date.now() + ms;

  // Ban the user
  await guild.members.ban(userId, {
    reason: `[TempBan ${durationStr}] ${reason}`,
    deleteMessageSeconds: deleteDays * 86400,
  });

  // Create case
  const caseId = await createModCase(guild.id, 'tempban', userId, moderator.id, reason, {
    duration: durationStr,
    expiresAt,
    deleteDays,
  });

  // Record in DB
  await addTempBan(guild.id, userId, moderator.id, reason, expiresAt, caseId);

  // Log
  await sendModLog(guild, {
    action: `Temp Ban (${durationStr})`,
    moderator,
    target: { id: userId, toString: () => `<@${userId}>` },
    reason,
    extra: `Expires: <t:${Math.floor(expiresAt / 1000)}:R>`,
  });

  return { caseId, expiresAt };
}

/**
 * Apply a temporary role.
 */
export async function tempRole(guild, member, roleId, moderator, durationStr) {
  const ms = parseDuration(durationStr, { min: 60_000, max: 180 * 24 * 60 * 60 * 1000 });
  if (!ms) throw new Error('Duration ไม่ถูกต้อง (1 นาที - 180 วัน)');

  const expiresAt = Date.now() + ms;

  // Add role to member
  await member.roles.add(roleId, `[TempRole ${durationStr}] by ${moderator.id}`);

  // Record in DB
  const tempRoleId = await addTempRole(guild.id, member.id, roleId, moderator.id, expiresAt);

  // Create case
  const caseId = await createModCase(guild.id, 'role', member.id, moderator.id, `Temporary role for ${durationStr}`, {
    roleId,
    duration: durationStr,
    expiresAt,
  });

  // Log
  await sendModLog(guild, {
    action: `Temp Role (${durationStr})`,
    moderator,
    target: member.user,
    reason: `Role <@&${roleId}> for ${durationStr}`,
    extra: `Expires: <t:${Math.floor(expiresAt / 1000)}:R>`,
  });

  return { tempRoleId, caseId, expiresAt };
}

/**
 * Get active temp bans for a guild.
 */
export async function getActiveTempBans(guildId) {
  return getTempBans(guildId);
}

/**
 * Get active temp roles for a user in a guild.
 */
export async function getActiveTempRoles(guildId, userId) {
  return getTempRoles(guildId, userId);
}

/**
 * Check and resolve all expired temp punishments. Call periodically (e.g., every 60s).
 */
export async function checkExpiredPunishments(client) {
  // ── Expired temp bans ──
  const expiredBans = await getExpiredTempBans();
  for (const ban of expiredBans) {
    try {
      const guild = client.guilds.cache.get(ban.guildId);
      if (!guild) continue;
      await guild.members.unban(ban.userId, '[AutoUnban] Temp ban expired');
      await resolveTempBan(ban.guildId, ban.userId);

      // Create unban case
      await createModCase(ban.guildId, 'unban', ban.userId, client.user.id, 'Temp ban expired (auto-unban)');

      logger.info(`Auto-unbanned ${ban.userId} in ${ban.guildId} (temp ban expired)`);
    } catch (err) {
      logger.error(`Failed to auto-unban ${ban.userId} in ${ban.guildId}`, err);
    }
  }

  // ── Expired temp roles ──
  const expiredRoles = await getExpiredTempRoles();
  for (const entry of expiredRoles) {
    try {
      const guild = client.guilds.cache.get(entry.guildId);
      if (!guild) continue;
      const member = await guild.members.fetch(entry.userId).catch(() => null);
      if (member) {
        await member.roles.remove(entry.roleId, '[AutoRemove] Temp role expired');
      }
      await resolveTempRole(entry.id);
      logger.info(`Removed temp role ${entry.roleId} from ${entry.userId} in ${entry.guildId}`);
    } catch (err) {
      logger.error(`Failed to remove temp role`, err);
    }
  }

  return { unbans: expiredBans.length, roleRemovals: expiredRoles.length };
}
