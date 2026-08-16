/**
 * AutoMod Engine — Word/regex/link/domain filtering with configurable actions.
 * Runs BEFORE the security anti-spam engine in the message pipeline.
 * Checks guild-specific filter lists and applies delete/warn/timeout/kick/ban.
 */
import { PermissionFlagsBits } from 'discord.js';
import {
  getAutomodFilters,
  getSecurityConfig,
  addWarning,
  addModNote,
} from '../utils/database.js';
import { createModCase } from './case-manager.js';
import { sendModLog } from '../utils/modlog.js';
import { parseDuration } from '../utils/duration.js';
import { logger } from '../utils/logger.js';
import { safeText } from '../utils/sanitize.js';

// Cache filters in memory (guild_id -> { filters, lastLoad })
const filterCache = new Map();
const CACHE_TTL = 30_000; // 30 seconds

async function getFilters(guildId) {
  const cached = filterCache.get(guildId);
  if (cached && Date.now() - cached.lastLoad < CACHE_TTL) return cached.filters;

  const rows = await getAutomodFilters(guildId);
  const filters = {
    words: rows.filter((r) => r.type === 'word'),
    regexes: rows.filter((r) => r.type === 'regex'),
    domainWhitelist: rows.filter((r) => r.type === 'domain_whitelist').map((r) => r.pattern.toLowerCase()),
    domainBlacklist: rows.filter((r) => r.type === 'domain_blacklist').map((r) => r.pattern.toLowerCase()),
    roleWhitelist: rows.filter((r) => r.type === 'role_whitelist').map((r) => r.pattern),
    channelWhitelist: rows.filter((r) => r.type === 'channel_whitelist').map((r) => r.pattern),
  };
  filterCache.set(guildId, { filters, lastLoad: Date.now() });
  return filters;
}

/** Invalidate filter cache for a guild (call after adding/removing filters). */
export function invalidateFilterCache(guildId) {
  filterCache.delete(guildId);
}

/**
 * Check if a user is exempt from AutoMod (staff, bots, whitelisted roles).
 */
function isExempt(member, filters) {
  if (member.user.bot) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  // Check whitelisted roles
  for (const roleId of filters.roleWhitelist) {
    if (member.roles.cache.has(roleId)) return true;
  }
  return false;
}

/**
 * Check if a channel is whitelisted (exempt from filters).
 */
function isChannelExempt(channelId, filters) {
  return filters.channelWhitelist.includes(channelId);
}

/**
 * Extract all URLs from a message.
 */
