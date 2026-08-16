import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, EPHEMERAL } from '../utils/embeds.js';
import { canModerate } from '../utils/permissions.js';
import { tempBan, tempRole, getActiveTempBans, getActiveTempRoles } from '../moderation/temp-punish.js';
import { createModCase } from '../moderation/case-manager.js';
import { sendModLog } from '../utils/modlog.js';
import { parseDuration } from '../utils/duration.js';
import { isSnowflake, safeText } from '../utils/sanitize.js';
import { config } from '../config.js';

export const data = [
  new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('แบนชั่วคราว (auto-unban เมื่อหมดเวลา)')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('ระยะเวลา เช่น 1d, 7d, 30d').setRequired(true).setMaxLength(16))
    .addStringOption(o => o.setName('reason').setDescription('เหตุผล').setMaxLength(config.limits.reason))
    .addIntegerOption(o => o.setName('days').setDescription('ลบข้อความย้อนหลัง (วัน)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('ให้ role ชั่วคราว (auto-remove เมื่อหมดเวลา)')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('ระยะเวลา เช่น 1h, 1d, 7d').setRequired(true).setMaxLength(16))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('tempinfo')
    .setDescription('ดู temp bans/roles ที่ active')
    .addSubcommand(s =>
      s.setName('bans').setDescription('ดู temp bans ทั้งหมด'),
    )
    .addSubcommand(s =>
      s.setName('roles')
        .setDescription('ดู temp roles ของผู้ใช้')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
];

export const meta = {
  tempban: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.BanMembers], botPermissions: [PermissionFlagsBits.BanMembers] },
  temprole: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ManageRoles], botPermissions: [PermissionFlagsBits.ManageRoles] },
  tempinfo: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers] },
};

export async function execute(interaction) {
  const { commandName, guild, member: moderator } = interaction;
  const botMember = guild.members.me;

  try {
    if (commandName === 'tempban') {
      const user = interaction.options.getUser('user');
      const duration = interaction.options.getString('duration');
      const reason = safeText(interaction.options.getString('reason') || 'ไม่ระบุ', config.limits.reason);
      const days = interaction.options.getInteger('days') ?? 0;

      // Check hierarchy
      const target = await guild.members.fetch(user.id).catch(() => null);
      if (target) {
        const check = canModerate(guild, moderator, target, botMember);
        if (!check.ok) return interaction.reply({ embeds: [errorEmbed(check.reason)], ...EPHEMERAL });
      } else if (user.id === interaction.user.id || user.id === guild.ownerId || user.id === botMember.id) {
        return interaction.reply({ embeds: [errorEmbed('ไม่สามารถแบนผู้ใช้นี้ได้')], ...EPHEMERAL });
      }

      await interaction.deferReply();
      const result = await tempBan(guild, user.id, moderator, reason, duration, days);
      return interaction.editReply({
        embeds: [successEmbed(`Temp Ban **${user.username}** เป็นเวลา **${duration}**\nเหตุผล: ${reason}\nCase #${result.caseId} | Expires: <t:${Math.floor(result.expiresAt / 1000)}:R>`)],
      });
    }

    if (commandName === 'temprole') {
      const target = interaction.options.getMember('user');
      const role = interaction.options.getRole('role');
      const duration = interaction.options.getString('duration');

      const check = canModerate(guild, moderator, target, botMember);
      if (!check.ok) return interaction.reply({ embeds: [errorEmbed(check.reason)], ...EPHEMERAL });

      await interaction.deferReply();
      const result = await tempRole(guild, target, role.id, moderator, duration);
      return interaction.editReply({
        embeds: [successEmbed(`ให้ role **${role.name}** แก่ **${target.user.username}** เป็นเวลา **${duration}**\nCase #${result.caseId} | Expires: <t:${Math.floor(result.expiresAt / 1000)}:R>`)],
      });
    }

    if (commandName === 'tempinfo') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'bans') {
        const bans = await getActiveTempBans(guild.id);
        if (!bans.length) return interaction.reply({ embeds: [infoEmbed('Temp Bans', 'ไม่มี temp bans ที่ active')] });

        const list = bans.map((b) =>
          `<@${b.userId}> — expires <t:${Math.floor(b.expiresAt / 1000)}:R> | Reason: ${safeText(b.reason, 60)}`
        ).join('\n');
        return interaction.reply({ embeds: [infoEmbed(`Active Temp Bans (${bans.length})`, list)] });
      }

      if (sub === 'roles') {
        const user = interaction.options.getUser('user');
        const roles = await getActiveTempRoles(guild.id, user.id);
        if (!roles.length) return interaction.reply({ embeds: [infoEmbed('Temp Roles', `${user.username} ไม่มี temp roles`)] });

        const list = roles.map((r) =>
          `<@&${r.roleId}> — expires <t:${Math.floor(r.expiresAt / 1000)}:R>`
        ).join('\n');
        return interaction.reply({ embeds: [infoEmbed(`Temp Roles — ${user.username}`, list)] });
      }
    }
  } catch (err) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    } else {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
  }
}
