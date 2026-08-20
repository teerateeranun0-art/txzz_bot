import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from './database.js';
import { baseEmbed } from './embeds.js';
import { mentionUsers, safeText } from './sanitize.js';

/** Map action names to embed accent colors */
const ACTION_COLORS = {
  kick:           0xe67e22, // orange
  ban:            0xed4245, // red
  unban:          0x57f287, // green
  tempban:        0xf04747, // dark red
  timeout:        0xffa500, // amber
  'remove timeout': 0x57f287,
  warn:           0xfee75c, // yellow
  'clear warns':  0x95a5a6, // grey
  clearwarns:     0x95a5a6,
  clear:          0x7289da, // blurple
  lock:           0xe74c3c, // red
  unlock:         0x2ecc71, // green
  slowmode:       0x3498db, // blue
  nick:           0x9b59b6, // purple
  jail:           0xf39c12, // dark orange
  unjail:         0x2ecc71,
  quarantine:     0xe74c3c,
  release:        0x2ecc71,
  'member verified': 0x2ecc71,
};

/**
 * Send a structured Mod Log embed to the guild's configured log channel.
 *
 * @param {import('discord.js').Guild} guild
 * @param {{ action: string, moderator: any, target: any, reason?: string, extra?: string, caseId?: number|string, color?: number }} opts
 */
export async function sendModLog(guild, { action, moderator, target, reason, extra, caseId, color }) {
  const channelId = getGuildConfig(guild.id, 'modLogChannel');
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;
  if (!channel.permissionsFor(guild.members.me)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) return;

  const resolvedColor = color ?? ACTION_COLORS[action?.toLowerCase()] ?? 0x5865f2;

  const embed = baseEmbed(`📋 ${action}`, extra || null)
    .setColor(resolvedColor)
    .addFields(
      { name: '👤 ผู้ถูกดำเนินการ', value: target ? `${target} (\`${target.id ?? target}\`)` : '-', inline: true },
      { name: '🛡️ ผู้ดำเนินการ', value: moderator ? `${moderator}` : '-', inline: true },
      { name: '📝 เหตุผล', value: safeText(reason || 'ไม่ระบุ', 400) },
    );

  if (caseId != null) {
    embed.addFields({ name: '🗂️ Case ID', value: `#${caseId}`, inline: true });
  }

  await channel.send({ embeds: [embed], allowedMentions: mentionUsers() }).catch(() => {});
}
