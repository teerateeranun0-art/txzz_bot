import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, baseEmbed, EPHEMERAL } from '../utils/embeds.js';
import { getSecurityConfig, setSecurityConfig, addAutomodFilter, removeAutomodFilter, getAutomodFilters } from '../utils/database.js';
import { invalidateFilterCache } from '../moderation/automod-engine.js';
import { safeText } from '../utils/sanitize.js';

export const data = [
  new SlashCommandBuilder()
    .setName('automod')
    .setDescription('ตั้งค่า Anti-Spam และ Auto-Filter')
    .addSubcommand(s =>
      s.setName('spam')
        .setDescription('ตั้งค่า Anti-Spam')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
        .addIntegerOption(o => o.setName('max_messages').setDescription('จำนวนข้อความสูงสุด').setMinValue(3).setMaxValue(30))
        .addIntegerOption(o => o.setName('window').setDescription('ช่วงเวลา (วินาที)').setMinValue(3).setMaxValue(60)),
    )
    .addSubcommand(s =>
      s.setName('flood')
        .setDescription('ตั้งค่า Anti-Flood')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
        .addIntegerOption(o => o.setName('max_messages').setDescription('จำนวนข้อความสูงสุด').setMinValue(5).setMaxValue(50))
        .addIntegerOption(o => o.setName('window').setDescription('ช่วงเวลา (วินาที)').setMinValue(3).setMaxValue(30)),
    )
    .addSubcommand(s =>
      s.setName('caps')
        .setDescription('ตั้งค่า Anti-Caps')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
        .addIntegerOption(o => o.setName('threshold').setDescription('เปอร์เซ็นต์ตัวพิมพ์ใหญ่ (50-100)').setMinValue(50).setMaxValue(100)),
    )
    .addSubcommand(s =>
      s.setName('emoji')
        .setDescription('ตั้งค่า Anti-Emoji Spam')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
        .addIntegerOption(o => o.setName('limit').setDescription('จำนวนอิโมจิสูงสุด').setMinValue(3).setMaxValue(30)),
    )
    .addSubcommand(s =>
      s.setName('links')
        .setDescription('ตั้งค่า Link Filter')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })),
    )
    .addSubcommand(s =>
      s.setName('invites')
        .setDescription('ตั้งค่า Anti-Invite')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })),
    )
    .addSubcommand(s =>
      s.setName('mentions')
        .setDescription('ตั้งค่า Anti-Mass Mention')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
        .addIntegerOption(o => o.setName('limit').setDescription('จำนวน mention สูงสุด').setMinValue(2).setMaxValue(20)),
    )
    .addSubcommand(s =>
      s.setName('duplicates')
        .setDescription('ตั้งค่า Anti-Duplicate Messages')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })),
    )
    .addSubcommand(s =>
      s.setName('scam')
        .setDescription('ตั้งค่า Anti-Scam/Phishing')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })),
    )
    .addSubcommand(s =>
      s.setName('attachments')
        .setDescription('ตั้งค่า Anti-Suspicious Attachments')
        .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
          .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })),
    )
    .addSubcommand(s =>
      s.setName('status').setDescription('ดูสถานะ AutoMod ทั้งหมด'),
    )
    .addSubcommand(s =>
      s.setName('filter-add')
        .setDescription('เพิ่ม word/regex/domain filter')
        .addStringOption(o => o.setName('type').setDescription('ประเภท').setRequired(true)
          .addChoices(
            { name: 'Word', value: 'word' },
            { name: 'Regex', value: 'regex' },
            { name: 'Domain Blacklist', value: 'domain_blacklist' },
            { name: 'Domain Whitelist', value: 'domain_whitelist' },
          ))
        .addStringOption(o => o.setName('pattern').setDescription('คำ/regex/domain').setRequired(true).setMaxLength(500))
        .addStringOption(o => o.setName('action').setDescription('การดำเนินการ (word/regex only)')
          .addChoices(
            { name: 'Delete', value: 'delete' },
            { name: 'Warn', value: 'warn' },
            { name: 'Timeout', value: 'timeout' },
            { name: 'Kick', value: 'kick' },
            { name: 'Ban', value: 'ban' },
          ))
        .addBooleanOption(o => o.setName('case_sensitive').setDescription('Case sensitive (default: false)')),
    )
    .addSubcommand(s =>
      s.setName('filter-remove')
        .setDescription('ลบ filter')
        .addIntegerOption(o => o.setName('id').setDescription('Filter ID').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('filter-list')
        .setDescription('ดู filters ทั้งหมด')
        .addStringOption(o => o.setName('type').setDescription('กรองตามประเภท')
          .addChoices(
            { name: 'All', value: 'all' },
            { name: 'Word', value: 'word' },
            { name: 'Regex', value: 'regex' },
            { name: 'Domain Blacklist', value: 'domain_blacklist' },
            { name: 'Domain Whitelist', value: 'domain_whitelist' },
            { name: 'Role Whitelist', value: 'role_whitelist' },
            { name: 'Channel Whitelist', value: 'channel_whitelist' },
          )),
    )
    .addSubcommand(s =>
      s.setName('whitelist-role')
        .setDescription('เพิ่ม/ลบ role ที่ exempt จาก AutoMod')
        .addStringOption(o => o.setName('action').setDescription('เพิ่ม/ลบ').setRequired(true)
          .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }))
        .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('whitelist-channel')
        .setDescription('เพิ่ม/ลบ channel ที่ exempt จาก AutoMod')
        .addStringOption(o => o.setName('action').setDescription('เพิ่ม/ลบ').setRequired(true)
          .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }))
        .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
];

