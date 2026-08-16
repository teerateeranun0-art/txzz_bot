import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, baseEmbed, EPHEMERAL } from '../utils/embeds.js';
import { getCaseDetail, getUserCases, searchAllCases, updateCaseDetail, exportCasesText, summarizeCaseTypes } from '../moderation/case-manager.js';
import { addModNote, getModNotes, deleteModNote, updateModNote } from '../utils/database.js';
import { getModLogStats, getModLogs, getActiveWarningPoints } from '../utils/database.js';
import { safeText } from '../utils/sanitize.js';

export const data = [
  new SlashCommandBuilder()
    .setName('case')
    .setDescription('จัดการ moderation cases')
    .addSubcommand(s =>
      s.setName('view')
        .setDescription('ดูรายละเอียด case')
        .addIntegerOption(o => o.setName('id').setDescription('Case ID').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('user')
        .setDescription('ดู cases ของผู้ใช้')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('กรองตามประเภท')
          .addChoices(
            { name: 'All', value: 'all' },
            { name: 'Ban', value: 'ban' },
            { name: 'Kick', value: 'kick' },
            { name: 'Timeout', value: 'timeout' },
            { name: 'Warn', value: 'warn' },
            { name: 'Jail', value: 'jail' },
          )),
    )
    .addSubcommand(s =>
      s.setName('search')
        .setDescription('ค้นหา cases ทั้งหมด')
        .addStringOption(o => o.setName('type').setDescription('กรองตามประเภท')
          .addChoices(
            { name: 'All', value: 'all' },
            { name: 'Ban', value: 'ban' },
            { name: 'Kick', value: 'kick' },
            { name: 'Timeout', value: 'timeout' },
            { name: 'Warn', value: 'warn' },
          ))
        .addIntegerOption(o => o.setName('page').setDescription('หน้า').setMinValue(1)),
    )
    .addSubcommand(s =>
      s.setName('edit')
        .setDescription('แก้ไข case')
        .addIntegerOption(o => o.setName('id').setDescription('Case ID').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('เหตุผลใหม่').setMaxLength(400))
        .addBooleanOption(o => o.setName('active').setDescription('Active/Overturned')),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('modnote')
    .setDescription('จัดการ Moderator notes')
    .addSubcommand(s =>
      s.setName('add')
        .setDescription('เพิ่ม note')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
        .addStringOption(o => o.setName('content').setDescription('เนื้อหา').setRequired(true).setMaxLength(2000))
        .addStringOption(o => o.setName('category').setDescription('หมวดหมู่')
          .addChoices(
            { name: 'General', value: 'general' },
            { name: 'Behavior', value: 'behavior' },
            { name: 'Evidence', value: 'evidence' },
            { name: 'Staff Note', value: 'staff_note' },
          )),
    )
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('ดู notes ของผู้ใช้')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('edit')
        .setDescription('แก้ไข note')
        .addIntegerOption(o => o.setName('id').setDescription('Note ID').setRequired(true))
        .addStringOption(o => o.setName('content').setDescription('เนื้อหาใหม่').setRequired(true).setMaxLength(2000)),
    )
    .addSubcommand(s =>
      s.setName('delete')
        .setDescription('ลบ note')
        .addIntegerOption(o => o.setName('id').setDescription('Note ID').setRequired(true)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('moddashboard')
    .setDescription('ดู dashboard สรุป mod activity')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
];

export const meta = {
  case: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers] },
  modnote: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers] },
  moddashboard: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ModerateMembers] },
};