function extractUrls(content) {
  const urlRegex = /https?:\/\/[^\s<]+/gi;
  return (content.match(urlRegex) || []).map((url) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Run the full AutoMod filter pipeline on a message.
 * Returns { action: null | 'delete' | 'warn' | 'timeout' | 'kick' | 'ban', reason: string }
 */
export async function checkMessage(message) {
  const guild = message.guild;
  if (!guild || message.author.bot) return { action: null };

  const member = message.member;
  if (!member) return { action: null };

  const filters = await getFilters(guild.id);

  // Exemption checks
  if (isExempt(member, filters)) return { action: null };
  if (isChannelExempt(message.channel.id, filters)) return { action: null };

  const content = message.content || '';
  const lowerContent = content.toLowerCase();
  let highestAction = null;
  const matchedReasons = [];

  // ── Word filters ──
  for (const filter of filters.words) {
    const pattern = filter.case_sensitive ? filter.pattern : filter.pattern.toLowerCase();
    const check = filter.case_sensitive ? content : lowerContent;
    if (check.includes(pattern)) {
      matchedReasons.push(`word: "${filter.pattern}"`);
      highestAction = pickHigherAction(highestAction, filter.action);
    }
  }

  // ── Regex filters ──
  for (const filter of filters.regexes) {
    try {
      const flags = filter.case_sensitive ? '' : 'i';
      const regex = new RegExp(filter.pattern, flags);
      if (regex.test(content)) {
        matchedReasons.push(`regex: /${filter.pattern}/${flags}`);
        highestAction = pickHigherAction(highestAction, filter.action);
      }
    } catch {
      // Invalid regex, skip
    }
  }

  // ── Domain blacklist ──
  if (filters.domainBlacklist.length) {
    const domains = extractUrls(content);
    for (const domain of domains) {
      if (filters.domainBlacklist.some((d) => domain === d || domain.endsWith('.' + d))) {
        matchedReasons.push(`blocked domain: ${domain}`);
        highestAction = pickHigherAction(highestAction, 'delete');
      }
    }
  }

  // ── Domain whitelist (if whitelist exists, block all other domains) ──
  if (filters.domainWhitelist.length) {
    const domains = extractUrls(content);
    for (const domain of domains) {
      const allowed = filters.domainWhitelist.some((d) => domain === d || domain.endsWith('.' + d));
      if (!allowed) {
        matchedReasons.push(`unlisted domain: ${domain}`);
        highestAction = pickHigherAction(highestAction, 'delete');
      }
    }
  }

  if (!highestAction || !matchedReasons.length) return { action: null };

  return {
    action: highestAction,
    reason: matchedReasons.join('; '),
  };
}

/**
 * Execute the AutoMod action on a message.
 */
export async function executeAutoModAction(message, result) {
  const guild = message.guild;
  const member = message.member;
  const botMember = guild.members.me;

  try {
    // Always delete the message first
    if (message.deletable) {
      await message.delete().catch(() => {});
    }

    // Notify the user
    await message.channel.send({
      content: `${message.author} Your message was removed: ${safeText(result.reason, 200)}`,
    }).then((m) => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});

    switch (result.action) {
      case 'delete':
        break; // Already deleted

      case 'warn': {
        await addWarning(guild.id, message.author.id, botMember.id, `[AutoMod] ${result.reason}`);
        await createModCase(guild.id, 'automod', message.author.id, botMember.id, `AutoMod warn: ${result.reason}`);
        break;
      }

      case 'timeout': {
        if (member?.moderateable) {
          await member.timeout(300_000, `[AutoMod] ${result.reason}`); // 5 min
        }
        await createModCase(guild.id, 'automod', message.author.id, botMember.id, `AutoMod timeout: ${result.reason}`);
        break;
      }

      case 'kick': {
        if (member?.kickable) {
          await member.kick(`[AutoMod] ${result.reason}`);
        }
        await createModCase(guild.id, 'automod', message.author.id, botMember.id, `AutoMod kick: ${result.reason}`);
        break;
      }

      case 'ban': {
        if (member?.bannable) {
          await guild.members.ban(message.author.id, {
            reason: `[AutoMod] ${result.reason}`,
            deleteMessageSeconds: 86400,
          });
        }
        await createModCase(guild.id, 'automod', message.author.id, botMember.id, `AutoMod ban: ${result.reason}`);
        break;
      }
    }

    // Log to mod log
    await sendModLog(guild, {
      action: `AutoMod ${result.action}`,
      moderator: botMember,
      target: message.author,
      reason: result.reason,
      extra: `Channel: #${message.channel.name}`,
    });

    // Add mod note
    await addModNote(guild.id, message.author.id, botMember.id,
      `[AutoMod] ${result.action}: ${result.reason} — Content: ${safeText(message.content || '', 500)}`,
      'evidence',
    ).catch(() => {});
  } catch (err) {
    logger.error('AutoMod action execution failed', err);
  }
}

// Action severity hierarchy
const ACTION_PRIORITY = { delete: 1, warn: 2, timeout: 3, kick: 4, ban: 5 };

function pickHigherAction(current, incoming) {
  if (!current) return incoming;
  return (ACTION_PRIORITY[incoming] || 0) > (ACTION_PRIORITY[current] || 0) ? incoming : current;
}
