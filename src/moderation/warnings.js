/**
 * Enhanced Warnings — Points-based warnings with expiration and auto-punishment escalation.
 * When a user receives a warning, this module:
 * 1. Records the warning with points
 * 2. Checks total active points against punishment rules
 * 3. Executes the appropriate auto-punishment if threshold reached
 */
import {
  addWarning,
  getActiveWarningPoints,
  getPunishmentRules,
  expireWarnings,
  getWarnings,
  clearWarnings,
} from '../utils/database.js';
import { createModCase } from './case-manager.js';
import { sendModLog } from '../utils/modlog.js';
import { parseDuration } from '../utils/duration.js';
import { logger } from '../utils/logger.js';

/**
 * Issue a warning and check for auto-punishment escalation.
 * Returns { warning, caseId, autoAction } where autoAction is null if no threshold triggered.
 */
export async function issueWarning(guild, target, moderator, reason, options = {}) {
  const { points = 1, expiresIn } = options;
  const guildId = guild.id;
  const userId = target.id || target;
  const modId = moderator.id;

  // Calculate expiration timestamp
  let expiresAt = null;
  if (expiresIn) {
    const ms = parseDuration(expiresIn, { min: 3600000, max: 365 * 24 * 60 * 60 * 1000 });
    if (ms) expiresAt = Date.now() + ms;
  }

  // Create case first
  const caseId = await createModCase(guildId, 'warn', userId, modId, reason, {
    points,
    expiresAt,
  });

  // Add the warning
  const warning = await addWarning(guildId, userId, modId, reason, {
    points,
    expiresAt,
    caseId,
  });

  // Check active points against punishment rules
  const totalPoints = await getActiveWarningPoints(guildId, userId);
  const autoAction = await checkAndExecutePunishment(guild, userId, totalPoints, moderator);

  // Log to mod log channel
  await sendModLog(guild, {
    action: `Warn (${points}pt)`,
    moderator,
    target,
    reason,
    extra: `Points: ${points} | Total: ${totalPoints}${autoAction ? ` | Auto: ${autoAction}` : ''}`,
  });

  return { warning, caseId, totalPoints, autoAction };
}

/**
 * Check warning points against punishment rules and execute the matched action.
 */
async function checkAndExecutePunishment(guild, userId, totalPoints, moderator) {
  const rules = await getPunishmentRules(guild.id);
  if (!rules.length) return null;

  // Find the highest rule that the user's points exceed
  const matchedRule = rules
    .filter((r) => totalPoints >= r.pointsThreshold)
    .sort((a, b) => b.pointsThreshold - a.pointsThreshold)[0];

  if (!matchedRule) return null;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;

  try {
    switch (matchedRule.action) {
      case 'timeout': {
        const ms = matchedRule.duration ? parseDuration(matchedRule.duration) : 3600000;
        if (ms) {
          await member.timeout(ms, `[AutoPunish] ${totalPoints} warning points`);
        }
        return `Timeout (${matchedRule.duration || '1h'})`;
      }
      case 'kick': {
        await member.kick(`[AutoPunish] ${totalPoints} warning points`);
        return 'Kick';
      }
      case 'ban': {
        await guild.members.ban(userId, {
          reason: `[AutoPunish] ${totalPoints} warning points`,
          deleteMessageSeconds: 86400,
        });
        return 'Ban';
      }
      case 'quarantine': {
        // Use the security quarantine system
        const { quarantineUser } = await import('../utils/database.js');
        const previousRoles = member.roles.cache.filter((r) => !r.managed && r.id !== guild.id).map((r) => r.id);
        await quarantineUser(guild.id, userId, `[AutoPunish] ${totalPoints} warning points`, moderator.id, previousRoles, null);
        // Remove roles
        for (const roleId of previousRoles) {
          await member.roles.remove(roleId, '[AutoPunish]').catch(() => {});
        }
        return 'Quarantine';
      }
      default:
        return null;
    }
  } catch (err) {
    logger.error(`AutoPunish failed for ${userId}`, err);
    return `Failed: ${matchedRule.action}`;
  }
}

/**
 * Run periodic expiration of warnings.
 */
export async function runWarningExpiration(guildId) {
  await expireWarnings(guildId);
}

/**
 * Get formatted warning history for display.
 */
export async function getWarningHistory(guildId, userId) {
  const warns = await getWarnings(guildId, userId);
  return warns.map((w) => ({
    ...w,
    status: w.expired ? 'Expired' : (w.expiresAt && w.expiresAt < Date.now()) ? 'Expired' : 'Active',
  }));
}

/**
 * Clear all warnings and update related cases.
 */
export async function clearAllWarnings(guildId, userId, moderatorId) {
  await clearWarnings(guildId, userId);
  await createModCase(guildId, 'clearwarns', userId, moderatorId, 'Cleared all warnings');
  return true;
}
