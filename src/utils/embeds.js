import { EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { truncate } from './sanitize.js';

export const EPHEMERAL = { flags: MessageFlags.Ephemeral };

/**
 * Base embed with optional title and description.
 * @param {string|null} title
 * @param {string|null} description
 */
export function baseEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTimestamp();
  if (title) embed.setTitle(truncate(title, 256));
  if (description) embed.setDescription(truncate(description, 4096));
  return embed;
}

/**
 * Success embed with optional custom title (default: 'สำเร็จ').
 * @param {string} description
 * @param {string} [title]
 */
export function successEmbed(description, title = 'สำเร็จ') {
  return baseEmbed(title, description).setColor(config.colors.success);
}

/**
 * Error embed with optional custom title (default: 'ผิดพลาด').
 * @param {string} description
 * @param {string} [title]
 */
export function errorEmbed(description, title = 'ผิดพลาด') {
  return baseEmbed(title, description).setColor(config.colors.error);
}

/**
 * Info embed.
 * @param {string} title
 * @param {string|null} description
 */
export function infoEmbed(title, description) {
  return baseEmbed(title, description).setColor(config.colors.info);
}

/**
 * Warning embed with optional custom title (default: 'คำเตือน').
 * @param {string} description
 * @param {string} [title]
 */
export function warnEmbed(description, title = 'คำเตือน') {
  return baseEmbed(title, description).setColor(config.colors.warning);
}

/**
 * Returns a spread-ready object that makes a reply ephemeral.
 */
export function ephemeralReply(payload) {
  return { ...payload, ...EPHEMERAL };
}

/**
 * Build an embed for a list of items with a consistent empty-state message.
 * @param {string} title
 * @param {string[]} items  — Array of display strings
 * @param {string} [emptyMsg] — Shown when items is empty
 */
export function listEmbed(title, items, emptyMsg = 'ไม่มีรายการ') {
  const description = items?.length ? items.join('\n') : emptyMsg;
  return baseEmbed(title, description).setColor(config.colors.info);
}

/**
 * Split items into pages and return an embed for the requested page.
 * @param {string} title
 * @param {string[]} items
 * @param {number} [page=1]      — 1-indexed
 * @param {number} [pageSize=10]
 * @param {string} [emptyMsg]
 */
export function paginatedEmbed(title, items, page = 1, pageSize = 10, emptyMsg = 'ไม่มีรายการ') {
  if (!items?.length) {
    return { embed: baseEmbed(title, emptyMsg).setColor(config.colors.info), totalPages: 1 };
  }
  const totalPages = Math.ceil(items.length / pageSize);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const slice = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  const description = slice.join('\n');
  const embed = baseEmbed(title, description)
    .setColor(config.colors.info)
    .setFooter({ text: `หน้า ${safePage} / ${totalPages} (${items.length} รายการ)` });
  return { embed, totalPages, currentPage: safePage };
}
