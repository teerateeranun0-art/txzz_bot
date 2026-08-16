/**
 * Appeals & Mod Queue — Ban appeals, report review, mod queue management.
 * Handles submission and review of appeals and user reports.
 */
import {
  createBanAppeal,
  getBanAppeals,
  reviewBanAppeal,
  addToModQueue,
  getModQueue,
  resolveModQueueItem,
} from '../utils/database.js';
import { createModCase } from './case-manager.js';
import { sendModLog } from '../utils/modlog.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════
//  BAN APPEALS
// ═══════════════════════════════════════════════════

/**
 * Submit a ban appeal. Can be done via DM command or web.
 */
export async function submitBanAppeal(guildId, userId, reason, caseId) {
  // Check for existing pending appeal
  const existing = await getBanAppeals(guildId, { status: 'pending' });
  const alreadyPending = existing.find((a) => a.userId === userId);
  if (alreadyPending) {
    throw new Error('You already have a pending appeal');
  }

  const appealId = await createBanAppeal(guildId, userId, reason, caseId);

  // Add to mod queue for staff review
  await addToModQueue(guildId, 'appeal', {
    targetId: userId,
    details: { appealId, reason, caseId },
  });

  return appealId;
}

/**
 * Review (approve or deny) a ban appeal.
 */
export async function reviewAppeal(guild, appealId, status, reviewer, reviewNote) {
  if (!['approved', 'denied'].includes(status)) {
    throw new Error('Status must be approved or denied');
  }

  await reviewBanAppeal(guild.id, appealId, status, reviewer.id, reviewNote);

  // If approved, unban the user
  if (status === 'approved') {
    const appeals = await getBanAppeals(guild.id);
    const appeal = appeals.find((a) => a.id === appealId);
    if (appeal) {
      try {
        await guild.members.unban(appeal.userId, `[Appeal Approved] ${reviewNote || ''} by ${reviewer.id}`);
        await createModCase(guild.id, 'unban', appeal.userId, reviewer.id,
          `Ban appeal approved: ${reviewNote || 'No note'}`);
      } catch (err) {
        logger.error(`Failed to unban ${appeal.userId} after appeal approval`, err);
      }
    }
  }

  // Log
  await sendModLog(guild, {
    action: `Appeal ${status}`,
    moderator: reviewer,
    target: { id: 'unknown', toString: () => 'N/A' },
    reason: reviewNote || 'No review note',
    extra: `Appeal #${appealId}`,
  });

  return true;
}

/**
 * Get pending ban appeals for a guild.
 */
export async function getPendingAppeals(guildId) {
  return getBanAppeals(guildId, { status: 'pending' });
}

/**
 * Get all appeals (any status) for a guild.
 */
export async function getAllAppeals(guildId) {
  return getBanAppeals(guildId);
}

// ═══════════════════════════════════════════════════
//  MOD QUEUE
// ═══════════════════════════════════════════════════

/**
 * Add an item to the mod queue (report, automod flag, etc.)
 */
export async function addReport(guildId, reporterId, targetId, reason, details = {}) {
  const itemId = await addToModQueue(guildId, 'report', {
    targetId,
    reporterId,
    details: { reason, ...details },
  });
  return itemId;
}

/**
 * Get pending items in the mod queue.
 */
export async function getPendingQueue(guildId) {
  return getModQueue(guildId, { status: 'pending' });
}

/**
 * Resolve a mod queue item.
 */
export async function resolveQueueItem(guildId, itemId, status, moderator, resolutionNote) {
  if (!['resolved', 'dismissed', 'escalated'].includes(status)) {
    throw new Error('Status must be resolved, dismissed, or escalated');
  }
  await resolveModQueueItem(guildId, itemId, status, moderator.id, resolutionNote);
  return true;
}

/**
 * Get all resolved/dismissed queue items for history.
 */
export async function getQueueHistory(guildId) {
  return getModQueue(guildId, { status: null });
}
