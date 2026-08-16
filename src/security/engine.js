/**
 * Central security event processor.
 * Receives events from Discord event handlers and routes them through
 * the rate limiter, scoring engine, auto-punishment system, and auto-snapshot engine.
 */

import { AuditLogEvent } from 'discord.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { rateLimiter } from './rate-limiter.js';
import { calculateRiskScore, calculateRaidScore, isRiskDangerous, getRiskScoreBreakdown } from './scoring.js';
import { executePunishment, quarantineMember, quarantineBot } from './actions.js';
import { activateLockdown, getLockdownStatus } from './lockdown.js';
import { sendSecurityAlert } from './alerts.js';
import { autoIncidentSnapshot } from './snapshot.js';
import {
  createIncident,
  isProtected,
  isTrustedUser,
  getGuildThresholds,
  isSimulationMode,
  recordSecurityDecision,
  getBotAllowlist,
} from '../utils/database.js';

/**
 * Process a guild audit log entry for security monitoring.
 * This is the backbone of anti-nuke detection.
 */
export async function processAuditLogEntry(entry, guild) {
  if (!entry.executorId) return;
  const executorId = entry.executorId;

  // Skip self
  const botMember = guild.members.me;
  if (executorId === botMember?.id) return;

  // Skip server owner (they can do anything)
  if (executorId === guild.ownerId) return;

  // Skip trusted users
  if (await isTrustedUser(guild.id, executorId)) return;

  const actionType = classifyAuditAction(entry.action);
  if (!actionType) return;

  // Check custom guild thresholds
  const customThresholds = (await getGuildThresholds(guild.id)) || {};
  const guildSetting = customThresholds[actionType];
  const windowMs = guildSetting?.windowMs || config.security.antiNukeWindow;
  const maxLimit = guildSetting?.max || getThreshold(actionType, config.security.antiNuke);

  // Update risk score
  calculateRiskScore(guild.id, executorId, actionType);

  // Check rate limits for this action type
  const rateResult = rateLimiter.check(guild.id, actionType, executorId, windowMs, maxLimit);

  // Check if target is protected resource
  const targetId = entry.targetId;
  const isTargetProtected = await checkProtectedResource(guild.id, actionType, targetId);

  // Generate Incident Session ID
  const sessionId = `INC-${guild.id.slice(-4)}-${Date.now()}`;

  // If protected resource was modified, immediate alert + snapshot
  if (isTargetProtected) {
    await autoIncidentSnapshot(guild, `Protected Resource (${actionType})`);
    await createIncident(guild.id, 'protected_resource', 'critical', executorId, {
      action: actionType,
      targetId,
      threshold: maxLimit,
    }, 'alert', sessionId);

    await sendSecurityAlert(guild, `Protected Resource Modified`, {
      action: actionType,
      executor: `<@${executorId}>`,
      target: targetId,
    }, { severity: 'critical' });
  }

  // Anti-nuke trigger: if rate exceeded -> auto-snapshot + quarantine + raid lockdown
  if (rateResult.exceeded) {
    logger.warn(`Anti-nuke triggered: ${executorId} in ${guild.id} - ${actionType} (${rateResult.count}/${maxLimit})`);

    // 1. Auto-Snapshot immediately before damage spreads
    await autoIncidentSnapshot(guild, `AntiNuke_${actionType}`);

    // 2. Log incident with timeline session
    await createIncident(guild.id, 'anti_nuke', 'emergency', executorId, {
      action: actionType,
      count: rateResult.count,
      threshold: maxLimit,
      window: windowMs,
    }, 'quarantine', sessionId);

    // 3. Activate raid lockdown
    await activateLockdown(guild, 'raid', `Anti-nuke: ${actionType} threshold exceeded by <@${executorId}>`, 'SYSTEM', 30 * 60 * 1000);

    // 4. Quarantine suspect (reversible, prevents false-positive destruction)
    await executePunishment(guild, executorId, `Anti-nuke: rapid ${actionType} detected (${rateResult.count}/${maxLimit})`, 'anti_nuke', { forceAction: 'quarantine' });

    // 5. Compute Explainable Decision Breakdown and record to security_decisions
    const breakdown = await getRiskScoreBreakdown(guild, executorId, actionType);
    await recordSecurityDecision({
      incidentId: null,
      guildId: guild.id,
      userId: executorId,
      action: 'quarantine',
      reason: `Anti-nuke: rapid ${actionType} detected (${rateResult.count}/${maxLimit} within ${Math.round(windowMs / 1000)}s)`,
      confidenceScore: breakdown.score,
      factors: breakdown.items,
      ruleVersion: '1.0.0',
      engineVersion: '2.0.0',
    }).catch((err) => logger.error('Failed to record security decision', err));

    // 6. Alert staff
    await sendSecurityAlert(guild, 'Anti-Nuke Triggered — Suspect Quarantined', {
      suspect: `<@${executorId}>`,
      action: actionType,
      velocity: `${rateResult.count} actions in ${Math.round(windowMs / 1000)}s (Max: ${maxLimit})`,
      riskScore: `${breakdown.score}/100 (${breakdown.status})`,
      decision: `QUARANTINE (Confidence: ${breakdown.score}%)`,
      status: 'Quarantined & Snapshot Saved — Awaiting staff review',
      incidentSession: sessionId,
    }, { severity: 'emergency' });

    return;
  }

  // Dangerous risk score threshold check
  if (isRiskDangerous(guild.id, executorId)) {
    await executePunishment(guild, executorId, `Dangerous activity: ${actionType}`, 'risk_threshold');
  }
}

