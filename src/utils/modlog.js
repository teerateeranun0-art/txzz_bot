import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from './database.js';
import { baseEmbed } from './embeds.js';
import { mentionUsers, safeText } from './sanitize.js';

export async function sendModLog(guild, { action, moderator, target, reason, extra }) {
  const channelId = getGuildConfig(guild.id, 'modLogChannel');
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;
  if (!channel.permissionsFor(guild.members.me)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) return;

  const embed = baseEmbed(`บันทึกม็อด · ${action}`, extra || null)
    .addFields(
      { name: 'ผู้ถูกดำเนินการ', value: target ? `${target} (\`${target.id ?? target}\`)` : '-', inline: true },
      { name: 'ผู้ดำเนินการ', value: moderator ? `${moderator}` : '-', inline: true },
      { name: 'เหตุผล', value: safeText(reason || 'ไม่ระบุ', 400) },
    );
  await channel.send({ embeds: [embed], allowedMentions: mentionUsers() }).catch(() => {});
}
