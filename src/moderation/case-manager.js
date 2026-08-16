/**
 * Case Manager — Creates, searches, and exports moderation cases.
 * Every mod action creates a case for auditability.
 */
import {
  createCase,
  getCase,
  getCasesByUser,
  searchCases,
  updateCase,
} from '../utils/database.js';
import { safeText } from '../utils/sanitize.js';

const CASE_TYPE_LABELS = {
  ban: '🔨 Ban',
  unban: '✅ Unban',
  tempban: '⏱️ Temp Ban',
  kick: '👢 Kick',
  timeout: '🔇 Timeout',
  untimeout: '🔊 Remove Timeout',
  warn: '⚠️ Warn',
  clearwarns: '🧹 Clear Warns',
  jail: '🔒 Jail',
  unjail: '🔓 Unjail',
  quarantine: '🦠 Quarantine',
  release: '💊 Release',
  note: '📝 Note',
  role: '🏷️ Role',
  nick: '✏️ Nickname',
  clear: '🗑️ Clear Messages',
  lock: '🔐 Lock',
  unlock: '🔓 Unlock',
  slowmode: '🐢 Slowmode',
  automod: '🤖 AutoMod',
};

/**
 * Create a new moderation case and return its ID.
 */
export async function createModCase(guildId, type, targetId, moderatorId, reason, extra = {}) {
  return createCase(guildId, {
    type,
    targetId,
    moderatorId,
    reason: safeText(reason || '', 400),
    extra,
  });
}

/**
 * Get a case by ID, with formatted display info.
 */
export async function getCaseDetail(guildId, caseId) {
  const c = await getCase(guildId, caseId);
  if (!c) return null;
  return {
    ...c,
    typeLabel: CASE_TYPE_LABELS[c.type] || c.type,
    status: c.active ? 'Active' : 'Overturned',
  };
}

/**
 * Search cases by user.
 */
export async function getUserCases(guildId, userId, options = {}) {
  return getCasesByUser(guildId, userId, options);
}

/**
 * Search all cases with filters.
 */
export async function searchAllCases(guildId, options = {}) {
  return searchCases(guildId, options);
}

/**
 * Update a case (reason, active status, extra data).
 */
export async function updateCaseDetail(guildId, caseId, updates, updatedBy) {
  return updateCase(guildId, caseId, updates, updatedBy);
}

/**
 * Export cases as a formatted text block for a user.
 */
export function exportCasesText(cases) {
  if (!cases.length) return 'No cases found.';
  const lines = cases.map((c, i) => {
    const date = new Date(c.createdAt).toLocaleDateString('en-US');
    const status = c.active ? 'Active' : 'Overturned';
    return `#${i + 1} | Case #${c.id} | ${c.type.toUpperCase()} | ${date} | ${status}\n   Reason: ${c.reason || 'N/A'}`;
  });
  return lines.join('\n\n');
}

/**
 * Get a summary count of case types for a user.
 */
export function summarizeCaseTypes(cases) {
  const summary = {};
  for (const c of cases) {
    summary[c.type] = (summary[c.type] || 0) + 1;
  }
  return summary;
}

export { CASE_TYPE_LABELS };
