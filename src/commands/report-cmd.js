import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, baseEmbed, EPHEMERAL } from '../utils/embeds.js';
import { addReport, getPendingQueue, getQueueHistory, resolveQueueItem, submitBanAppeal, reviewAppeal, getPendingAppeals, getAllAppeals } from '../moderation/appeals.js';
import { getPunishmentRules, addPunishmentRule, deletePunishmentRule } from '../utils/database.js';
import { safeText } from '../utils/sanitize.js';

export const data = [
  new SlashCommandBuilder()
    .setName('report')
    .setDescription('รายงานผู้ใช้ให้ทีมงาน')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('เหตุผล').setRequired(true).setMaxLength(500))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('modqueue')
    .setDescription('จัดการ mod queue (รายงาน/คำร้อง)')
    .addSubcommand(s =>
      s.setName('view').setDescription('ดู queue ที่ pending'),
    )
    .addSubcommand(s =>
      s.setName('resolve')
        .setDescription('จัดการ queue item')
        .addIntegerOption(o => o.setName('id').setDescription('Queue ID').setRequired(true))
        .addStringOption(o => o.setName('action').setDescription('การดำเนินการ').setRequired(true)
          .addChoices(
            { name: 'Resolved', value: 'resolved' },
            { name: 'Dismissed', value: 'dismissed' },
            { name: 'Escalated', value: 'escalated' },
          ))
        .addStringOption(o => o.setName('note').setDescription('หมายเหตุ').setMaxLength(500)),
    )
    .addSubcommand(s =>
      s.setName('history').setDescription('ดู queue ทั้งหมด (รวมที่จัดการแล้ว)'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Ban appeal (ยื่นอุทธรณ์)')
    .addSubcommand(s =>
      s.setName('submit')
        .setDescription('ยื่นคำร้องขอปลดแบน (DM only)')
        .addStringOption(o => o.setName('guild_id').setDescription('Server ID').setRequired(true).setMinLength(17).setMaxLength(20))
        .addStringOption(o => o.setName('reason').setDescription('เหตุผลที่ควรปลดแบน').setRequired(true).setMaxLength(1000)),
    )
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('ดู appeals ทั้งหมด')
        .addStringOption(o => o.setName('status').setDescription('สถานะ')
          .addChoices(
            { name: 'Pending', value: 'pending' },
            { name: 'All', value: 'all' },
          )),
    )
    .addSubcommand(s =>
      s.setName('review')
        .setDescription('อนุมัติ/ปฏิเสธ appeal')
        .addIntegerOption(o => o.setName('id').setDescription('Appeal ID').setRequired(true))
        .addStringOption(o => o.setName('decision').setDescription('ตัดสินใจ').setRequired(true)
          .addChoices(
            { name: 'Approve', value: 'approved' },
            { name: 'Deny', value: 'denied' },
          ))
        .addStringOption(o => o.setName('note').setDescription('หมายเหตุ').setMaxLength(500)),
    )
    .setDMPermission(true),

  new SlashCommandBuilder()
    .setName('punish-rule')
    .setDescription('ตั้งค่า auto-punishment rules (warning thresholds)')
    .addSubcommand(s =>
      s.setName('add')
        .setDescription('เพิ่ม rule')
        .addIntegerOption(o => o.setName('points').setDescription('Warning points threshold').setRequired(true).setMinValue(1).setMaxValue(100))
        .addStringOption(o => o.setName('action').setDescription('การลงโทษ').setRequired(true)
          .addChoices(
            { name: 'Timeout', value: 'timeout' },
            { name: 'Kick', value: 'kick' },
            { name: 'Ban', value: 'ban' },
            { name: 'Quarantine', value: 'quarantine' },
          ))
        .addStringOption(o => o.setName('duration').setDescription('ระยะเวลา timeout เช่น 1h, 1d').setMaxLength(16)),
    )
    .addSubcommand(s =>
      s.setName('list').setDescription('ดู rules ทั้งหมด'),
    )
    .addSubcommand(s =>
      s.setName('remove')
        .setDescription('ลบ rule')
        .addIntegerOption(o => o.setName('id').setDescription('Rule ID').setRequired(true)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
];

export const meta = {
  report: { guildOnly: true, cooldown: 10 },
  modqueue: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers] },
  appeal: { guildOnly: false, cooldown: 60 },
  'punish-rule': { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ManageGuild] },
};

