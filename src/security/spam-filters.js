/**
 * Spam detection filters for message content analysis.
 * Checks: spam rate, flood, caps, emoji spam, links, invites, scam, attachments, duplicates.
 */

import { config } from '../config.js';

// Known scam/phishing domain patterns (bundled list)
const SCAM_DOMAINS = [
  'discordgift\\.ru',
  'discord\\.gifts?\\.ru',
  'dlscord\\.',
  'discorcl\\.',
  'discordapp\\.gifts?\\.ru',
  'discord\\.nitro.*\\.ru',
  'steamcommunity.*gift',
  'free.*nitro.*discord',
  'discordn\\.com',
  'dlscord\\.com',
  'discocrd\\.com',
  'discordc\\.com',
  'dlscrod\\.com',
  'discorcd\\.com',
  'gift.*discord.*free',
  'nitro.*free.*discord',
  'discord.*claim.*nitro',
];

const SCAM_REGEX = new RegExp(SCAM_DOMAINS.join('|'), 'i');
const INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/gi;
const URL_REGEX = /https?:\/\/[^\s<]+/gi;
const EMOJI_REGEX = /<a?:\w+:\d+>|[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

// Per-user message hash tracking for duplicate detection
const messageHistory = new Map(); // key: guildId:userId, value: string[]

/**
 * Analyze a message for spam indicators.
 * Returns an object with scores and detected issues.
 */
export function analyzeMessage(message, guildConfig) {
  const content = message.content || '';
  const results = {
    spamScore: 0,
    issues: [],
    actions: [],
  };

  const sc = guildConfig || {};
  const secCfg = config.security.antiSpam;

  // 1. Caps check
  if (content.length > 5) {
    const upperCount = (content.match(/[A-Z]/g) || []).length;
    const letterCount = (content.match(/[A-Za-z]/g) || []).length;
    if (letterCount > 0 && upperCount / letterCount > secCfg.capsThreshold) {
      results.spamScore += 15;
      results.issues.push('caps_spam');
    }
  }

  // 2. Emoji spam
  const emojiMatches = content.match(EMOJI_REGEX) || [];
  if (emojiMatches.length > secCfg.emojiLimit) {
    results.spamScore += 20;
    results.issues.push('emoji_spam');
  }

  // 3. Mass mentions
  const mentionCount = message.mentions?.users?.size || 0;
  if (mentionCount > secCfg.mentionLimit) {
    results.spamScore += 25;
    results.issues.push('mass_mention');
  }

  // @everyone / @here detection
  if (content.includes('@everyone') || content.includes('@here')) {
    results.spamScore += 30;
    results.issues.push('everyone_mention');
  }

  // 4. Link detection
  const links = content.match(URL_REGEX) || [];
  if (links.length > 0) {
    results.spamScore += 5;
    results.issues.push('has_links');

    // 5. Invite links
    const invites = content.match(INVITE_REGEX) || [];
    if (invites.length > 0) {
      results.spamScore += 20;
      results.issues.push('invite_spam');
    }
  }

  // 6. Scam/phishing detection
  if (SCAM_REGEX.test(content)) {
    results.spamScore += 50;
    results.issues.push('scam_link');
    results.actions.push('ban');
  }

  // 7. Suspicious attachments
  if (message.attachments?.size > 0) {
    for (const [, attachment] of message.attachments) {
      const name = attachment.name?.toLowerCase() || '';
      if (name.endsWith('.exe') || name.endsWith('.bat') || name.endsWith('.cmd') ||
          name.endsWith('.scr') || name.endsWith('.pif') || name.endsWith('.vbs') ||
          name.endsWith('.js') || name.endsWith('.jar')) {
        results.spamScore += 40;
        results.issues.push('suspicious_attachment');
        results.actions.push('delete');
      }
    }
  }

  // 8. Duplicate message detection
  const historyKey = `${message.guild.id}:${message.author.id}`;
  let history = messageHistory.get(historyKey);
  if (!history) {
    history = [];
    messageHistory.set(historyKey, history);
  }

  const contentHash = simpleHash(content.trim().toLowerCase());
  history.push(contentHash);
  if (history.length > 20) history.shift();

  // Count recent duplicates
  const dupes = history.filter((h) => h === contentHash).length;
  if (dupes >= secCfg.duplicateThreshold) {
    results.spamScore += 15;
    results.issues.push('duplicate_message');
  }

  // 9. Message length check (very long messages can be spam)
  if (content.length > 1500) {
    results.spamScore += 5;
    results.issues.push('long_message');
  }

  return results;
}

/**
 * Check message flood rate for a user.
 */
export function checkFloodRate(guildId, userId, rateLimiter) {
  const floodCfg = config.security.antiFlood;
  const result = rateLimiter.check(guildId, 'message', userId, floodCfg.windowMs, floodCfg.maxMessages);
  return {
    flooded: result.exceeded,
    count: result.count,
    remaining: result.remaining,
  };
}

/**
 * Check message spam rate for a user.
 */
export function checkSpamRate(guildId, userId, rateLimiter) {
  const spamCfg = config.security.antiSpam;
  const result = rateLimiter.check(guildId, 'spam_message', userId, spamCfg.windowMs, spamCfg.maxMessages);
  return {
    spamming: result.exceeded,
    count: result.count,
    remaining: result.remaining,
  };
}

/**
 * Clean up old message history entries periodically.
 */
export function cleanupMessageHistory() {
  // Just clear everything - it'll rebuild on next messages
  messageHistory.clear();
}

// Simple string hash for duplicate detection
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// Periodic cleanup every 5 minutes
setInterval(cleanupMessageHistory, 5 * 60 * 1000);
