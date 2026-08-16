import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { successEmbed, errorEmbed, warnEmbed, infoEmbed, EPHEMERAL } from '../utils/embeds.js';
import { canModerate } from '../utils/permissions.js';
import { addWarning, getWarnings, clearWarnings } from '../utils/database.js';
import { parseDuration } from '../utils/duration.js';
import { isSnowflake, safeText, userFacingError } from '../utils/sanitize.js';
import { sendModLog } from '../utils/modlog.js';
import { config } from '../config.js';
import { createModCase } from '../moderation/case-manager.js';
import { issueWarning } from '../moderation/warnings.js';

const reasonOption = o => o.setName('reason').setDescription('เหตุผล').setMaxLength(config.limits.reason);

export const data = [
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('เตะสมาชิกออกจากเซิร์ฟเวอร์')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .addStringOption(reasonOption)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('แบนสมาชิก')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .addStringOption(reasonOption)
    .addIntegerOption(o => o.setName('days').setDescription('ลบข้อความย้อนหลัง (วัน)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('ปลดแบนผู้ใช้')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true).setMinLength(17).setMaxLength(20))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Mute ชั่วคราว (timeout)')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('ระยะเวลา เช่น 10m, 1h, 1d').setRequired(true).setMaxLength(16))
    .addStringOption(reasonOption)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('ยกเลิก timeout')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('ลบข้อความ')
    .addIntegerOption(o => o.setName('amount').setDescription('จำนวน (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('ลบเฉพาะของผู้ใช้'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('เตือนสมาชิก')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .addStringOption(o => reasonOption(o).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('ดูประวัติการเตือน')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('ล้างการเตือนทั้งหมด')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('ตั้ง slowmode ช่อง')
    .addIntegerOption(o => o.setName('seconds').setDescription('วินาที (0 = ปิด)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('ล็อคช่อง (ห้ามส่งข้อความ)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('ปลดล็อคช่อง')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('nick')
    .setDescription('เปลี่ยนชื่อเล่น')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .addStringOption(o => o.setName('name').setDescription('ชื่อใหม่').setRequired(true).setMaxLength(32))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .setDMPermission(false),
];

export const meta = {
  kick: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.KickMembers], botPermissions: [PermissionFlagsBits.KickMembers] },
  ban: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.BanMembers], botPermissions: [PermissionFlagsBits.BanMembers] },
  unban: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.BanMembers], botPermissions: [PermissionFlagsBits.BanMembers] },
  timeout: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ModerateMembers], botPermissions: [PermissionFlagsBits.ModerateMembers] },
  untimeout: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers], botPermissions: [PermissionFlagsBits.ModerateMembers] },
  clear: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ManageMessages], botPermissions: [PermissionFlagsBits.ManageMessages] },
  warn: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers] },
  warnings: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers] },
  clearwarns: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ModerateMembers] },
  slowmode: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ManageChannels], botPermissions: [PermissionFlagsBits.ManageChannels] },
  lock: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ManageChannels], botPermissions: [PermissionFlagsBits.ManageChannels] },
  unlock: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ManageChannels], botPermissions: [PermissionFlagsBits.ManageChannels] },
  nick: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ManageNicknames], botPermissions: [PermissionFlagsBits.ManageNicknames] },
};

async function fail(interaction, reason) {
  return interaction.reply({ embeds: [errorEmbed(reason)], ...EPHEMERAL });
}

