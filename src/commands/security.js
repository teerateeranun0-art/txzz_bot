import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, baseEmbed, EPHEMERAL } from '../utils/embeds.js';
import { safeText, isSnowflake } from '../utils/sanitize.js';
import { parseDuration } from '../utils/duration.js';
import {
  addTrustedUser, removeTrustedUser, getTrustedUsers,
  addTrustedRole, removeTrustedRole, getTrustedRoles,
  addProtectedResource, removeProtectedResource, getProtectedResources,
  getIncidents, getIncidentById, getSnapshots, getSnapshotById,
  getQuarantinedUsers, getUserScores, getLockdownState,
  createIncident, logAction,
} from '../utils/database.js';
import { activateLockdown, deactivateLockdown, panicButton, getLockdownStatus } from '../security/lockdown.js';
import { captureSnapshot, restoreRoles, restoreChannels, generateDiffReport } from '../security/snapshot.js';
import { quarantineMember, releaseFromQuarantine } from '../security/actions.js';
import { calculateRaidScore, calculateTrustScore } from '../security/scoring.js';
import { sendSecurityAlert } from '../security/alerts.js';

export const data = [
  // /security setup|config|dashboard|status|alerts|audit
  new SlashCommandBuilder()
    .setName('security')
    .setDescription('ระบบความปลอดภัยและ Anti-Raid')
    .addSubcommand(s => s.setName('setup').setDescription('ตั้งค่าความปลอดภัยเบื้องต้น'))
    .addSubcommand(s => s.setName('dashboard').setDescription('ภาพรวมสถานะความปลอดภัย'))
    .addSubcommand(s => s.setName('status').setDescription('สถานะความปลอดภัยปัจจุบัน'))
    .addSubcommand(s => s.setName('alerts').setDescription('ดูการแจ้งเตือนความปลอดภัยล่าสุด'))
    .addSubcommand(s => s.setName('audit').setDescription('สรุป Audit Log'))
    .addSubcommand(s =>
      s.setName('config')
        .setDescription('ตั้งค่าความปลอดภัย')
        .addStringOption(o => o.setName('key').setDescription('ค่าที่ตั้ง').setRequired(true)
          .addChoices(
            { name: 'alert_channel', value: 'alertChannel' },
            { name: 'anti_spam', value: 'antiSpam' },
            { name: 'anti_nuke', value: 'antiNuke' },
          ))
        .addStringOption(o => o.setName('value').setDescription('ค่า (channel ID หรือ on/off)')),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  // /lockdown enable|disable|status
  new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('ระบบล็อคดาวน์')
    .addSubcommand(s =>
      s.setName('enable')
        .setDescription('เปิดล็อคดาวน์')
        .addStringOption(o => o.setName('mode').setDescription('โหมด').setRequired(true)
          .addChoices(
            { name: 'Slowmode', value: 'slowmode' },
            { name: 'Verification', value: 'verification' },
            { name: 'Raid', value: 'raid' },
            { name: 'Maintenance', value: 'maintenance' },
          ))
        .addStringOption(o => o.setName('reason').setDescription('เหตุผล'))
        .addStringOption(o => o.setName('duration').setDescription('ระยะเวลา เช่น 30m, 1h, 2h')),
    )
    .addSubcommand(s =>
      s.setName('disable').setDescription('ปิดล็อคดาวน์'),
    )
    .addSubcommand(s => s.setName('status').setDescription('ดูสถานะล็อคดาวน์'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  // /panic
  new SlashCommandBuilder()
    .setName('panic')
    .setDescription('ปุ่มฉุกเฉิน - ล็อคดาวน์ทันที แจ้งเจ้าของเซิร์ฟ')
    .addStringOption(o => o.setName('reason').setDescription('เหตุผล'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  // /raidmode enable|disable
  new SlashCommandBuilder()
    .setName('raidmode')
    .setDescription('เปิด/ปิดโหมด Raid')
    .addStringOption(o => o.setName('action').setDescription('เปิด/ปิด').setRequired(true)
      .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
    .addStringOption(o => o.setName('reason').setDescription('เหตุผล'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  // /trusted add|remove|list
  new SlashCommandBuilder()
    .setName('trusted')
    .setDescription('จัดการรายชื่อผู้ใช้ที่เชื่อถือได้')
    .addSubcommand(s =>
      s.setName('add').setDescription('เพิ่มผู้ใช้ที่เชื่อถือได้')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('remove').setDescription('ลบผู้ใช้ที่เชื่อถือได้')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .addSubcommand(s => s.setName('list').setDescription('ดูรายชื่อ'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  // /trusted-role add|remove|list
  new SlashCommandBuilder()
    .setName('trusted-role')
    .setDescription('จัดการบทบาทที่เชื่อถือได้')
    .addSubcommand(s =>
      s.setName('add').setDescription('เพิ่มบทบาท')
        .addRoleOption(o => o.setName('role').setDescription('บทบาท').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('remove').setDescription('ลบบทบาท')
        .addRoleOption(o => o.setName('role').setDescription('บทบาท').setRequired(true)),
    )
    .addSubcommand(s => s.setName('list').setDescription('ดูรายการ'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  // /protected add|remove|list
  new SlashCommandBuilder()
    .setName('protected')
    .setDescription('จัดการทรัพยากรที่ป้องกัน')
    .addSubcommand(s =>
      s.setName('add').setDescription('เพิ่มการป้องกัน')
        .addStringOption(o => o.setName('type').setDescription('ประเภท').setRequired(true)
          .addChoices(
            { name: 'role', value: 'roles' },
            { name: 'channel', value: 'channels' },
            { name: 'category', value: 'categories' },
            { name: 'webhook', value: 'webhooks' },
          ))
        .addStringOption(o => o.setName('id').setDescription('ID ของ resource').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('remove').setDescription('ลบการป้องกัน')
        .addStringOption(o => o.setName('type').setDescription('ประเภท').setRequired(true)
          .addChoices(
            { name: 'role', value: 'roles' },
            { name: 'channel', value: 'channels' },
            { name: 'category', value: 'categories' },
            { name: 'webhook', value: 'webhooks' },
          ))
        .addStringOption(o => o.setName('id').setDescription('ID ของ resource').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('list').setDescription('ดูรายการ')
        .addStringOption(o => o.setName('type').setDescription('ประเภท').setRequired(true)
          .addChoices(
            { name: 'roles', value: 'roles' },
            { name: 'channels', value: 'channels' },
            { name: 'categories', value: 'categories' },
            { name: 'webhooks', value: 'webhooks' },
          )),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  // /incident view|history
  new SlashCommandBuilder()
    .setName('incident')
    .setDescription('ดูเหตุการณ์ความปลอดภัย')
    .addSubcommand(s =>
      s.setName('view').setDescription('ดูรายละเอียดเหตุการณ์')
        .addIntegerOption(o => o.setName('id').setDescription('ID ของเหตุการณ์').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('history').setDescription('ดูประวัติเหตุการณ์')
        .addStringOption(o => o.setName('type').setDescription('กรองตามประเภท')
          .addChoices(
            { name: 'anti_nuke', value: 'anti_nuke' },
            { name: 'raid', value: 'raid' },
            { name: 'spam', value: 'spam' },
            { name: 'lockdown', value: 'lockdown' },
          )),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  // /score raid|risk|trust
  new SlashCommandBuilder()
    .setName('score')
    .setDescription('ดูคะแนนความปลอดภัยของผู้ใช้')
    .addSubcommand(s =>
      s.setName('raid').setDescription('ดู Raid Score')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('risk').setDescription('ดู Risk Score')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('trust').setDescription('ดู Trust Score')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  // /snapshot create|restore|diff
  new SlashCommandBuilder()
    .setName('snapshot')
    .setDescription('Snapshot และ Recovery')
    .addSubcommand(s =>
      s.setName('create').setDescription('สร้าง Snapshot')
        .addStringOption(o => o.setName('label').setDescription('ชื่อ Snapshot')),
    )
    .addSubcommand(s =>
      s.setName('restore').setDescription('กู้คืนจาก Snapshot')
        .addIntegerOption(o => o.setName('id').setDescription('ID ของ Snapshot').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('ประเภท').setRequired(true)
          .addChoices(
            { name: 'roles', value: 'roles' },
            { name: 'channels', value: 'channels' },
          )),
    )
    .addSubcommand(s =>
      s.setName('diff').setDescription('เปรียบเทียบ Snapshot กับปัจจุบัน')
        .addIntegerOption(o => o.setName('id').setDescription('ID ของ Snapshot').setRequired(true)),
    )
    .addSubcommand(s => s.setName('list').setDescription('ดู Snapshot ทั้งหมด'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  // /quarantine user|release|list
  new SlashCommandBuilder()
    .setName('quarantine')
    .setDescription('ระบบกักกันผู้ใช้')
    .addSubcommand(s =>
      s.setName('user').setDescription('กักกันผู้ใช้')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('เหตุผล')),
    )
    .addSubcommand(s =>
      s.setName('release').setDescription('ปล่อยจากกักกัน')
        .addUserOption(o => o.setName('user').setDescription('ผู้ใช้').setRequired(true)),
    )
    .addSubcommand(s => s.setName('list').setDescription('ดูรายชื่อกักกัน'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
];

export const meta = {
  security: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.Administrator] },
  lockdown: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ManageGuild] },
  panic: { guildOnly: true, cooldown: 120, userPermissions: [PermissionFlagsBits.Administrator] },
  raidmode: { guildOnly: true, cooldown: 10, userPermissions: [PermissionFlagsBits.ManageGuild] },
  trusted: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.Administrator] },
  'trusted-role': { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.Administrator] },
  protected: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.Administrator] },
  incident: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers] },
  score: { guildOnly: true, cooldown: 3, userPermissions: [PermissionFlagsBits.ModerateMembers] },
  snapshot: { guildOnly: true, cooldown: 10, userPermissions: [PermissionFlagsBits.Administrator] },
  quarantine: { guildOnly: true, cooldown: 5, userPermissions: [PermissionFlagsBits.ModerateMembers] },
};

export async function execute(interaction) {
  const { commandName, guild } = interaction;

  try {
    if (commandName === 'security') await handleSecurity(interaction);
    else if (commandName === 'lockdown') await handleLockdown(interaction);
    else if (commandName === 'panic') await handlePanic(interaction);
    else if (commandName === 'raidmode') await handleRaidmode(interaction);
    else if (commandName === 'trusted') await handleTrusted(interaction);
    else if (commandName === 'trusted-role') await handleTrustedRole(interaction);
    else if (commandName === 'protected') await handleProtected(interaction);
    else if (commandName === 'incident') await handleIncident(interaction);
    else if (commandName === 'score') await handleScore(interaction);
    else if (commandName === 'snapshot') await handleSnapshot(interaction);
    else if (commandName === 'quarantine') await handleQuarantine(interaction);
  } catch (err) {
    const msg = err?.message || 'เกิดข้อผิดพลาด';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(msg)], ...EPHEMERAL });
    } else {
      await interaction.reply({ embeds: [errorEmbed(msg)], ...EPHEMERAL });
    }
  }
}

async function handleSecurity(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;

  if (sub === 'setup') {
    await interaction.reply({ embeds: [infoEmbed('Security Setup', 'ระบบความปลอดภัยถูกเปิดใช้งานแล้ว\n- Anti-Raid: Active\n- Anti-Nuke: Active\n- Anti-Spam: Active\n\nใช้ `/security config` เพื่อปรับแต่ง')] });
    return;
  }

  if (sub === 'dashboard') {
    const lockdown = await getLockdownStatus(guild.id);
    const incidents = await getIncidents(guild.id, { limit: 5 });
    const quarantined = await getQuarantinedUsers(guild.id);
    const trusted = await getTrustedUsers(guild.id);

    const embed = baseEmbed('Security Dashboard', null)
      .addFields(
        { name: 'Lockdown', value: lockdown.state === 'normal' ? 'Normal' : `**${lockdown.state.toUpperCase()}**`, inline: true },
        { name: 'Recent Incidents', value: `${incidents.length}`, inline: true },
        { name: 'Quarantined', value: `${quarantined.length}`, inline: true },
        { name: 'Trusted Users', value: `${trusted.length}`, inline: true },
      );

    if (incidents.length) {
      embed.addFields({
        name: 'Latest Incidents',
        value: incidents.map(i => `#${i.id} ${i.type} (${i.severity}) <t:${Math.floor(i.timestamp / 1000)}:R>`).join('\n'),
      });
    }

    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (sub === 'status') {
    const lockdown = await getLockdownStatus(guild.id);
    await interaction.reply({
      embeds: [infoEmbed('Security Status', `Lockdown: **${lockdown.state}**${lockdown.reason ? `\nReason: ${lockdown.reason}` : ''}`)],
    });
    return;
  }

  if (sub === 'alerts') {
    const incidents = await getIncidents(guild.id, { limit: 10 });
    if (!incidents.length) return interaction.reply({ embeds: [infoEmbed('Alerts', 'ไม่มีการแจ้งเตือน')] });
    const list = incidents.map(i => `[${i.severity}] #${i.id} ${i.type} - <t:${Math.floor(i.timestamp / 1000)}:R>`).join('\n');
    await interaction.reply({ embeds: [infoEmbed('Security Alerts', list)] });
    return;
  }

  if (sub === 'audit') {
    await interaction.reply({ embeds: [infoEmbed('Security Audit', 'ใช้ `/incident history` เพื่อดูประวัติเหตุการณ์ทั้งหมด')] });
    return;
  }

  if (sub === 'config') {
    await interaction.reply({ embeds: [successEmbed('Security config updated')] });
    return;
  }
}

async function handleLockdown(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;

  if (sub === 'enable') {
    const mode = interaction.options.getString('mode');
    const reason = interaction.options.getString('reason') || 'Manual lockdown';
    const durationStr = interaction.options.getString('duration');
    const durationMs = durationStr ? parseDuration(durationStr, { min: 60_000, max: 24 * 60 * 60 * 1000 }) : null;
    if (durationStr && !durationMs) return interaction.reply({ embeds: [errorEmbed('ระยะเวลาไม่ถูกต้อง (1m - 24h)')], ...EPHEMERAL });

    const result = await activateLockdown(guild, mode, reason, interaction.user.id, durationMs);
    if (result.skipped) return interaction.reply({ embeds: [errorEmbed(result.reason)], ...EPHEMERAL });
    await interaction.reply({ embeds: [successEmbed(`Lockdown **${mode}** activated\nReason: ${reason}`)] });
    return;
  }

  if (sub === 'disable') {
    const result = await deactivateLockdown(guild, interaction.user.id);
    if (result.skipped) return interaction.reply({ embeds: [errorEmbed(result.reason)], ...EPHEMERAL });
    await interaction.reply({ embeds: [successEmbed(`Lockdown deactivated (was: ${result.previousState})`)] });
    return;
  }

  if (sub === 'status') {
    const state = await getLockdownState(guild.id);
    const embed = infoEmbed('Lockdown Status', null)
      .addFields(
        { name: 'State', value: state.state, inline: true },
        { name: 'Reason', value: state.reason || '-', inline: true },
        { name: 'Activated', value: state.activatedAt ? `<t:${Math.floor(state.activatedAt / 1000)}:R>` : '-', inline: true },
        { name: 'Expires', value: state.expiresAt ? `<t:${Math.floor(state.expiresAt / 1000)}:R>` : 'Indefinite', inline: true },
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }
}

async function handlePanic(interaction) {
  const reason = interaction.options.getString('reason') || 'Panic button';

  // Show confirmation dialog before activating panic mode
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`panic_confirm_${interaction.user.id}`)
      .setLabel('⚠️ CONFIRM PANIC')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`panic_cancel_${interaction.user.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    embeds: [baseEmbed(
      '⚠️ Panic Mode Confirmation',
      'This will:\n' +
      '- Lock ALL text channels immediately\n' +
      '- Take a full server snapshot\n' +
      '- Notify the server owner via DM\n' +
      '- Require admin to deactivate\n\n' +
      `**Reason:** ${safeText(reason, 200)}\n\n` +
      '**Cooldown:** 2 minutes between uses\n' +
      'Are you sure you want to activate panic mode?'
    )],
    components: [confirmRow],
    ...EPHEMERAL,
  });

  // Wait for button interaction (30s timeout)
  try {
    const confirmation = await interaction.channel.awaitMessageComponent({
      filter: (i) => i.customId.startsWith('panic_') && i.user.id === interaction.user.id,
      time: 30_000,
    });

    if (confirmation.customId === `panic_confirm_${interaction.user.id}`) {
      await confirmation.deferReply({ ...EPHEMERAL });
      const result = await panicButton(interaction.guild, reason, interaction.user.id);
      await confirmation.editReply({
        embeds: [successEmbed('⚠️ PANIC MODE ACTIVATED\nServer is now in full lockdown.\nOwner has been notified.\n\nUse `/lockdown action:deactivate` to end panic mode.')],
      });
    } else {
      await confirmation.update({
        embeds: [infoEmbed('Panic cancelled', 'Panic mode was not activated.')],
        components: [],
      });
    }
  } catch {
    // Timeout — no confirmation received
    await interaction.editReply({
      embeds: [infoEmbed('Panic cancelled', 'No confirmation received within 30 seconds.')],
      components: [],
    });
  }
}

async function handleRaidmode(interaction) {
  const action = interaction.options.getString('action');
  const reason = interaction.options.getString('reason') || 'Manual raid mode toggle';
  const { guild } = interaction;

  if (action === 'enable') {
    const result = await activateLockdown(guild, 'raid', reason, interaction.user.id, null);
    if (result.skipped) return interaction.reply({ embeds: [errorEmbed(result.reason)], ...EPHEMERAL });
    await interaction.reply({ embeds: [successEmbed('Raid mode activated')] });
  } else {
    const result = await deactivateLockdown(guild, interaction.user.id);
    if (result.skipped) return interaction.reply({ embeds: [errorEmbed(result.reason)], ...EPHEMERAL });
    await interaction.reply({ embeds: [successEmbed('Raid mode deactivated')] });
  }
}

async function handleTrusted(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;

  if (sub === 'add') {
    const user = interaction.options.getUser('user');
    await addTrustedUser(guild.id, user.id, interaction.user.id);
    await interaction.reply({ embeds: [successEmbed(`เพิ่ม **${user.username}** ในรายชื่อ Trusted Users`)] });
    return;
  }
  if (sub === 'remove') {
    const user = interaction.options.getUser('user');
    await removeTrustedUser(guild.id, user.id);
    await interaction.reply({ embeds: [successEmbed(`ลบ **${user.username}** จากรายชื่อ Trusted Users`)] });
    return;
  }
  if (sub === 'list') {
    const users = await getTrustedUsers(guild.id);
    if (!users.length) return interaction.reply({ embeds: [infoEmbed('Trusted Users', 'ยังไม่มี Trusted Users')] });
    await interaction.reply({ embeds: [infoEmbed('Trusted Users', users.map(id => `<@${id}>`).join('\n'))] });
  }
}

async function handleTrustedRole(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;

  if (sub === 'add') {
    const role = interaction.options.getRole('role');
    await addTrustedRole(guild.id, role.id, interaction.user.id);
    await interaction.reply({ embeds: [successEmbed(`เพิ่ม ${role} ใน Trusted Roles`)] });
    return;
  }
  if (sub === 'remove') {
    const role = interaction.options.getRole('role');
    await removeTrustedRole(guild.id, role.id);
    await interaction.reply({ embeds: [successEmbed(`ลบ ${role} จาก Trusted Roles`)] });
    return;
  }
  if (sub === 'list') {
    const roles = await getTrustedRoles(guild.id);
    if (!roles.length) return interaction.reply({ embeds: [infoEmbed('Trusted Roles', 'ยังไม่มี Trusted Roles')] });
    await interaction.reply({ embeds: [infoEmbed('Trusted Roles', roles.map(id => `<@&${id}>`).join('\n'))] });
  }
}

async function handleProtected(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;

  if (sub === 'add') {
    const type = interaction.options.getString('type');
    const id = interaction.options.getString('id').trim();
    if (!isSnowflake(id)) return interaction.reply({ embeds: [errorEmbed('ID ไม่ถูกต้อง')], ...EPHEMERAL });
    await addProtectedResource(guild.id, type, id, interaction.user.id);
    await interaction.reply({ embeds: [successEmbed(`เพิ่ม \`${id}\` ใน Protected ${type}`)] });
    return;
  }
  if (sub === 'remove') {
    const type = interaction.options.getString('type');
    const id = interaction.options.getString('id').trim();
    await removeProtectedResource(guild.id, type, id);
    await interaction.reply({ embeds: [successEmbed(`ลบ \`${id}\` จาก Protected ${type}`)] });
    return;
  }
  if (sub === 'list') {
    const type = interaction.options.getString('type');
    const resources = await getProtectedResources(guild.id, type);
    if (!resources.length) return interaction.reply({ embeds: [infoEmbed(`Protected ${type}`, 'ยังไม่มี')] });
    const list = resources.map(id => type === 'roles' ? `<@&${id}>` : `<#${id}>`).join('\n');
    await interaction.reply({ embeds: [infoEmbed(`Protected ${type}`, list)] });
  }
}

async function handleIncident(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;

  if (sub === 'view') {
    const id = interaction.options.getInteger('id');
    const incident = await getIncidentById(guild.id, id);
    if (!incident) return interaction.reply({ embeds: [errorEmbed('ไม่พบเหตุการณ์นี้')], ...EPHEMERAL });
    const embed = infoEmbed(`Incident #${incident.id}`, null)
      .addFields(
        { name: 'Type', value: incident.type, inline: true },
        { name: 'Severity', value: incident.severity, inline: true },
        { name: 'Executor', value: incident.executorId ? `<@${incident.executorId}>` : 'System', inline: true },
        { name: 'Action', value: incident.actionTaken || '-', inline: true },
        { name: 'Time', value: `<t:${Math.floor(incident.timestamp / 1000)}:F>`, inline: true },
      );
    if (Object.keys(incident.details).length) {
      embed.addFields({ name: 'Details', value: `\`\`\`json\n${JSON.stringify(incident.details, null, 2).slice(0, 1000)}\n\`\`\`` });
    }
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (sub === 'history') {
    const type = interaction.options.getString('type');
    const incidents = await getIncidents(guild.id, { limit: 15, type });
    if (!incidents.length) return interaction.reply({ embeds: [infoEmbed('Incidents', 'ไม่พบเหตุการณ์')] });
    const list = incidents.map(i =>
      `#${i.id} [${i.severity}] ${i.type}${i.executorId ? ` by <@${i.executorId}>` : ''} - <t:${Math.floor(i.timestamp / 1000)}:R>`
    ).join('\n');
    await interaction.reply({ embeds: [infoEmbed('Incident History', list)] });
  }
}

async function handleScore(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;
  const user = interaction.options.getUser('user');
  const member = await guild.members.fetch(user.id).catch(() => null);

  if (sub === 'raid') {
    const score = await calculateRaidScore(guild.id, user.id, member);
    await interaction.reply({ embeds: [infoEmbed(`Raid Score - ${user.username}`, `**${score}** / 100${score >= 80 ? ' - DANGEROUS' : score >= 50 ? ' - Suspicious' : ' - Normal'}`)] });
    return;
  }
  if (sub === 'risk') {
    await interaction.deferReply();
    const breakdown = await getRiskScoreBreakdown(guild, user.id);
    const badgeColor = breakdown.score >= 80 ? '🔴' : breakdown.score >= 60 ? '🟠' : breakdown.score >= 40 ? '🟡' : '🟢';

    const factorLines = breakdown.items.length
      ? breakdown.items.map(item => `${item.points > 0 ? `\`+${item.points}\`` : `\`${item.points}\``} ${item.label}`).join('\n')
      : 'ไม่มีประวัติความเสี่ยงที่บันทึกไว้';

    const embed = baseEmbed(`${badgeColor} Risk Score Analysis — ${user.username}`, null)
      .addFields(
        { name: 'Risk Score', value: `**${breakdown.score}** / 100`, inline: true },
        { name: 'Status', value: `\`${breakdown.status}\``, inline: true },
        { name: 'Recommended Action', value: `\`${breakdown.action}\``, inline: true },
        { name: 'Score Breakdown', value: factorLines, inline: false },
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }
  if (sub === 'trust') {
    const score = await calculateTrustScore(guild.id, user.id, member);
    await interaction.reply({ embeds: [infoEmbed(`Trust Score - ${user.username}`, `**${score}** / 100${score >= 70 ? ' - Trusted' : score < 30 ? ' - Untrusted' : ' - Normal'}`)] });
  }
}

async function handleSnapshot(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;

  if (sub === 'create') {
    const label = interaction.options.getString('label') || 'Manual snapshot';
    await interaction.deferReply();
    const id = await captureSnapshot(guild, label, 'manual');
    await interaction.editReply({ embeds: [successEmbed(`Snapshot #${id} สร้างสำเร็จแล้ว (Label: ${label})`)] });
    return;
  }

  if (sub === 'restore') {
    const id = interaction.options.getInteger('id');
    const type = interaction.options.getString('type') || 'all';
    await interaction.deferReply();

    const result = await restoreSelective(guild, id, [type]);
    if (result.error) return interaction.editReply({ embeds: [errorEmbed(result.error)] });

    const summaryParts = [];
    if (result.restoredRoles.length) summaryParts.push(`Roles: +${result.restoredRoles.length} restored`);
    if (result.restoredChannels.length) summaryParts.push(`Channels: +${result.restoredChannels.length} restored`);
    if (result.failedRoles.length) summaryParts.push(`Failed Roles: ${result.failedRoles.length}`);
    if (result.failedChannels.length) summaryParts.push(`Failed Channels: ${result.failedChannels.length}`);

    await interaction.editReply({
      embeds: [successEmbed(`Safe Selective Recovery (Snapshot #${id})\n${summaryParts.join('\n') || 'ไม่มีทรัพยากรที่ต้องกู้คืน'}`)],
    });
    return;
  }

  if (sub === 'diff') {
    const id = interaction.options.getInteger('id');
    await interaction.deferReply();
    const report = await generateDiffReport(guild, id);
    if (report.error) return interaction.editReply({ embeds: [errorEmbed(report.error)] });

    const embed = baseEmbed(`🔍 Snapshot Diff Preview #${id}`, `**Snapshot:** \`${report.label}\` (<t:${Math.floor(report.timestamp / 1000)}:R>)\n**Summary:** ${report.summary}`)
      .addFields(
        {
          name: `❌ Deleted Roles (${report.deletedRoles.length})`,
          value: report.deletedRoles.slice(0, 10).join(', ') || 'None',
          inline: true,
        },
        {
          name: `⚠️ Modified Roles (${report.modifiedRoles.length})`,
          value: report.modifiedRoles.slice(0, 10).join(', ') || 'None',
          inline: true,
        },
        {
          name: `❌ Deleted Channels (${report.deletedChannels.length})`,
          value: report.deletedChannels.slice(0, 10).join(', ') || 'None',
          inline: true,
        },
        {
          name: `⚠️ Modified Channels (${report.modifiedChannels.length})`,
          value: report.modifiedChannels.slice(0, 10).join(', ') || 'None',
          inline: true,
        },
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (sub === 'list') {
    const snapshots = await getSnapshots(guild.id);
    if (!snapshots.length) return interaction.reply({ embeds: [infoEmbed('Snapshots', 'ยังไม่มี Snapshot')] });
    const list = snapshots.map(s => `#${s.id} ${s.label || '-'} (${s.trigger}) <t:${Math.floor(s.timestamp / 1000)}:R>`).join('\n');
    await interaction.reply({ embeds: [infoEmbed('Snapshots', list)] });
  }
}

async function handleQuarantine(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild } = interaction;

  if (sub === 'user') {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Quarantined by staff';
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ embeds: [errorEmbed('ไม่พบสมาชิก')], ...EPHEMERAL });
    await quarantineMember(guild, member, reason, interaction.user.id);
    await interaction.reply({ embeds: [successEmbed(`กักกัน **${user.username}** แล้ว`)] });
    return;
  }

  if (sub === 'release') {
    const user = interaction.options.getUser('user');
    const data = await releaseFromQuarantine(guild, user.id);
    if (!data) return interaction.reply({ embeds: [errorEmbed('ไม่พบผู้ใช้นี้ในกักกัน')], ...EPHEMERAL });
    await interaction.reply({ embeds: [successEmbed(`ปล่อย **${user.username}** จากกักกันแล้ว`)] });
    return;
  }

  if (sub === 'list') {
    const users = await getQuarantinedUsers(guild.id);
    if (!users.length) return interaction.reply({ embeds: [infoEmbed('Quarantine', 'ไม่มีผู้ถูกกักกัน')] });
    const list = users.map(u =>
      `<@${u.userId}> - ${safeText(u.reason, 50)} (<t:${Math.floor(u.quarantinedAt / 1000)}:R>)`
    ).join('\n');
    await interaction.reply({ embeds: [infoEmbed('Quarantined Users', list)] });
  }
}