export async function execute(interaction) {
  const { commandName } = interaction;

  try {
    // ═══════════ /report ═══════════
    if (commandName === 'report') {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      if (user.id === interaction.user.id) return interaction.reply({ embeds: [errorEmbed('รายงานตัวเองไม่ได้')], ...EPHEMERAL });
      if (user.bot) return interaction.reply({ embeds: [errorEmbed('รายงานบอทไม่ได้')], ...EPHEMERAL });

      const itemId = await addReport(interaction.guild.id, interaction.user.id, user.id, reason, {
        channel: interaction.channel.name,
        messageContent: interaction.message?.content?.slice(0, 200) || '',
      });
      return interaction.reply({
        embeds: [successEmbed(`รายงาน **${user.username}** แล้ว (Queue #${itemId})\nทีมงานจะตรวจสอบโดยเร็ว`)],
        ...EPHEMERAL,
      });
    }

    // ═══════════ /modqueue ═══════════
    if (commandName === 'modqueue') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'view') {
        const items = await getPendingQueue(interaction.guild.id);
        if (!items.length) return interaction.reply({ embeds: [infoEmbed('Mod Queue', 'Queue ว่าง')] });

        const list = items.map((q) =>
          `**#${q.id}** [${q.type}] <@${q.targetId || 'N/A'}> — ${safeText(q.details?.reason || '', 80)} (<t:${Math.floor(q.createdAt / 1000)}:R>)`
        ).join('\n');
        return interaction.reply({ embeds: [baseEmbed(`Mod Queue — Pending (${items.length})`, list)] });
      }

      if (sub === 'resolve') {
        const id = interaction.options.getInteger('id');
        const action = interaction.options.getString('action');
        const note = interaction.options.getString('note');
        await resolveQueueItem(interaction.guild.id, id, action, interaction.member, note);
        return interaction.reply({ embeds: [successEmbed(`Queue #${id} → ${action}`)] });
      }

      if (sub === 'history') {
        const items = await getQueueHistory(interaction.guild.id);
        if (!items.length) return interaction.reply({ embeds: [infoEmbed('Mod Queue', 'ไม่มีประวัติ')] });

        const list = items.slice(0, 15).map((q) =>
          `**#${q.id}** [${q.type}] ${q.status} — <@${q.targetId || 'N/A'}> (<t:${Math.floor(q.createdAt / 1000)}:R>)`
        ).join('\n');
        return interaction.reply({ embeds: [baseEmbed(`Mod Queue — History`, list)] });
      }
    }

    // ═══════════ /appeal ═══════════
    if (commandName === 'appeal') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'submit') {
        if (interaction.guild) return interaction.reply({ embeds: [errorEmbed('ใช้คำสั่งนี้ใน DM เท่านั้น')], ...EPHEMERAL });
        const guildId = interaction.options.getString('guild_id');
        const reason = interaction.options.getString('reason');
        const appealId = await submitBanAppeal(guildId, interaction.user.id, reason, null);
        return interaction.reply({ embeds: [successEmbed(`ยื่น Appeal #${appealId} แล้ว\nทีมงานจะพิจารณาโดยเร็ว`)] });
      }

      if (sub === 'list') {
        if (!interaction.guild) return interaction.reply({ embeds: [errorEmbed('ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้น')], ...EPHEMERAL });
        const statusFilter = interaction.options.getString('status');
        const appeals = statusFilter === 'pending'
          ? await getPendingAppeals(interaction.guild.id)
          : await getAllAppeals(interaction.guild.id);
        if (!appeals.length) return interaction.reply({ embeds: [infoEmbed('Appeals', 'ไม่มี appeals')] });

        const list = appeals.map((a) =>
          `**#${a.id}** <@${a.userId}> [${a.status}] — ${safeText(a.reason, 80)} (<t:${Math.floor(a.createdAt / 1000)}:R>)`
        ).join('\n');
        return interaction.reply({ embeds: [baseEmbed(`Ban Appeals (${appeals.length})`, list)] });
      }

      if (sub === 'review') {
        if (!interaction.guild) return interaction.reply({ embeds: [errorEmbed('ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้น')], ...EPHEMERAL });
        const appealId = interaction.options.getInteger('id');
        const decision = interaction.options.getString('decision');
        const note = interaction.options.getString('note');
        await interaction.deferReply();
        await reviewAppeal(interaction.guild, appealId, decision, interaction.member, note);
        return interaction.editReply({ embeds: [successEmbed(`Appeal #${appealId} → ${decision}`)] });
      }
    }

    // ═══════════ /punish-rule ═══════════
    if (commandName === 'punish-rule') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const points = interaction.options.getInteger('points');
        const action = interaction.options.getString('action');
        const duration = interaction.options.getString('duration');
        const ruleId = await addPunishmentRule(interaction.guild.id, points, action, {
          duration,
          createdBy: interaction.user.id,
        });
        return interaction.reply({
          embeds: [successEmbed(`เพิ่ม Rule #${ruleId}: เมื่อ warning points >= ${points} → ${action}${duration ? ` (${duration})` : ''}`)],
        });
      }

      if (sub === 'list') {
        const rules = await getPunishmentRules(interaction.guild.id);
        if (!rules.length) return interaction.reply({ embeds: [infoEmbed('Punishment Rules', 'ยังไม่มี rules — ใช้ `/punish-rule add` เพื่อเพิ่ม')] });

        const list = rules.map((r) =>
          `**#${r.id}** Points >= ${r.pointsThreshold} → **${r.action}**${r.duration ? ` (${r.duration})` : ''}`
        ).join('\n');
        return interaction.reply({ embeds: [baseEmbed('Auto-Punishment Rules', list)] });
      }

      if (sub === 'remove') {
        const ruleId = interaction.options.getInteger('id');
        await deletePunishmentRule(interaction.guild.id, ruleId);
        return interaction.reply({ embeds: [successEmbed(`ลบ Rule #${ruleId} แล้ว`)] });
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
