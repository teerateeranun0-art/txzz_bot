/**
 * Auto-punishment engine.
 * Handles threshold-based escalation: warn -> timeout -> kick -> ban -> quarantine.
 * Supports:
 * - Simulation Mode (dry-run without real punishment)
 * - Rogue Bot Quarantine & Role Stripping
 * - Cooldown protection against cascading punishments
 */

import { PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { createIncident, logAction, quarantineUser, unquarantineUser, isQuarantined, isSimulationMode } from '../utils/database.js';
import { getUserScores } from '../utils/database.js';

// Cooldown tracker to prevent cascading punishments
const lastPunishment = new Map();

function isOnCooldown(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const last = lastPunishment.get(key) || 0;
  return Date.now() - last < config.security.punishment.cooldown;
}

function setCooldown(guildId, userId) {
  const key = `${guildId}:${userId}`;
  lastPunishment.set(key, Date.now());
}

function determinePunishment(raidScore, riskScore) {
  const combined = (raidScore + riskScore) / 2;
  if (combined >= 80) return 'quarantine';
  if (combined >= 60) return 'quarantine';
  if (combined >= 40) return 'timeout';
  return 'warn';
}

/**
 * Execute auto-punishment with Simulation Mode check.
 */
export async function executePunishment(guild, userId, reason, triggerType, options = {}) {
  if (isOnCooldown(guild.id, userId)) {
    logger.info(`Auto-punish cooldown active for ${userId} in ${guild.id}`);
    return { skipped: true, reason: 'cooldown' };
  }

  const scores = getUserScores(guild.id, userId);
  const action = options.forceAction || determinePunishment(scores.raidScore, scores.riskScore);

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { skipped: true, reason: 'member_not_found' };

  // Don't punish the server owner
  if (member.id === guild.ownerId) return { skipped: true, reason: 'owner' };

  // Check Simulation Mode (Dry-run)
  const simulation = await isSimulationMode(guild.id);
  if (simulation) {
    logger.info(`[SIMULATION MODE] Would execute ${action} on ${userId} in ${guild.id} (Reason: ${reason})`);
    await createIncident(guild.id, triggerType, 'warning', userId, {
      simulated: true,
      intendedAction: action,
      reason,
      raidScore: scores.raidScore,
      riskScore: scores.riskScore,
    }, `SIMULATED_${action.toUpperCase()}`);
    return { executed: false, simulated: true, action };
  }

  // If target is a bot, route to quarantineBot
  if (member.user.bot) {
    return quarantineBot(guild, member, reason, 'SYSTEM');
  }

  // Check if member has higher role than bot
  const botMember = guild.members.me;
  if (botMember && member.roles.highest.position >= botMember.roles.highest.position) {
    return { skipped: true, reason: 'role_hierarchy' };
  }

  setCooldown(guild.id, userId);

  try {
    switch (action) {
      case 'warn':
        await logAction(guild.id, 'SYSTEM', 'auto_warn', userId, reason, { trigger: triggerType });
        break;

      case 'timeout': {
        const duration = config.security.punishment.timeoutDuration;
        await member.timeout(duration, `[Auto] ${reason}`).catch(() => {});
        await logAction(guild.id, 'SYSTEM', 'auto_timeout', userId, reason, {
          trigger: triggerType,
          duration,
        });
        break;
      }

      case 'kick':
        await member.kick(`[Auto] ${reason}`).catch(() => {});
        await logAction(guild.id, 'SYSTEM', 'auto_kick', userId, reason, { trigger: triggerType });
        break;

      case 'ban':
        await guild.members.ban(userId, { reason: `[Auto] ${reason}`, deleteMessageSeconds: 86400 }).catch(() => {});
        await logAction(guild.id, 'SYSTEM', 'auto_ban', userId, reason, { trigger: triggerType });
        break;

      case 'quarantine':
        await quarantineMember(guild, member, reason, 'SYSTEM');
        break;
    }

    await createIncident(guild.id, triggerType, action === 'ban' ? 'critical' : 'warning', userId, {
      action,
      reason,
      raidScore: scores.raidScore,
      riskScore: scores.riskScore,
    }, action);

    return { executed: true, action };
  } catch (err) {
    logger.error(`Auto-punish failed for ${userId} in ${guild.id}`, err);
    return { skipped: true, reason: err.message };
  }
}

/**
 * Quarantine an unauthorized rogue bot (strips all roles and isolates permissions).
 */
export async function quarantineBot(guild, botMember, reason, quarantinedBy) {
  const previousRoles = botMember.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);
  await botMember.roles.remove(previousRoles, `[Rogue Bot Quarantine] ${reason}`).catch(() => {});

  await quarantineUser(guild.id, botMember.id, `Rogue Bot: ${reason}`, quarantinedBy, previousRoles, null);

  await createIncident(guild.id, 'rogue_bot', 'critical', botMember.id, {
    reason,
    botTag: botMember.user.tag,
    previousRoles,
    quarantinedBy,
  }, 'bot_quarantine');

  logger.warn(`Rogue bot quarantined: ${botMember.user.tag} (${botMember.id}) in ${guild.id}`);
  return { executed: true, action: 'bot_quarantine', previousRoles };
}

/**
 * Quarantine a member: save their roles, remove them, add quarantine role.
 */
export async function quarantineMember(guild, member, reason, quarantinedBy) {
  const previousRoles = member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);
  await member.roles.remove(previousRoles, `[Quarantine] ${reason}`).catch(() => {});

  await quarantineUser(guild.id, member.id, reason, quarantinedBy, previousRoles, null);

  await createIncident(guild.id, 'quarantine', 'warning', member.id, {
    reason,
    previousRoles,
    quarantinedBy,
  }, 'quarantine');

  return { previousRoles };
}

/**
 * Release a member from quarantine: restore their roles.
 */
export async function releaseFromQuarantine(guild, userId) {
  const data = await unquarantineUser(guild.id, userId);
  if (!data) return null;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && data.previousRoles?.length) {
    for (const roleId of data.previousRoles) {
      await member.roles.add(roleId, 'Unquarantine').catch(() => {});
    }
  }

  return data;
}
