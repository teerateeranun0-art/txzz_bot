/**
 * Scoring engine: calculates raid, risk, and trust scores with Itemized Breakdown.
 * Scores range from 0-100.
 * - Itemized Risk Breakdown: Exact reason and point contribution
 * - Trust Score: Account age, guild tenure, roles, infractions
 * - Raid Score: Join velocity, flood patterns, suspicious metadata
 */

import { config } from '../config.js';
import { updateUserScores, getUserScores, isTrustedUser } from '../utils/database.js';
import { rateLimiter } from './rate-limiter.js';

/**
 * Calculate comprehensive Risk Score with Itemized Breakdown.
 */
export async function getRiskScoreBreakdown(guild, userId, actionType = null) {
  const guildId = guild.id;
  const items = [];
  let totalRisk = 0;

  // 1. Check if user is trusted or server owner
  const isOwner = guild.ownerId === userId;
  const trusted = await isTrustedUser(guildId, userId);

  if (isOwner) {
    return {
      score: 0,
      status: 'SAFE (OWNER)',
      action: 'NONE',
      items: [{ label: 'Server Owner Immunity', points: 0, type: 'safe' }],
    };
  }

  if (trusted) {
    items.push({ label: 'Trusted Member Whitelist', points: -30, type: 'bonus' });
    totalRisk -= 30;
  }

  // 2. Member metadata & account age
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    const accountAgeMs = Date.now() - member.user.createdTimestamp;
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (accountAgeMs < oneDayMs) {
      items.push({ label: 'New Account (< 24 Hours)', points: 25, type: 'risk' });
      totalRisk += 25;
    } else if (accountAgeMs < sevenDaysMs) {
      items.push({ label: 'Recent Account (< 7 Days)', points: 15, type: 'risk' });
      totalRisk += 15;
    } else {
      items.push({ label: 'Matured Discord Account (> 7 Days)', points: -10, type: 'bonus' });
      totalRisk -= 10;
    }

    const joinAgeMs = Date.now() - member.joinedTimestamp;
    if (joinAgeMs < 10 * 60 * 1000) {
      items.push({ label: 'Just Joined Server (< 10 Minutes)', points: 20, type: 'risk' });
      totalRisk += 20;
    }
  } else {
    items.push({ label: 'Untrusted/Unknown User (Not In Member Cache)', points: 20, type: 'risk' });
    totalRisk += 20;
  }

  // 3. Action Type Weight
  const actionWeights = {
    ban: { label: 'Rapid Member Ban Action', points: 30 },
    kick: { label: 'Rapid Member Kick Action', points: 25 },
    role_delete: { label: 'Role Deletion Attempt', points: 35 },
    channel_delete: { label: 'Channel Deletion Attempt', points: 35 },
    permission_edit: { label: 'Mass Permission Escalation', points: 30 },
    webhook_create: { label: 'Unauthorized Webhook Creation', points: 20 },
    webhook_delete: { label: 'Webhook Deletion', points: 20 },
    bot_add: { label: 'Unauthorized Bot Addition', points: 40 },
    timeout: { label: 'Member Timeout Action', points: 15 },
  };

  if (actionType && actionWeights[actionType]) {
    const act = actionWeights[actionType];
    items.push({ label: act.label, points: act.points, type: 'risk' });
    totalRisk += act.points;
  }

  // 4. Rate limiter action velocity
  const recentActionCount = rateLimiter.peek(guildId, actionType || 'generic', userId, 30_000);
  if (recentActionCount >= 3) {
    const velocityPoints = recentActionCount * 10;
    items.push({ label: `High Action Velocity (${recentActionCount} actions / 30s)`, points: velocityPoints, type: 'risk' });
    totalRisk += velocityPoints;
  }

  // Clamp final score
  const finalScore = Math.min(100, Math.max(0, totalRisk));
  let status = 'LOW RISK';
  let recommendedAction = 'MONITOR';

  if (finalScore >= 80) {
    status = 'CRITICAL RISK';
    recommendedAction = 'QUARANTINE / LOCKDOWN';
  } else if (finalScore >= 60) {
    status = 'HIGH RISK';
    recommendedAction = 'QUARANTINE';
  } else if (finalScore >= 40) {
    status = 'MEDIUM RISK';
    recommendedAction = 'TIMEOUT / REVIEW';
  }

  updateUserScores(guildId, userId, { riskScore: finalScore });

  return {
    score: finalScore,
    status,
    action: recommendedAction,
    items,
  };
}

/**
 * Calculate raid score for a user.
 */
export async function calculateRaidScore(guildId, userId, member) {
  const weights = config.security.scoring.weights;
  let score = 0;

  if (member) {
    const accountAge = Date.now() - member.user.createdTimestamp;
    const minAge = config.security.accountAge.minAgeMs;
    if (accountAge < minAge) {
      const ageRatio = 1 - accountAge / minAge;
      score += ageRatio * weights.accountAge;
    }
  }

  const joinCount = rateLimiter.peek(guildId, 'join', '__guild__', config.security.joinRate.windowMs);
  const maxJoins = config.security.joinRate.maxJoins;
  if (joinCount > maxJoins * 0.5) {
    score += Math.min(1, joinCount / maxJoins) * weights.joinRate;
  }

  const msgCount = rateLimiter.peek(guildId, 'message', userId, config.security.antiSpam.windowMs);
  const maxMsgs = config.security.antiSpam.maxMessages;
  if (msgCount > maxMsgs * 0.5) {
    score += Math.min(1, msgCount / maxMsgs) * weights.messageFlood;
  }

  const trusted = await isTrustedUser(guildId, userId);
  if (trusted) {
    score = Math.max(0, score - 30);
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));
  updateUserScores(guildId, userId, { raidScore: finalScore });
  return finalScore;
}

/**
 * Calculate trust score based on age, time in server, and roles.
 */
export async function calculateTrustScore(guildId, userId, member) {
  let score = 50;

  if (member) {
    const accountAge = Date.now() - member.user.createdTimestamp;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (accountAge > thirtyDays) {
      score += Math.min(15, Math.floor(accountAge / thirtyDays) * 2);
    }

    const serverTime = Date.now() - member.joinedTimestamp;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (serverTime > sevenDays) {
      score += Math.min(15, Math.floor(serverTime / sevenDays) * 3);
    }

    const roleCount = member.roles.cache.size - 1;
    score += Math.min(10, roleCount * 2);
  }

  const trusted = await isTrustedUser(guildId, userId);
  if (trusted) {
    score += 20;
  }

  const current = getUserScores(guildId, userId);
  score -= Math.floor(current.raidScore * 0.3);
  score -= Math.floor(current.riskScore * 0.2);

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));
  updateUserScores(guildId, userId, { trustScore: finalScore });
  return finalScore;
}

export function calculateRiskScore(guildId, userId, actionType) {
  const current = getUserScores(guildId, userId);
  const add = actionType === 'ban' || actionType === 'role_delete' || actionType === 'channel_delete' ? 25 : 10;
  const updated = Math.min(100, current.riskScore + add);
  updateUserScores(guildId, userId, { riskScore: updated });
  return updated;
}

export function isRiskDangerous(guildId, userId) {
  const scores = getUserScores(guildId, userId);
  return scores.riskScore >= config.security.scoring.riskThreshold;
}