export const meta = {
  automod: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ManageGuild] },
};

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;

  try {
    const secConfig = await getSecurityConfig(guild.id);
    const automod = secConfig.automod || {};

    if (sub === 'status') {
      const fields = [
        { name: 'Anti-Spam', value: automod.spam?.enabled !== false ? 'ON' : 'OFF', inline: true },
        { name: 'Anti-Flood', value: automod.flood?.enabled !== false ? 'ON' : 'OFF', inline: true },
        { name: 'Anti-Caps', value: automod.caps?.enabled !== false ? 'ON' : 'OFF', inline: true },
        { name: 'Anti-Emoji', value: automod.emoji?.enabled !== false ? 'ON' : 'OFF', inline: true },
        { name: 'Link Filter', value: automod.links?.enabled !== false ? 'ON' : 'OFF', inline: true },
        { name: 'Anti-Invite', value: automod.invites?.enabled !== false ? 'ON' : 'OFF', inline: true },
        { name: 'Anti-Mention', value: automod.mentions?.enabled !== false ? 'ON' : 'OFF', inline: true },
        { name: 'Anti-Duplicate', value: automod.duplicates?.enabled !== false ? 'ON' : 'OFF', inline: true },
        { name: 'Anti-Scam', value: automod.scam?.enabled !== false ? 'ON' : 'OFF', inline: true },
        { name: 'Anti-Attachment', value: automod.attachments?.enabled !== false ? 'ON' : 'OFF', inline: true },
      ];

      await interaction.reply({
        embeds: [baseEmbed('AutoMod Status', null).addFields(fields)],
      });
      return;
    }

    // ── Filter management ──
    if (sub === 'filter-add') {
      const type = interaction.options.getString('type');
      const pattern = interaction.options.getString('pattern');
      const action = interaction.options.getString('action') || 'delete';
      const caseSensitive = interaction.options.getBoolean('case_sensitive') || false;
      const filterId = await addAutomodFilter(guild.id, type, pattern, {
        addedBy: interaction.user.id,
        action,
        caseSensitive,
      });
      invalidateFilterCache(guild.id);
      await interaction.reply({ embeds: [successEmbed(`เพิ่ม Filter #${filterId} [${type}]: \`${safeText(pattern, 100)}\` → ${action}`)] });
      return;
    }

    if (sub === 'filter-remove') {
      const filterId = interaction.options.getInteger('id');
      await removeAutomodFilter(guild.id, filterId);
      invalidateFilterCache(guild.id);
      await interaction.reply({ embeds: [successEmbed(`ลบ Filter #${filterId} แล้ว`)] });
      return;
    }

    if (sub === 'filter-list') {
      const typeFilter = interaction.options.getString('type');
      const filters = await getAutomodFilters(guild.id, typeFilter === 'all' ? null : typeFilter);
      if (!filters.length) return interaction.reply({ embeds: [infoEmbed('AutoMod Filters', 'ยังไม่มี filters')] });

      const list = filters.map((f) =>
        `**#${f.id}** [${f.type}] \`${safeText(f.pattern, 60)}\` → ${f.action}${f.caseSensitive ? ' (CS)' : ''}`
      ).join('\n');
      return interaction.reply({ embeds: [baseEmbed(`AutoMod Filters (${filters.length})`, list)] });
    }

    if (sub === 'whitelist-role') {
      const action = interaction.options.getString('action');
      const role = interaction.options.getRole('role');
      if (action === 'add') {
        await addAutomodFilter(guild.id, 'role_whitelist', role.id, { addedBy: interaction.user.id });
      } else {
        // Find and remove the filter matching this role
        const filters = await getAutomodFilters(guild.id, 'role_whitelist');
        const match = filters.find((f) => f.pattern === role.id);
        if (match) await removeAutomodFilter(guild.id, match.id);
      }
      invalidateFilterCache(guild.id);
      await interaction.reply({ embeds: [successEmbed(`${action === 'add' ? 'เพิ่ม' : 'ลบ'} Role whitelist: **${role.name}**`)] });
      return;
    }

    if (sub === 'whitelist-channel') {
      const action = interaction.options.getString('action');
      const channel = interaction.options.getChannel('channel');
      if (action === 'add') {
        await addAutomodFilter(guild.id, 'channel_whitelist', channel.id, { addedBy: interaction.user.id });
      } else {
        const filters = await getAutomodFilters(guild.id, 'channel_whitelist');
        const match = filters.find((f) => f.pattern === channel.id);
        if (match) await removeAutomodFilter(guild.id, match.id);
      }
      invalidateFilterCache(guild.id);
      await interaction.reply({ embeds: [successEmbed(`${action === 'add' ? 'เพิ่ม' : 'ลบ'} Channel whitelist: **#${channel.name}**`)] });
      return;
    }

    // Handle enable/disable for each filter
    const action = interaction.options.getString('action');
    const enabled = action === 'enable';

    if (!automod[sub]) automod[sub] = {};
    automod[sub].enabled = enabled;

    // Handle extra options
    if (sub === 'spam') {
      const maxMsg = interaction.options.getInteger('max_messages');
      const window = interaction.options.getInteger('window');
      if (maxMsg) automod[sub].maxMessages = maxMsg;
      if (window) automod[sub].windowSec = window;
    }
    if (sub === 'flood') {
      const maxMsg = interaction.options.getInteger('max_messages');
      const window = interaction.options.getInteger('window');
      if (maxMsg) automod[sub].maxMessages = maxMsg;
      if (window) automod[sub].windowSec = window;
    }
    if (sub === 'caps') {
      const threshold = interaction.options.getInteger('threshold');
      if (threshold) automod[sub].threshold = threshold / 100;
    }
    if (sub === 'emoji') {
      const limit = interaction.options.getInteger('limit');
      if (limit) automod[sub].limit = limit;
    }
    if (sub === 'mentions') {
      const limit = interaction.options.getInteger('limit');
      if (limit) automod[sub].limit = limit;
    }

    secConfig.automod = automod;
    await setSecurityConfig(guild.id, secConfig);

    const status = enabled ? 'ENABLED' : 'DISABLED';
    await interaction.reply({
      embeds: [successEmbed(`AutoMod **${sub}** ${status}`)],
    });
  } catch (err) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    } else {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
  }
}