/**
 * Process a member join event for anti-raid and policy-driven bot protection.
 */
export async function processMemberJoin(member) {
  const guild = member.guild;

  // 1. Policy-Driven Bot Protection: Detect unauthorized bots
  if (member.user.bot) {
    try {
      // Check if bot is explicitly approved in guild allowlist
      const allowlist = await getBotAllowlist(guild.id);
      const approvedEntry = allowlist.find((b) => b.bot_id === member.id && b.status === 'approved');

      if (!approvedEntry) {
        const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.BotAdd }).catch(() => null);
        const entry = auditLogs?.entries?.first();
        const adderId = entry?.executorId;

        // If added by someone who is not the server owner and not a trusted user
        if (adderId && adderId !== guild.ownerId && !(await isTrustedUser(guild.id, adderId))) {
          logger.warn(`Unapproved bot detected: ${member.user.tag} added by untrusted user ${adderId}`);
          
          await quarantineBot(guild, member, `Unapproved bot added by untrusted user <@${adderId}>`, adderId);
          
          await recordSecurityDecision({
            incidentId: null,
            guildId: guild.id,
            userId: member.id,
            action: 'quarantine',
            reason: `Unapproved bot joined without prior allowlist registration (Invited by <@${adderId}>)`,
            confidenceScore: 90,
            factors: [
              { label: 'Unapproved Bot ID', points: 40 },
              { label: 'Untrusted Inviter', points: 30 },
              { label: 'Elevated Bot Permissions', points: 20 },
            ],
            ruleVersion: '1.0.0',
            engineVersion: '2.0.0',
          }).catch(() => {});

          await sendSecurityAlert(guild, 'Rogue Bot Policy Triggered', {
            bot: `${member.user.tag} (<@${member.id}>)`,
            addedBy: `<@${adderId}>`,
            policy: 'Bot Allowlist / Staff Approval Required',
            status: 'Roles isolated & quarantined automatically',
          }, { severity: 'critical' });
          return;
        }
      }
    } catch (err) {
      logger.error('Rogue bot detection error', err);
    }
  }

  // 2. Track join rate
  const joinResult = rateLimiter.checkGuild(guild.id, 'join', config.security.joinRate.windowMs, config.security.joinRate.maxJoins);

  // Account age check
  const accountAge = Date.now() - member.user.createdTimestamp;
  const quarantineAge = config.security.accountAge.quarantineAge;

  // Calculate raid score
  await calculateRaidScore(guild.id, member.id, member);

  // Raid mode / lockdown check
  const lockdown = await getLockdownStatus(guild.id);
  if (lockdown.state === 'raid' || lockdown.state === 'panic') {
    await quarantineMember(guild, member, `Raid mode active (${lockdown.state})`, 'SYSTEM');
    await createIncident(guild.id, 'raid_join', 'warning', member.id, {
      lockdownState: lockdown.state,
      accountAge: `${Math.floor(accountAge / 3600000)}h`,
    }, 'quarantine');
    return;
  }

  // Very new account (< 1 day): log quarantine suggestion
  if (accountAge < quarantineAge) {
    await createIncident(guild.id, 'new_account', 'info', member.id, {
      accountAge: `${Math.floor(accountAge / 3600000)}h`,
    }, 'quarantine_suggested');
  }

  // Join rate exceeded: potential raid
  if (joinResult.exceeded) {
    logger.warn(`Join rate exceeded in ${guild.id}: ${joinResult.count} joins in ${config.security.joinRate.windowMs}ms`);

    await autoIncidentSnapshot(guild, 'JoinRate_Flood');

    await createIncident(guild.id, 'join_flood', 'critical', null, {
      count: joinResult.count,
      window: config.security.joinRate.windowMs,
    }, 'alert');

    await sendSecurityAlert(guild, 'Join Rate Spike Detected', {
      joins: `${joinResult.count} in ${config.security.joinRate.windowMs / 1000}s`,
    }, { severity: 'critical' });

    // Auto-activate raid mode
    await activateLockdown(guild, 'raid', 'Join rate spike detected', 'SYSTEM', 30 * 60 * 1000);
  }
}

