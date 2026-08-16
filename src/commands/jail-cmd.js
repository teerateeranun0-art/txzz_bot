import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, EPHEMERAL } from '../utils/embeds.js';
import { canModerate } from '../utils/permissions.js';
import { jailMember, unjailMember, getJailedList } from '../moderation/jail.js';
import { safeText } from '../utils/sanitize.js';
import { config } from '../config.js';

export const data = [
  new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Jail (กักบริเวณ) สมาชิก — แยกเข้าช่องส่วนตัว')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('เหตุผล').setMaxLength(config.limits.reason))
    .addStringOption(o => o.setName('duration').setDescription('ระยะเวลา เช่น 1h, 1d').setMaxLength(16))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('unjail')
    .setDescription('ปลด Jail — คืน roles และลบช่อง jail')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('jail-list')
    .setDescription('ดูรายชื่อที่ถูก Jail')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
];

export const meta = {
  jail: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ModerateMembers], botPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels] },
  unjail: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers], botPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels] },
  'jail-list': { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers] },
};

export async function execute(interaction) {
  const { commandName, guild, member: moderator } = interaction;
  const botMember = guild.members.me;

  try {
    if (commandName === 'jail') {
      const target = interaction.options.getMember('user');
      const reason = safeText(interaction.options.getString('reason') || 'ไม่ระบุ', config.limits.reason);
      const duration = interaction.options.getString('duration');

      const check = canModerate(guild, moderator, target, botMember);
      if (!check.ok) return interaction.reply({ embeds: [errorEmbed(check.reason)], ...EPHEMERAL });

      await interaction.deferReply();
      const result = await jailMember(guild, target, moderator, reason, duration);
      return interaction.editReply({
        embeds: [successEmbed(
          `Jail **${target.user.username}** แล้ว\n` +
          `เหตุผล: ${reason}\n` +
          `Case #${result.caseId}\n` +
          `${result.channelId ? `Channel: <#${result.channelId}>\n` : ''}` +
          `${result.expiresAt ? `Expires: <t:${Math.floor(result.expiresAt / 1000)}:R>` : 'ไม่มีกำหนดเวลา'}`
        )],
      });
    }

    if (commandName === 'unjail') {
      const user = interaction.options.getUser('user');
      await interaction.deferReply();
      const result = await unjailMember(guild, user.id, moderator);
      return interaction.editReply({
        embeds: [successEmbed(
          `ปลด Jail **${user.username}** แล้ว\n` +
          `Roles restored: ${result.previousRoles.length}\n` +
          `Previous reason: ${safeText(result.reason, 100)}`
        )],
      });
    }

    if (commandName === 'jail-list') {
      const jailed = await getJailedList(guild.id);
      if (!jailed.length) return interaction.reply({ embeds: [infoEmbed('Jail', 'ไม่มีใครถูก Jail')] });

      const list = jailed.map((j) => {
        const expires = j.expiresAt ? `<t:${Math.floor(j.expiresAt / 1000)}:R>` : 'ไม่มีกำหนด';
        return `<@${j.userId}> — ${safeText(j.reason, 50)} | ${expires}`;
      }).join('\n');
      return interaction.reply({ embeds: [infoEmbed(`Jailed Users (${jailed.length})`, list)] });
    }
  } catch (err) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    } else {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
  }
}