export async function execute(interaction) {
  const { commandName, guild, member: moderator } = interaction;
  const botMember = guild.members.me;

  try {
    if (commandName === 'kick') {
      const target = interaction.options.getMember('user');
      const reason = safeText(interaction.options.getString('reason') || 'ไม่ระบุ', config.limits.reason);
      const check = canModerate(guild, moderator, target, botMember);
      if (!check.ok) return fail(interaction, check.reason);
      await target.kick(reason);
      const caseId = await createModCase(guild.id, 'kick', target.id, moderator.id, reason);
      await interaction.reply({ embeds: [successEmbed(`เตะ **${target.user.username}** แล้ว (Case #${caseId})\nเหตุผล: ${reason}`)] });
      await sendModLog(guild, { action: 'Kick', moderator, target: target.user, reason });
      return;
    }

    if (commandName === 'ban') {
      const user = interaction.options.getUser('user');
      const reason = safeText(interaction.options.getString('reason') || 'ไม่ระบุ', config.limits.reason);
      const days = interaction.options.getInteger('days') ?? 0;
      const target = await guild.members.fetch(user.id).catch(() => null);
      if (target) {
        const check = canModerate(guild, moderator, target, botMember);
        if (!check.ok) return fail(interaction, check.reason);
      } else if (user.id === interaction.user.id || user.id === guild.ownerId || user.id === botMember.id) {
        return fail(interaction, 'ไม่สามารถแบนผู้ใช้นี้ได้');
      }
      await guild.members.ban(user.id, { reason, deleteMessageSeconds: days * 86400 });
      const caseId = await createModCase(guild.id, 'ban', user.id, moderator.id, reason, { deleteDays: days });
      await interaction.reply({ embeds: [successEmbed(`แบน **${user.username}** แล้ว (Case #${caseId})\nเหตุผล: ${reason}`)] });
      await sendModLog(guild, { action: 'Ban', moderator, target: user, reason });
      return;
    }

    if (commandName === 'unban') {
      const userId = interaction.options.getString('userid').trim();
      if (!isSnowflake(userId)) return fail(interaction, 'User ID ไม่ถูกต้อง');
      await guild.members.unban(userId, `ปลดแบนโดย ${interaction.user.id}`);
      await createModCase(guild.id, 'unban', userId, moderator.id, 'ปลดแบน');
      await interaction.reply({ embeds: [successEmbed(`ปลดแบน \`${userId}\` แล้ว`)] });
      await sendModLog(guild, { action: 'Unban', moderator, target: { id: userId, toString: () => `\`${userId}\`` }, reason: 'ปลดแบน' });
      return;
    }

    if (commandName === 'timeout') {
      const target = interaction.options.getMember('user');
      const duration = interaction.options.getString('duration');
      const reason = safeText(interaction.options.getString('reason') || 'ไม่ระบุ', config.limits.reason);
      const msDuration = parseDuration(duration, { min: 5000, max: 28 * 24 * 60 * 60 * 1000 });
      if (!msDuration) return fail(interaction, 'ระยะเวลาไม่ถูกต้อง (5 วินาที - 28 วัน) เช่น 10m, 1h, 1d');
      const check = canModerate(guild, moderator, target, botMember);
      if (!check.ok) return fail(interaction, check.reason);
      await target.timeout(msDuration, reason);
      const caseId = await createModCase(guild.id, 'timeout', target.id, moderator.id, reason, { duration });
      await interaction.reply({ embeds: [successEmbed(`Timeout **${target.user.username}** เป็นเวลา **${duration}** (Case #${caseId})\nเหตุผล: ${reason}`)] });
      await sendModLog(guild, { action: 'Timeout', moderator, target: target.user, reason, extra: `ระยะเวลา: ${duration}` });
      return;
    }

    if (commandName === 'untimeout') {
      const target = interaction.options.getMember('user');
      const check = canModerate(guild, moderator, target, botMember);
      if (!check.ok) return fail(interaction, check.reason);
      await target.timeout(null);
      await createModCase(guild.id, 'untimeout', target.id, moderator.id, 'ยกเลิก timeout');
      await interaction.reply({ embeds: [successEmbed(`ยกเลิก timeout **${target.user.username}** แล้ว`)] });
      await sendModLog(guild, { action: 'Remove Timeout', moderator, target: target.user, reason: 'ยกเลิก timeout' });
      return;
    }

    if (commandName === 'clear') {
      if (![ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread].includes(interaction.channel.type)) {
        return fail(interaction, 'ลบข้อความได้เฉพาะช่องข้อความ');
      }
      const amount = interaction.options.getInteger('amount');
      const filterUser = interaction.options.getUser('user');
      await interaction.deferReply({ ...EPHEMERAL });
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      let toDelete = [...messages.values()].filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
      if (filterUser) toDelete = toDelete.filter(m => m.author.id === filterUser.id);
      toDelete = toDelete.slice(0, amount);
      if (!toDelete.length) {
        return interaction.editReply({ embeds: [errorEmbed('ไม่มีข้อความที่ลบได้ (ข้อความเก่ากว่า 14 วันลบแบบกลุ่มไม่ได้)')] });
      }
      await interaction.channel.bulkDelete(toDelete, true);
      await interaction.editReply({ embeds: [successEmbed(`ลบ **${toDelete.length}** ข้อความแล้ว`)] });
      await sendModLog(guild, {
        action: 'Clear',
        moderator,
        target: filterUser || { id: interaction.channel.id, toString: () => `${interaction.channel}` },
        reason: `ลบ ${toDelete.length} ข้อความใน ${interaction.channel.name}`,
      });
      return;
    }

    if (commandName === 'warn') {
      const user = interaction.options.getUser('user');
      if (user.id === interaction.user.id) return fail(interaction, 'เตือนตัวเองไม่ได้');
      if (user.bot) return fail(interaction, 'เตือนบอทไม่ได้');
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) {
        const check = canModerate(guild, moderator, member, botMember);
        if (!check.ok) return fail(interaction, check.reason);
      }
      const reason = safeText(interaction.options.getString('reason'), config.limits.reason);
      const result = await issueWarning(guild, user, moderator, reason);
      const autoMsg = result.autoAction ? `\n⚠️ Auto-Punish: **${result.autoAction}** (${result.totalPoints} points)` : '';
      await interaction.reply({ embeds: [warnEmbed(`เตือน **${user.username}** (Case #${result.caseId})\nเหตุผล: ${reason}\nTotal warning points: ${result.totalPoints}${autoMsg}`)] });
      return;
    }

    if (commandName === 'warnings') {
      const user = interaction.options.getUser('user');
      const warns = await getWarnings(guild.id, user.id);
      if (!warns.length) {
        return interaction.reply({ embeds: [infoEmbed('การเตือน', `**${user.username}** ไม่มีประวัติการเตือน`)] });
      }
      const activePoints = warns.filter((w) => !w.expired && (!w.expiresAt || w.expiresAt > Date.now())).reduce((s, w) => s + w.points, 0);
      const list = warns.slice(-15).map(w => {
        const status = w.expired ? ' ~~expired~~' : (w.expiresAt && w.expiresAt < Date.now()) ? ' ~~expired~~' : '';
        return `#${w.id} [${w.points}pt]${status} — ${safeText(w.reason, 60)} (<t:${Math.floor(w.date / 1000)}:R>)`;
      }).join('\n');
      await interaction.reply({ embeds: [infoEmbed(`การเตือน - ${user.username}`, list).setFooter({ text: `Active points: ${activePoints}` })] });
      return;
    }

    if (commandName === 'clearwarns') {
      const user = interaction.options.getUser('user');
      await clearWarnings(guild.id, user.id);
      await createModCase(guild.id, 'clearwarns', user.id, moderator.id, 'ล้างประวัติการเตือน');
      await interaction.reply({ embeds: [successEmbed(`ล้างการเตือนของ **${user.username}** แล้ว`)] });
      await sendModLog(guild, { action: 'Clear Warns', moderator, target: user, reason: 'ล้างประวัติการเตือน' });
      return;
    }

    if (commandName === 'slowmode') {
      const seconds = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(seconds, `โดย ${interaction.user.id}`);
      const msg = seconds === 0 ? 'ปิด slowmode แล้ว' : `ตั้ง slowmode เป็น **${seconds}** วินาที`;
      await interaction.reply({ embeds: [successEmbed(msg)] });
      return;
    }

    if (commandName === 'lock' || commandName === 'unlock') {
      if (interaction.channel.type !== ChannelType.GuildText && interaction.channel.type !== ChannelType.GuildAnnouncement) {
        return fail(interaction, 'ใช้ได้เฉพาะช่องข้อความของเซิร์ฟเวอร์');
      }
      const locked = commandName === 'lock';
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: locked ? false : null,
      }, { reason: `${commandName} โดย ${interaction.user.id}` });
      await interaction.reply({
        embeds: [successEmbed(locked ? `ล็อค ${interaction.channel} แล้ว` : `ปลดล็อค ${interaction.channel} แล้ว`)],
      });
      return;
    }

    if (commandName === 'nick') {
      const target = interaction.options.getMember('user');
      const name = interaction.options.getString('name').trim().slice(0, config.limits.nickname);
      if (!name) return fail(interaction, 'ชื่อว่างไม่ได้');
      const check = canModerate(guild, moderator, target, botMember);
      if (!check.ok) return fail(interaction, check.reason);
      await target.setNickname(name, `โดย ${interaction.user.id}`);
      await interaction.reply({ embeds: [successEmbed(`เปลี่ยนชื่อ **${target.user.username}** เป็น **${safeText(name, 32)}**`)] });
    }
  } catch (err) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(userFacingError(err))], ...EPHEMERAL });
    } else {
      await interaction.reply({ embeds: [errorEmbed(userFacingError(err))], ...EPHEMERAL });
    }
  }
}
