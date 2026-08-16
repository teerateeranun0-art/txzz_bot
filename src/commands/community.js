import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import ms from 'ms';
import { successEmbed, errorEmbed, baseEmbed, infoEmbed, EPHEMERAL } from '../utils/embeds.js';
import {
  setGuildConfig,
  getGuildConfig,
  createSuggestion,
  getSuggestion,
  updateSuggestionMessage,
  updateSuggestionStatus,
  getGuildSuggestions,
  setBirthday,
  getBirthday,
  getUpcomingBirthdays,
  getTodayBirthdays,
  markBirthdayCelebrated,
  createAnnouncement,
  getGuildAnnouncements,
  setupCounting,
  getCountingState,
  getCountingLeaderboard,
  setupWordChain,
  getWordChainState,
  getWordChainLeaderboard,
  resetCounting as dbResetCounting,
  resetWordChain as dbResetWordChain,
  addReactionRole,
  removeReactionRole,
  getReactionRolesForGuild,
} from '../utils/database.js';
import { setupReactionRole } from '../community/reaction-roles.js';
import { safeText } from '../utils/sanitize.js';

export const data = [
  new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('ระบบ Suggestions')
    .addSubcommand(s =>
      s.setName('submit')
        .setDescription('ส่งข้อเสนอ/คำแนะนำ')
        .addStringOption(o => o.setName('title').setDescription('หัวข้อ').setRequired(true).setMaxLength(200))
        .addStringOption(o => o.setName('description').setDescription('รายละเอียด').setRequired(true).setMaxLength(2000)),
    )
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('ดูรายการ suggestions')
        .addStringOption(o => o.setName('status').setDescription('สถานะ')
          .addChoices(
            { name: 'Pending', value: 'pending' },
            { name: 'Approved', value: 'approved' },
            { name: 'Denied', value: 'denied' },
            { name: 'All', value: 'all' },
          )),
    )
    .addSubcommand(s =>
      s.setName('resolve')
        .setDescription('อนุมัติ/ปฏิเสธ suggestion (staff)')
        .addIntegerOption(o => o.setName('id').setDescription('Suggestion ID').setRequired(true))
        .addStringOption(o => o.setName('action').setDescription('การดำเนินการ').setRequired(true)
          .addChoices(
            { name: 'Approve', value: 'approved' },
            { name: 'Deny', value: 'denied' },
            { name: 'Implemented', value: 'implemented' },
          ))
        .addStringOption(o => o.setName('note').setDescription('หมายเหตุ').setMaxLength(500)),
    )
    .setDefaultMemberPermissions(null),

  new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('ระบบวันเกิด')
    .addSubcommand(s =>
      s.setName('set')
        .setDescription('ตั้งวันเกิด')
        .addIntegerOption(o => o.setName('month').setDescription('เดือน (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
        .addIntegerOption(o => o.setName('day').setDescription('วัน (1-31)').setRequired(true).setMinValue(1).setMaxValue(31)),
    )
    .addSubcommand(s =>
      s.setName('view')
        .setDescription('ดูวันเกิด')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้')),
    )
    .addSubcommand(s =>
      s.setName('upcoming')
        .setDescription('ดูวันเกิดที่จะมาถึง (30 วัน)'),
    ),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('ส่งประกาศ (ทันทีหรือตั้งเวลา)')
    .addStringOption(o => o.setName('content').setDescription('เนื้อหา').setRequired(true).setMaxLength(2000))
    .addChannelOption(o => o.setName('channel').setDescription('ช่อง').addChannelTypes(ChannelType.GuildText))
    .addStringOption(o => o.setName('schedule').setDescription('ตั้งเวลา เช่น 1h, 30m, 1d'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('counting')
    .setDescription('เกม Counting')
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('ตั้งช่อง Counting')
        .addChannelOption(o => o.setName('channel').setDescription('ช่อง').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand(s => s.setName('stats').setDescription('ดูสถิติ Counting'))
    .addSubcommand(s =>
      s.setName('reset')
        .setDescription('Reset Counting')
        .addChannelOption(o => o.setName('channel').setDescription('ช่อง').addChannelTypes(ChannelType.GuildText)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('wordchain')
    .setDescription('เกม Word Chain')
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('ตั้งช่อง Word Chain')
        .addChannelOption(o => o.setName('channel').setDescription('ช่อง').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand(s => s.setName('stats').setDescription('ดูสถิติ Word Chain'))
    .addSubcommand(s =>
      s.setName('reset')
        .setDescription('Reset Word Chain')
        .addChannelOption(o => o.setName('channel').setDescription('ช่อง').addChannelTypes(ChannelType.GuildText)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('ตั้ง Reaction Role')
    .addSubcommand(s =>
      s.setName('add')
        .setDescription('เพิ่ม Reaction Role')
        .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('remove')
        .setDescription('ลบ Reaction Role')
        .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('ดู Reaction Roles ทั้งหมด'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('ตั้งค่า Starboard')
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('ตั้งช่อง Starboard')
        .addChannelOption(o => o.setName('channel').setDescription('ช่อง').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand(s => s.setName('disable').setDescription('ปิด Starboard'))
    .addSubcommand(s => s.setName('top').setDescription('ดู Top Starred'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];

export const meta = {
  suggestion: { guildOnly: true, cooldown: 5 },
  birthday: { guildOnly: true, cooldown: 3 },
  announce: { guildOnly: true, cooldown: 10 },
  counting: { guildOnly: true, cooldown: 5 },
  wordchain: { guildOnly: true, cooldown: 5 },
  reactionrole: { guildOnly: true, cooldown: 5 },
  starboard: { guildOnly: true, cooldown: 5 },
};

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function execute(interaction, client) {
  const { commandName, guild } = interaction;

  // ── Suggestion ──
  if (commandName === 'suggestion') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'submit') {
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const id = await createSuggestion(guild.id, interaction.user.id, title, description);

      // Post to suggestion channel if configured
      const sugChannelId = getGuildConfig(guild.id, 'suggestionChannel');
      if (sugChannelId) {
        const channel = guild.channels.cache.get(sugChannelId);
        if (channel?.isTextBased()) {
          const embed = baseEmbed(`💡 Suggestion #${id}`, description)
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ size: 64 }) })
            .setFooter({ text: `Status: Pending` });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`sug_up_${id}`).setLabel('👍 Upvote').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`sug_down_${id}`).setLabel('👎 Downvote').setStyle(ButtonStyle.Danger),
          );
          const msg = await channel.send({ embeds: [embed], components: [row] });
          await updateSuggestionMessage(id, msg.id);
        }
      }

      await interaction.reply({ embeds: [successEmbed(`Suggestion #${id} submitted!\n**${safeText(title, 100)}**`)], ...EPHEMERAL });
      return;
    }

    if (sub === 'list') {
      const status = interaction.options.getString('status') || 'pending';
      const filterStatus = status === 'all' ? null : status;
      const suggestions = await getGuildSuggestions(guild.id, filterStatus, 15);
      if (!suggestions.length) {
        return interaction.reply({ embeds: [infoEmbed('Suggestions', 'ไม่พบ suggestions')], ...EPHEMERAL });
      }
      const lines = suggestions.map((s) => {
        const statusEmoji = { pending: '🟡', approved: '✅', denied: '❌', implemented: '🟢' }[s.status] || '⚪';
        return `${statusEmoji} **#${s.id}** ${safeText(s.title, 50)} — 👍${s.upvotes} 👎${s.downvotes} by <@${s.user_id}>`;
      });
      await interaction.reply({ embeds: [baseEmbed(`📋 Suggestions (${filterStatus || 'all'})`, lines.join('\n'))], ...EPHEMERAL });
      return;
    }

    if (sub === 'resolve') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [errorEmbed('ต้องการสิทธิ์ Manage Server')], ...EPHEMERAL });
      }
      const id = interaction.options.getInteger('id');
      const action = interaction.options.getString('action');
      const note = interaction.options.getString('note');
      const sug = await getSuggestion(id);
      if (!sug || sug.guild_id !== guild.id) {
        return interaction.reply({ embeds: [errorEmbed('Suggestion not found')], ...EPHEMERAL });
      }
      await updateSuggestionStatus(id, action, interaction.user.id, note);
      await interaction.reply({ embeds: [successEmbed(`Suggestion #${id} → **${action}**${note ? `\nNote: ${safeText(note, 200)}` : ''}`)], ...EPHEMERAL });

      // Update the posted message if exists
      if (sug.message_id) {
        const sugChannelId = getGuildConfig(guild.id, 'suggestionChannel');
        if (sugChannelId) {
          const channel = guild.channels.cache.get(sugChannelId);
          if (channel) {
            const msg = await channel.messages.fetch(sug.message_id).catch(() => null);
            if (msg) {
              const statusEmoji = { approved: '✅', denied: '❌', implemented: '🟢' }[action] || '⚪';
              await msg.edit({
                embeds: [baseEmbed(`💡 Suggestion #${id}`, sug.description)
                  .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ size: 64 }) })
                  .setFooter({ text: `Status: ${action.toUpperCase()}${note ? ` — ${safeText(note, 100)}` : ''}` })],
                components: [],
              }).catch(() => {});
            }
          }
        }
      }
      return;
    }
  }

  // ── Birthday ──
  if (commandName === 'birthday') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const month = interaction.options.getInteger('month');
      const day = interaction.options.getInteger('day');
      // Basic validation
      const daysInMonth = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (day > daysInMonth[month]) {
        return interaction.reply({ embeds: [errorEmbed(`เดือน ${month} มีได้สูงสุด ${daysInMonth[month]} วัน`)], ...EPHEMERAL });
      }
      await setBirthday(guild.id, interaction.user.id, month, day);
      await interaction.reply({ embeds: [successEmbed(`🎂 ตั้งวันเกิดเป็น **${MONTH_NAMES[month]} ${day}**`)] });
      return;
    }

    if (sub === 'view') {
      const user = interaction.options.getUser('user') || interaction.user;
      const bd = await getBirthday(guild.id, user.id);
      if (!bd) {
        return interaction.reply({ embeds: [infoEmbed('Birthday', `${user.username} ยังไม่ได้ตั้งวันเกิด`)], ...EPHEMERAL });
      }
      await interaction.reply({
        embeds: [infoEmbed(`🎂 Birthday - ${user.username}`, `**${MONTH_NAMES[bd.month]} ${bd.day}**`)],
        ...EPHEMERAL,
      });
      return;
    }

    if (sub === 'upcoming') {
      const upcoming = await getUpcomingBirthdays(guild.id, 30);
      if (!upcoming.length) {
        return interaction.reply({ embeds: [infoEmbed('Birthdays', 'ไม่พบวันเกิดใน 30 วันข้างหน้า')], ...EPHEMERAL });
      }
      const lines = upcoming.map((b) => `<@${b.user_id}> — **${MONTH_NAMES[b.month]} ${b.day}**`);
      await interaction.reply({ embeds: [baseEmbed('🎂 Upcoming Birthdays (30 days)', lines.join('\n'))], ...EPHEMERAL });
      return;
    }
  }

  // ── Announce ──
  if (commandName === 'announce') {
    const content = interaction.options.getString('content');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const schedule = interaction.options.getString('schedule');

    if (schedule) {
      const durationMs = ms(schedule);
      if (!durationMs || durationMs < 60_000) {
        return interaction.reply({ embeds: [errorEmbed('เวลาไม่ถูกต้อง (ขั้นต่ำ 1 นาที)')], ...EPHEMERAL });
      }
      const scheduledAt = Date.now() + durationMs;
      await createAnnouncement(guild.id, channel.id, content, scheduledAt, interaction.user.id);
      await interaction.reply({
        embeds: [successEmbed(`📢 จะส่งประกาศใน ${channel} <t:${Math.floor(scheduledAt / 1000)}:R>`)],
        ...EPHEMERAL,
      });
    } else {
      await channel.send({
        content: `📢 **Announcement**\n${content}`,
      });
      await interaction.reply({ embeds: [successEmbed(`📢 ส่งประกาศใน ${channel} แล้ว`)], ...EPHEMERAL });
    }
    return;
  }

  // ── Counting ──
  if (commandName === 'counting') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      await setupCounting(guild.id, channel.id);
      await interaction.reply({ embeds: [successEmbed(`🔢 ตั้ง Counting ใน ${channel} แล้ว!\nเริ่มนับจาก **1**`)] });
      return;
    }

    if (sub === 'stats') {
      const rows = await getCountingLeaderboard(guild.id);
      if (!rows.length) {
        return interaction.reply({ embeds: [infoEmbed('Counting', 'ยังไม่มีข้อมูล')] });
      }
      const lines = rows.map((r) => `<#${r.channel_id}> — Current: **${r.current_number}** | Record: **${r.record}**`);
      await interaction.reply({ embeds: [baseEmbed('🔢 Counting Stats', lines.join('\n'))] });
      return;
    }

    if (sub === 'reset') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await dbResetCounting(guild.id, channel.id);
      await interaction.reply({ embeds: [successEmbed(`Reset Counting ใน ${channel} แล้ว`)] });
      return;
    }
  }

  // ── Word Chain ──
  if (commandName === 'wordchain') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      await setupWordChain(guild.id, channel.id);
      await interaction.reply({ embeds: [successEmbed(`🔗 ตั้ง Word Chain ใน ${channel} แล้ว!\nพิมพ์คำใดก็ได้เพื่อเริ่ม`)] });
      return;
    }

    if (sub === 'stats') {
      const rows = await getWordChainLeaderboard(guild.id);
      if (!rows.length) {
        return interaction.reply({ embeds: [infoEmbed('Word Chain', 'ยังไม่มีข้อมูล')] });
      }
      const lines = rows.map((r) => `<#${r.channel_id}> — Chain: **${r.chain_length}** words | Record: **${r.record}**`);
      await interaction.reply({ embeds: [baseEmbed('🔗 Word Chain Stats', lines.join('\n'))] });
      return;
    }

    if (sub === 'reset') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await dbResetWordChain(guild.id, channel.id);
      await interaction.reply({ embeds: [successEmbed(`Reset Word Chain ใน ${channel} แล้ว`)] });
      return;
    }
  }

  // ── Reaction Role ──
  if (commandName === 'reactionrole') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const messageId = interaction.options.getString('message_id');
      const emoji = interaction.options.getString('emoji');
      const role = interaction.options.getRole('role');

      // Try to find the message
      const channels = guild.channels.cache.filter((c) => c.isTextBased());
      let targetMsg = null;
      for (const [, channel] of channels) {
        targetMsg = await channel.messages.fetch(messageId).catch(() => null);
        if (targetMsg) break;
      }

      if (!targetMsg) {
        return interaction.reply({ embeds: [errorEmbed('ไม่พบข้อความ (ตรวจสอบ Message ID)')], ...EPHEMERAL });
      }

      await setupReactionRole(guild.id, targetMsg.channel.id, messageId, emoji, role.id, interaction.user.id);
      await targetMsg.react(emoji).catch(() => {});
      await interaction.reply({ embeds: [successEmbed(`เพิ่ม Reaction Role: ${emoji} → ${role}`)] });
      return;
    }

    if (sub === 'remove') {
      const messageId = interaction.options.getString('message_id');
      const emoji = interaction.options.getString('emoji');
      await removeReactionRole(messageId, emoji);
      await interaction.reply({ embeds: [successEmbed(`ลบ Reaction Role: ${emoji} แล้ว`)] });
      return;
    }

    if (sub === 'list') {
      const roles = await getReactionRolesForGuild(guild.id);
      if (!roles.length) {
        return interaction.reply({ embeds: [infoEmbed('Reaction Roles', 'ยังไม่มี Reaction Roles')] });
      }
      const lines = roles.map((r) => `Message \`${r.message_id}\` — ${r.emoji} → <@&${r.role_id}>`);
      await interaction.reply({ embeds: [baseEmbed(`🎭 Reaction Roles (${roles.length})`, lines.join('\n'))], ...EPHEMERAL });
      return;
    }
  }

  // ── Starboard ──
  if (commandName === 'starboard') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      await setGuildConfig(guild.id, 'starboardChannel', channel.id);
      await interaction.reply({ embeds: [successEmbed(`⭐ ตั้ง Starboard เป็น ${channel} แล้ว!`)] });
      return;
    }

    if (sub === 'disable') {
      await setGuildConfig(guild.id, 'starboardChannel', null);
      await interaction.reply({ embeds: [successEmbed('ปิด Starboard แล้ว')] });
      return;
    }

    if (sub === 'top') {
      const { getTopStarred } = await import('../utils/database.js');
      const top = await getTopStarred(guild.id, 10);
      if (!top.length) {
        return interaction.reply({ embeds: [infoEmbed('⭐ Starboard', 'ยังไม่มีข้อมูล')] });
      }
      const lines = top.map((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        return `${medal} ⭐ ${s.star_count} — <@${s.author_id}> (msg \`${s.original_message_id}\`)`;
      });
      await interaction.reply({ embeds: [baseEmbed('⭐ Top Starred Messages', lines.join('\n'))] });
      return;
    }
  }
}