export async function execute(interaction) {
  const { commandName, guild } = interaction;

  try {
    // ═══════════ /case ═══════════
    if (commandName === 'case') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'view') {
        const caseId = interaction.options.getInteger('id');
        const detail = await getCaseDetail(guild.id, caseId);
        if (!detail) return interaction.reply({ embeds: [errorEmbed('ไม่พบ case นี้')], ...EPHEMERAL });

        const embed = baseEmbed(`Case #${detail.id} — ${detail.typeLabel}`)
          .addFields(
            { name: 'Target', value: `<@${detail.targetId}>`, inline: true },
            { name: 'Moderator', value: `<@${detail.moderatorId}>`, inline: true },
            { name: 'Status', value: detail.status, inline: true },
            { name: 'Reason', value: safeText(detail.reason || 'N/A', 1024) },
            { name: 'Created', value: `<t:${Math.floor(detail.createdAt / 1000)}:F>` },
          );
        if (detail.updatedAt) {
          embed.addFields({ name: 'Updated', value: `<t:${Math.floor(detail.updatedAt / 1000)}:R> by <@${detail.updatedBy}>` });
        }
        if (Object.keys(detail.extra).length) {
          embed.addFields({ name: 'Extra', value: `\`\`\`json\n${JSON.stringify(detail.extra, null, 2).slice(0, 1000)}\n\`\`\`` });
        }
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === 'user') {
        const user = interaction.options.getUser('user');
        const typeFilter = interaction.options.getString('type');
        const cases = await getUserCases(guild.id, user.id, { type: typeFilter === 'all' ? null : typeFilter });
        if (!cases.length) return interaction.reply({ embeds: [infoEmbed('Cases', `${user.username} ไม่มี cases`)] });

        const summary = summarizeCaseTypes(cases);
        const summaryStr = Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join(', ');
        const list = cases.slice(0, 15).map((c) =>
          `#${c.id} **${c.type}** — ${safeText(c.reason, 60)} (<t:${Math.floor(c.createdAt / 1000)}:R>)`
        ).join('\n');
        return interaction.reply({
          embeds: [baseEmbed(`Cases — ${user.username}`, list)
            .addFields(
              { name: 'Total', value: `${cases.length}`, inline: true },
              { name: 'Summary', value: summaryStr || 'N/A', inline: true },
            )],
        });
      }

      if (sub === 'search') {
        const typeFilter = interaction.options.getString('type');
        const page = interaction.options.getInteger('page') || 1;
        const { cases, total } = await searchAllCases(guild.id, {
          type: typeFilter === 'all' ? null : typeFilter,
          limit: 10,
          offset: (page - 1) * 10,
        });
        if (!cases.length) return interaction.reply({ embeds: [infoEmbed('Search', 'ไม่พบ cases')] });

        const totalPages = Math.ceil(total / 10);
        const list = cases.map((c) =>
          `#${c.id} **${c.type}** <@${c.targetId}> — ${safeText(c.reason, 50)} (<t:${Math.floor(c.createdAt / 1000)}:R>)`
        ).join('\n');
        return interaction.reply({
          embeds: [baseEmbed(`Case Search (Page ${page}/${totalPages})`, list)
            .setFooter({ text: `${total} total cases` })],
        });
      }

      if (sub === 'edit') {
        const caseId = interaction.options.getInteger('id');
        const reason = interaction.options.getString('reason');
        const active = interaction.options.getBoolean('active');
        const updates = {};
        if (reason) updates.reason = reason;
        if (active !== null) updates.active = active;
        if (!Object.keys(updates).length) return interaction.reply({ embeds: [errorEmbed('กรุณาระบุ reason หรือ active')], ...EPHEMERAL });

        await updateCaseDetail(guild.id, caseId, updates, interaction.user.id);
        return interaction.reply({ embeds: [successEmbed(`อัพเดท Case #${caseId} แล้ว`)] });
      }
    }

    // ═══════════ /modnote ═══════════
    if (commandName === 'modnote') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const user = interaction.options.getUser('user');
        const content = interaction.options.getString('content');
        const category = interaction.options.getString('category') || 'general';
        const noteId = await addModNote(guild.id, user.id, interaction.user.id, content, category);
        return interaction.reply({ embeds: [successEmbed(`เพิ่ม Note #${noteId} สำหรับ **${user.username}** (${category})`)] });
      }

      if (sub === 'list') {
        const user = interaction.options.getUser('user');
        const notes = await getModNotes(guild.id, user.id);
        if (!notes.length) return interaction.reply({ embeds: [infoEmbed('Mod Notes', `${user.username} ไม่มี notes`)] });

        const list = notes.map((n) =>
          `**#${n.id}** [${n.category}] <@${n.authorId}> (<t:${Math.floor(n.createdAt / 1000)}:R>)\n${safeText(n.content, 200)}`
        ).join('\n\n');
        return interaction.reply({ embeds: [baseEmbed(`Mod Notes — ${user.username}`, list)] });
      }

      if (sub === 'edit') {
        const noteId = interaction.options.getInteger('id');
        const content = interaction.options.getString('content');
        await updateModNote(guild.id, noteId, content);
        return interaction.reply({ embeds: [successEmbed(`อัพเดท Note #${noteId} แล้ว`)] });
      }

      if (sub === 'delete') {
        const noteId = interaction.options.getInteger('id');
        await deleteModNote(guild.id, noteId);
        return interaction.reply({ embeds: [successEmbed(`ลบ Note #${noteId} แล้ว`)] });
      }
    }

    // ═══════════ /moddashboard ═══════════
    if (commandName === 'moddashboard') {
      await interaction.deferReply();
      const stats = await getModLogStats(guild.id);

      const categoryStr = Object.entries(stats.byCategory)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n') || 'No data';

      const embed = baseEmbed('Mod Dashboard')
        .addFields(
          { name: 'Total Events', value: `${stats.total}`, inline: true },
          { name: 'Last 24h', value: `${stats.last24h}`, inline: true },
          { name: 'Last 7 days', value: `${stats.last7d}`, inline: true },
          { name: 'By Category (7d)', value: categoryStr },
        );
      return interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    } else {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
  }
}
