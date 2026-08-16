import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, baseEmbed, EPHEMERAL } from '../utils/embeds.js';
import {
  setGuildConfig,
  getGuildConfig,
  ensureUserLevel,
  xpForLevel,
  getLevelLeaderboard,
  getTicketByChannel,
  addTicketNote,
  getTicketNotes,
  getStaffStats,
  getOpenTickets,
  getClosedTickets,
  createTicketPanel,
  updatePanelMessageId,
} from '../utils/database.js';
import { config } from '../config.js';
import { claimTicketByStaff, transferTicketToStaff, closeTicketById, renameTicketChannel, addMemberToTicket, removeMemberFromTicket } from '../tickets/manager.js';
import { requestFeedback } from '../tickets/feedback.js';
import { safeText } from '../utils/sanitize.js';
import { runHealthCheck } from '../utils/health.js';
import { errorTracker } from '../utils/error-tracker.js';
import { metrics } from '../utils/metrics.js';
import { createDatabaseBackup, listBackups } from '../database/backup.js';

export const data = [
  new SlashCommandBuilder()
    .setName('health')
    .setDescription('ตรวจสอบสถานะระบบทั้งหมด (Discord, Database, Redis, Queue, Runtime)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('diagnose')
    .setDescription('เครื่องมือวิเคราะห์ระบบและการทำงาน')
    .addSubcommand(s =>
      s.setName('error')
        .setDescription('ค้นหาและดูรายละเอียดข้อผิดพลาดจาก Error ID')
        .addStringOption(o => o.setName('id').setDescription('Error ID เช่น ERR-XXXXXXXX').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('metrics')
        .setDescription('ดูความเร็วการตอบสนองและสถิติ Performance Latency'),
    )
    .addSubcommand(s =>
      s.setName('backup')
        .setDescription('สร้างหรือดูรายการสำรองข้อมูลฐานข้อมูล')
        .addStringOption(o =>
          o.setName('action')
            .setDescription('การกระทำ')
            .setRequired(true)
            .addChoices(
              { name: 'สร้าง Backup ทันที', value: 'create' },
              { name: 'ดูรายการ Backup ทั้งหมด', value: 'list' },
            ),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('ตั้งค่าระบบต้อนรับ')
    .addSubcommand(s =>
      s.setName('set')
        .setDescription('ตั้งช่องต้อนรับ')
        .addChannelOption(o => o.setName('channel').setDescription('ช่อง').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption(o => o.setName('message').setDescription('ข้อความ ({user} {server} {memberCount})')),
    )
    .addSubcommand(s => s.setName('disable').setDescription('ปิดระบบต้อนรับ'))
    .addSubcommand(s => s.setName('test').setDescription('ทดสอบข้อความต้อนรับ'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('ตั้งบทบาทอัตโนมัติเมื่อเข้าเซิร์ฟ')
    .addRoleOption(o => o.setName('role').setDescription('บทบาท (เว้นว่างเพื่อปิด)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('ดูเลเวลและ XP')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้')),

  new SlashCommandBuilder()
    .setName('levelboard')
    .setDescription('อันดับเลเวล'),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('ระบบ Ticket')
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('สร้างปุ่มเปิด Ticket')
        .addChannelOption(o => o.setName('channel').setDescription('ช่องวางปุ่ม').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption(o => o.setName('title').setDescription('หัวข้อ').setMaxLength(100))
        .addStringOption(o => o.setName('description').setDescription('รายละเอียด').setMaxLength(500))
        .addStringOption(o => o.setName('category').setDescription('หมวดหมู่ ticket')
          .addChoices(
            { name: 'General', value: 'general' },
            { name: 'Support', value: 'support' },
            { name: 'Bug Report', value: 'bug' },
            { name: 'Suggestion', value: 'suggestion' },
          )),
    )
    .addSubcommand(s =>
      s.setName('close')
        .setDescription('ปิด Ticket')
        .addStringOption(o => o.setName('reason').setDescription('เหตุผล').setMaxLength(400)),
    )
    .addSubcommand(s => s.setName('claim').setDescription('Claim ticket นี้ (staff)'))
    .addSubcommand(s =>
      s.setName('transfer')
        .setDescription('โอน ticket ให้ staff คนอื่น')
        .addUserOption(o => o.setName('staff').setDescription('Staff member').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('rename')
        .setDescription('เปลี่ยนชื่อช่อง ticket')
        .addStringOption(o => o.setName('name').setDescription('ชื่อใหม่').setRequired(true).setMaxLength(50)),
    )
    .addSubcommand(s =>
      s.setName('add')
        .setDescription('เพิ่มผู้ใช้เข้า ticket')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('remove')
        .setDescription('ลบผู้ใช้ออกจาก ticket')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('note')
        .setDescription('เพิ่ม note (staff only)')
        .addStringOption(o => o.setName('content').setDescription('เนื้อหา').setRequired(true).setMaxLength(2000)),
    )
    .addSubcommand(s => s.setName('notes').setDescription('ดู notes ทั้งหมดของ ticket'))
    .addSubcommand(s => s.setName('list').setDescription('ดู ticket ที่ open'))
    .addSubcommand(s => s.setName('stats').setDescription('ดู staff performance stats'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
];

function welcomeMessage(template, member) {
  return (template || 'ยินดีต้อนรับ {user} เข้าสู่ **{server}**! คุณเป็นสมาชิกคนที่ {memberCount}')
    .replace(/{user}/g, member.toString())
    .replace(/{server}/g, member.guild.name)
    .replace(/{memberCount}/g, member.guild.memberCount);
}

export async function execute(interaction, client) {
  const { commandName, guild } = interaction;

  // ── /health ──
  if (commandName === 'health') {
    await interaction.deferReply();
    const probe = await runHealthCheck(client);
    const badge = probe.overallStatus === 'HEALTHY' ? '🟢 HEALTHY' : '🔴 DEGRADED';

    const embed = baseEmbed(`🏥 5-Tier System Health: ${badge}`, `ตรวจสอบสถานะระบบ ณ <t:${Math.floor(Date.now() / 1000)}:T>`)
      .addFields(
        {
          name: '📡 Discord Gateway',
          value: `Status: **${probe.discord.status}**\nPing: \`${probe.discord.ping}ms\`\nGuilds: \`${probe.discord.guilds}\` | Users: \`${probe.discord.users}\``,
          inline: true,
        },
        {
          name: '🐘 PostgreSQL Database',
          value: `Status: **${probe.database.status}**\nLatency: \`${probe.database.latency || 'N/A'}\`\nPool: \`${probe.database.pool?.used ?? 0}/${probe.database.pool?.max ?? 0} connections\``,
          inline: true,
        },
        {
          name: '⚡ Hybrid Cache & State',
          value: `Engine: **${probe.cache.type}**\nStatus: \`${probe.cache.status}\`\nCached Keys: \`${probe.cache.keysCached}\``,
          inline: true,
        },
        {
          name: '⚙️ Job Queue & Workers',
          value: `Status: **${probe.queue.status}**\nActive Jobs: \`${probe.queue.activeJobs}\`\nQueued: \`${probe.queue.queuedJobs}\` | Processed: \`${probe.queue.processedCount}\`\nDLQ (Failed): \`${probe.queue.dlqCount}\``,
          inline: true,
        },
        {
          name: '💻 Node.js Runtime',
          value: `Node: \`${probe.runtime.nodeVersion}\` (${probe.runtime.platform})\nHeap Used: \`${probe.runtime.heapUsed} / ${probe.runtime.heapTotal}\`\nUptime: \`${Math.round(probe.discord.uptime / 60)} นาที\``,
          inline: true,
        },
        {
          name: '📊 Performance Overview',
          value: `Throughput: \`${probe.metrics.throughput.commandsPerMinute} cmds/min\`\nCmd Avg Latency: \`${probe.metrics.commands.stats.avg}ms\` (p95: \`${probe.metrics.commands.stats.p95}ms\`)\nRecent Errors (10m): \`${probe.metrics.errors.last10Minutes}\``,
          inline: false,
        },
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── /diagnose ──
  if (commandName === 'diagnose') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'error') {
      const errorId = interaction.options.getString('id');
      const record = errorTracker.get(errorId);

      if (!record) {
        return interaction.reply({
          embeds: [errorEmbed(`ไม่พบประวัติ Error ID \`${errorId}\` ในระบบ (อาจถูกเคลียร์หรือเกิดขึ้นนานเกินไป)`)],
          ...EPHEMERAL,
        });
      }

      const stackSnippet = record.stack ? `\`\`\`javascript\n${record.stack.slice(0, 800)}\n\`\`\`` : 'ไม่มี Stack Trace';
      const embed = baseEmbed(`🔍 Error Diagnostics — [${record.id}]`, null)
        .addFields(
          { name: 'Command / Action', value: `\`${record.commandName}\``, inline: true },
          { name: 'User / Guild', value: `User: <@${record.userId}>\nGuild: \`${record.guildId}\``, inline: true },
          { name: 'Timestamp', value: `<t:${Math.floor(record.timestamp / 1000)}:F>`, inline: false },
          { name: 'Error Message', value: `\`\`\`${record.message}\`\`\``, inline: false },
          { name: 'Stack Trace Snippet', value: stackSnippet, inline: false },
        );

      return interaction.reply({ embeds: [embed], ...EPHEMERAL });
    }

    if (sub === 'metrics') {
      const cmdMetrics = metrics.getCommandMetrics();
      const dbMetrics = metrics.getDbMetrics();
      const tp = metrics.getThroughput();

      const embed = baseEmbed('📈 Performance & Latency Diagnostics', null)
        .addFields(
          {
            name: '⚡ Command Latency Breakdown',
            value: `Total Executions: \`${cmdMetrics.total}\`\nAverage: \`${cmdMetrics.stats.avg}ms\`\nMedian (p50): \`${cmdMetrics.stats.p50}ms\`\np95: \`${cmdMetrics.stats.p95}ms\`\np99: \`${cmdMetrics.stats.p99}ms\`\nMin / Max: \`${cmdMetrics.stats.min}ms / ${cmdMetrics.stats.max}ms\``,
            inline: true,
          },
          {
            name: '🐘 Database Query Latency',
            value: `Samples: \`${dbMetrics.stats.count}\`\nAverage: \`${dbMetrics.stats.avg}ms\`\np95: \`${dbMetrics.stats.p95}ms\`\nMin / Max: \`${dbMetrics.stats.min}ms / ${dbMetrics.stats.max}ms\``,
            inline: true,
          },
          {
            name: '🚀 Live Throughput',
            value: `Rate: \`${tp.commandsPerMinute} commands / min\``,
            inline: false,
          },
        );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'backup') {
      const action = interaction.options.getString('action');

      if (action === 'create') {
        await interaction.deferReply({ ...EPHEMERAL });
        try {
          const res = await createDatabaseBackup(`manual_by_${interaction.user.username}`);
          return interaction.editReply({
            embeds: [successEmbed(`สร้างไฟล์สำรองข้อมูลสำเร็จ: **${res.filename}** (${res.sizeKb} KB, ${res.tablesCount} ตาราง)`)],
          });
        } catch (err) {
          return interaction.editReply({ embeds: [errorEmbed(`สร้าง Backup ไม่สำเร็จ: ${err.message}`)] });
        }
      }

      if (action === 'list') {
        const backups = listBackups();
        if (!backups.length) {
          return interaction.reply({ embeds: [infoEmbed('Database Backups', 'ยังไม่มีไฟล์ Backup')], ...EPHEMERAL });
        }

        const lines = backups.slice(0, 10).map((b, i) => `${i + 1}. \`${b.file}\` (${b.sizeKb} KB) — <t:${Math.floor(b.modifiedAt / 1000)}:R>`);
        return interaction.reply({
          embeds: [baseEmbed('📦 รายการ Database Backups ล่าสุด', lines.join('\n'))],
          ...EPHEMERAL,
        });
      }
    }
  }

  // ── /welcome ──
  if (commandName === 'welcome') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');
      await setGuildConfig(guild.id, 'welcomeChannel', channel.id);
      if (message) await setGuildConfig(guild.id, 'welcomeMessage', message);
      await interaction.reply({ embeds: [successEmbed(`ตั้งช่องต้อนรับเป็น ${channel} แล้ว`)] });
      return;
    }
    if (sub === 'disable') {
      await setGuildConfig(guild.id, 'welcomeChannel', null);
      await interaction.reply({ embeds: [successEmbed('ปิดระบบต้อนรับแล้ว')] });
      return;
    }
    if (sub === 'test') {
      const channelId = getGuildConfig(guild.id, 'welcomeChannel');
      if (!channelId) return interaction.reply({ embeds: [errorEmbed('ยังไม่ได้ตั้งช่องต้อนรับ')], ephemeral: true });
      const template = getGuildConfig(guild.id, 'welcomeMessage');
      const msg = welcomeMessage(template, interaction.member);
      await interaction.reply({ embeds: [infoEmbed('👋 ทดสอบต้อนรับ', msg)] });
    }
    return;
  }

  // ── /autorole ──
  if (commandName === 'autorole') {
    const role = interaction.options.getRole('role');
    if (!role) {
      await setGuildConfig(guild.id, 'autorole', null);
      await interaction.reply({ embeds: [successEmbed('ปิด autorole แล้ว')] });
      return;
    }
    await setGuildConfig(guild.id, 'autorole', role.id);
    await interaction.reply({ embeds: [successEmbed(`ตั้ง autorole เป็น ${role} แล้ว`)] });
    return;
  }

  // ── /rank ──
  if (commandName === 'rank') {
    const user = interaction.options.getUser('user') || interaction.user;
    const data = await ensureUserLevel(guild.id, user.id);
    const needed = xpForLevel(data.level + 1);
    const progress = Math.floor((data.xp / needed) * 100);
    const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
    const embed = baseEmbed(`📊 Rank - ${user.username}`, null)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Level', value: `${data.level}`, inline: true },
        { name: 'XP', value: `${data.xp} / ${needed}`, inline: true },
        { name: 'Progress', value: `${bar} ${progress}%`, inline: false },
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── /levelboard ──
  if (commandName === 'levelboard') {
    const sorted = await getLevelLeaderboard(guild.id, 10);
    if (!sorted.length) return interaction.reply('ยังไม่มีข้อมูล XP');
    const lines = await Promise.all(sorted.map(async (entry, i) => {
      const user = await client.users.fetch(entry.userId).catch(() => null);
      const name = user ? user.username : entry.userId;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${medal} **${name}** — Lv.${entry.level} (${entry.xp} XP)`;
    }));
    await interaction.reply({ embeds: [baseEmbed('🏆 Level Leaderboard', lines.join('\n'))] });
    return;
  }

  // ── /ticket ──
  if (commandName === 'ticket') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title') || '🎫 ระบบ Ticket';
      const description = interaction.options.getString('description') || 'กดปุ่มด้านล่างเพื่อเปิด Ticket ติดต่อทีมงาน';
      const category = interaction.options.getString('category') || 'general';

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_panel_open_${category}`)
          .setLabel(`🎫 ${category.charAt(0).toUpperCase() + category.slice(1)} Ticket`)
          .setStyle(ButtonStyle.Primary),
      );
      const msg = await channel.send({
        embeds: [baseEmbed(title, description)],
        components: [row],
      });
      const panelId = await createTicketPanel(guild.id, channel.id, {
        title,
        description,
        categories: [{ id: category, label: category, emoji: '🎫' }],
      });
      await updatePanelMessageId(panelId, msg.id);
      await interaction.reply({ embeds: [successEmbed(`ตั้ง Ticket Panel ใน ${channel} แล้ว (${category})`)], ephemeral: true });
      return;
    }

    const ticket = await getTicketByChannel(interaction.channel.id);
    if (!ticket && sub !== 'list' && sub !== 'stats') {
      return interaction.reply({ embeds: [errorEmbed('ใช้คำสั่งนี้ในช่อง Ticket เท่านั้น')], ...EPHEMERAL });
    }

    if (sub === 'close') {
      const reason = interaction.options.getString('reason') || '';
      await interaction.deferReply();
      const closed = await closeTicketById(guild, ticket.id, interaction.user.id, reason);
      await requestFeedback(client, guild, closed);
      return interaction.editReply({ embeds: [successEmbed(`ปิด Ticket #${ticket.id} แล้ว${reason ? `\nเหตุผล: ${safeText(reason, 200)}` : ''}`)] });
    }

    if (sub === 'claim') {
      await interaction.deferReply();
      const result = await claimTicketByStaff(guild, ticket.id, interaction.member);
      const responseMin = Math.floor(result.responseMs / 60000);
      return interaction.editReply({
        embeds: [successEmbed(`${interaction.member} claimed Ticket #${ticket.id}\nFirst response: ${responseMin}m`)],
      });
    }

    if (sub === 'transfer') {
      const newStaff = interaction.options.getMember('staff');
      await interaction.deferReply();
      await transferTicketToStaff(guild, ticket.id, newStaff);
      return interaction.editReply({
        embeds: [successEmbed(`โอน Ticket #${ticket.id} ให้ ${newStaff} แล้ว`)],
      });
    }

    if (sub === 'rename') {
      const newName = interaction.options.getString('name');
      await renameTicketChannel(guild, ticket.id, newName);
      return interaction.reply({ embeds: [successEmbed(`เปลี่ยนชื่อ ticket เป็น **ticket-${newName}**`)] });
    }

    if (sub === 'add') {
      const user = interaction.options.getMember('user');
      await addMemberToTicket(guild, ticket.id, user);
      return interaction.reply({ embeds: [successEmbed(`เพิ่ม ${user} เข้า Ticket #${ticket.id}`)] });
    }

    if (sub === 'remove') {
      const user = interaction.options.getMember('user');
      await removeMemberFromTicket(guild, ticket.id, user);
      return interaction.reply({ embeds: [successEmbed(`ลบ ${user} ออกจาก Ticket #${ticket.id}`)] });
    }

    if (sub === 'note') {
      const content = interaction.options.getString('content');
      const noteId = await addTicketNote(ticket.id, interaction.user.id, content);
      return interaction.reply({ embeds: [successEmbed(`เพิ่ม Note #${noteId} ใน Ticket #${ticket.id}`)], ...EPHEMERAL });
    }

    if (sub === 'notes') {
      const notes = await getTicketNotes(ticket.id);
      if (!notes.length) return interaction.reply({ embeds: [infoEmbed('Ticket Notes', 'ยังไม่มี notes')], ...EPHEMERAL });
      const list = notes.map((n) => `**#${n.id}** <@${n.authorId}> (<t:${Math.floor(n.createdAt / 1000)}:R>)\n${safeText(n.content, 200)}`).join('\n\n');
      return interaction.reply({ embeds: [baseEmbed(`Notes — Ticket #${ticket.id}`, list)], ...EPHEMERAL });
    }

    if (sub === 'list') {
      const open = await getOpenTickets(guild.id);
      const closed = await getClosedTickets(guild.id, { limit: 5 });
      const openList = open.length ? open.map((t) => `#${t.id} <#${t.channelId || '?'}> [${t.category}] by <@${t.ownerId}> (${t.status}${t.claimedBy ? `, claimed by <@${t.claimedBy}>` : ''})`).join('\n') : 'No open tickets';
      const closedList = closed.length ? closed.map((t) => `#${t.id} [${t.category}] by <@${t.ownerId}> — ${safeText(t.closeReason || 'no reason', 50)}`).join('\n') : 'No recent closed tickets';
      return interaction.reply({
        embeds: [baseEmbed('📋 Ticket Overview')
          .addFields(
            { name: `Open (${open.length})`, value: openList },
            { name: 'Recently Closed', value: closedList },
          )],
      });
    }

    if (sub === 'stats') {
      const stats = await getStaffStats(guild.id);
      if (!stats.length) return interaction.reply({ embeds: [infoEmbed('Staff Stats', 'ยังไม่มีข้อมูล')] });
      const lines = stats.map((s) => `<@${s.staffId}> — Claimed: ${s.ticketsClaimed} | Closed: ${s.ticketsClosed}${s.avgResponseMs !== null ? ` | Avg Response: ${Math.floor(s.avgResponseMs / 1000)}s` : ''}`);
      return interaction.reply({ embeds: [baseEmbed('📊 Staff Performance', lines.join('\n'))] });
    }
  }
}

export { welcomeMessage };