/**
 * Process a message for anti-spam.
 */
export async function processMessage(message) {
  if (message.author.bot || !message.guild) return;

  const guild = message.guild;

  // Skip trusted users
  if (await isTrustedUser(guild.id, message.author.id)) return;

  // Check lockdown state
  const lockdown = await getLockdownStatus(guild.id);
  if (lockdown.state === 'panic' || lockdown.state === 'maintenance') {
    await message.delete().catch(() => {});
    return;
  }

  // Import and run spam analysis
  const { analyzeMessage, checkFloodRate } = await import('./spam-filters.js');

  // Flood check
  const flood = checkFloodRate(guild.id, message.author.id, rateLimiter);
  if (flood.flooded) {
    await message.delete().catch(() => {});
    await executePunishment(guild, message.author.id, 'Message flood detected', 'spam', { forceAction: 'timeout' });
    return;
  }

  // Content analysis
  const analysis = analyzeMessage(message);

  if (analysis.spamScore >= 50) {
    await message.delete().catch(() => {});
    const forceAction = analysis.actions.includes('ban') ? 'quarantine' : 'timeout';
    await executePunishment(guild, message.author.id, `Spam detected: ${analysis.issues.join(', ')}`, 'spam', { forceAction });
    return;
  }

  if (analysis.spamScore >= 25) {
    await message.delete().catch(() => {});
    await createIncident(guild.id, 'spam', 'warning', message.author.id, {
      score: analysis.spamScore,
      issues: analysis.issues,
    }, 'message_deleted');
  }
}

// ── Internal helpers ──

function classifyAuditAction(action) {
  const mapping = {
    [AuditLogEvent.MemberBanAdd]: 'ban',
    [AuditLogEvent.MemberKick]: 'kick',
    [AuditLogEvent.MemberUpdate]: 'timeout',
    [AuditLogEvent.RoleDelete]: 'role_delete',
    [AuditLogEvent.RoleCreate]: 'role_create',
    [AuditLogEvent.RoleUpdate]: 'permission_edit',
    [AuditLogEvent.ChannelDelete]: 'channel_delete',
    [AuditLogEvent.ChannelCreate]: 'channel_create',
    [AuditLogEvent.ChannelUpdate]: 'channel_update',
    [AuditLogEvent.WebhookCreate]: 'webhook_create',
    [AuditLogEvent.WebhookDelete]: 'webhook_delete',
    [AuditLogEvent.GuildUpdate]: 'server_update',
    [AuditLogEvent.MemberRoleUpdate]: 'role_assign',
    [AuditLogEvent.BotAdd]: 'bot_add',
  };
  return mapping[action] || null;
}

function getThreshold(actionType, thresholds) {
  const mapping = {
    ban: thresholds.maxBans,
    kick: thresholds.maxKicks,
    role_delete: thresholds.maxRoleDeletes,
    channel_delete: thresholds.maxChannelDeletes,
    permission_edit: thresholds.maxPermissionEdits,
    webhook_create: 3,
    webhook_delete: 3,
    bot_add: 1,
  };
  return mapping[actionType] || 5;
}

async function checkProtectedResource(guildId, actionType, targetId) {
  if (!targetId) return false;

  const typeMap = {
    role_delete: 'roles',
    channel_delete: 'channels',
    webhook_delete: 'webhooks',
  };

  const type = typeMap[actionType];
  if (!type) return false;

  return isProtected(guildId, type, targetId);
}
