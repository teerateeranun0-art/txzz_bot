import { Events, ChannelType, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed, EPHEMERAL } from '../utils/embeds.js';
import { memberHas, botHasInChannel, permissionNames } from '../utils/permissions.js';
import { getGuildConfig, getTicketPanel, getGuildPanels } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { userFacingError, mentionUsers, isSnowflake } from '../utils/sanitize.js';
import { openTicket, claimTicketByStaff, closeTicketById } from '../tickets/manager.js';
import { processFeedback, requestFeedback } from '../tickets/feedback.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction, client);
        return;
      }
      if (interaction.isButton()) {
        const id = interaction.customId;
        if (id === 'ticket_open') {
          await handleTicketOpen(interaction);
        } else if (id.startsWith('ticket_panel_open_')) {
          await handlePanelTicketOpen(interaction);
        } else if (id.startsWith('ticket_claim_')) {
          await handleTicketClaim(interaction);
        } else if (id.startsWith('ticket_close_')) {
          await handleTicketClose(interaction);
        } else if (id.startsWith('feedback_')) {
          await handleFeedback(interaction);
        }
      }
    } catch (err) {
      logger.error('interactionCreate', err);
    }
  },
};

import { rateLimiter } from '../security/rate-limiter.js';
import { metrics } from '../utils/metrics.js';
import { errorTracker } from '../utils/error-tracker.js';

async function handleCommand(interaction, client) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  // 1. Global User Rate Limit: Max 5 commands per 5 seconds
  const userRate = rateLimiter.check('__global__', 'cmd_user', interaction.user.id, 5000, 5);
  if (userRate.exceeded) {
    await interaction.reply({
      embeds: [errorEmbed('คุณส่งคำสั่งเร็วเกินไป โปรดรอสักครู่ (Global Rate Limit)')],
      ...EPHEMERAL,
    }).catch(() => {});
    return;
  }

  // 2. Guild Rate Limit: Max 30 commands per 5 seconds per server
  if (interaction.guild) {
    const guildRate = rateLimiter.check(interaction.guild.id, 'cmd_guild', '__guild__', 5000, 30);
    if (guildRate.exceeded) {
      await interaction.reply({
        embeds: [errorEmbed('เซิร์ฟเวอร์มีการเรียกใช้คำสั่งหนาแน่นเกินไป โปรดลองอีกครั้งในไม่กี่วินาที')],
        ...EPHEMERAL,
      }).catch(() => {});
      return;
    }
  }

  if (command.guildOnly && !interaction.guild) {
    await interaction.reply({
      embeds: [errorEmbed('คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์')],
      ...EPHEMERAL,
    });
    return;
  }

  if (command.userPermissions?.length) {
    if (!memberHas(interaction.member, command.userPermissions)) {
      await interaction.reply({
        embeds: [errorEmbed(`คุณต้องมีสิทธิ์ ${permissionNames(command.userPermissions)}`)],
        ...EPHEMERAL,
      });
      return;
    }
  }

  if (command.botPermissions?.length && interaction.guild) {
    const botMember = interaction.guild.members.me;
    const channel = interaction.channel;
    if (!botHasInChannel(channel, botMember, command.botPermissions)) {
      await interaction.reply({
        embeds: [errorEmbed(`บอทต้องมีสิทธิ์ ${permissionNames(command.botPermissions)} ในช่องนี้`)],
        ...EPHEMERAL,
      });
      return;
    }
  }

  const cooldownKey = `${interaction.user.id}:${interaction.commandName}`;
  const cooldownMs = (command.cooldown ?? 3) * 1000;
  const expires = client.cooldowns.get(cooldownKey);
  if (expires && Date.now() < expires) {
    const left = ((expires - Date.now()) / 1000).toFixed(1);
    await interaction.reply({
      embeds: [errorEmbed(`รอ ${left} วินาทีก่อนใช้คำสั่งนี้อีกครั้ง`)],
      ...EPHEMERAL,
    });
    return;
  }
  client.cooldowns.set(cooldownKey, Date.now() + cooldownMs);
  setTimeout(() => client.cooldowns.delete(cooldownKey), cooldownMs);

  const start = Date.now();
  try {
    await command.execute(interaction, client);
    const duration = Date.now() - start;
    metrics.recordCommand(interaction.commandName, duration);
  } catch (err) {
    const duration = Date.now() - start;
    metrics.recordCommand(interaction.commandName, duration);

    // Track error with standardized Error ID
    const errorEntry = errorTracker.capture(err, {
      guildId: interaction.guild?.id,
      userId: interaction.user.id,
      commandName: interaction.commandName,
    });

    const payload = {
      embeds: [
        errorEmbed(
          `เกิดข้อผิดพลาดในการทำงาน: ${userFacingError(err)}\n\n` +
          `🔍 **Error Reference:** \`${errorEntry.id}\`\n` +
          `*(แจ้งรหัสนี้ให้ผู้ดูแลเซิร์ฟเวอร์เพื่อตรวจสอบสาเหตุด้วยคำสั่ง \`/diagnose error\`)*`
        ),
      ],
      ...EPHEMERAL,
    };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch { /* interaction expired */ }
  }
}

async function handleTicketOpen(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('ใช้ได้เฉพาะในเซิร์ฟเวอร์')], ...EPHEMERAL });
    return;
  }

  const botMember = interaction.guild.members.me;
  if (!interaction.channel.permissionsFor(botMember)?.has([
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
  ])) {
    await interaction.reply({
      embeds: [errorEmbed('บอทไม่มีสิทธิ์สร้างช่อง Ticket')],
      ...EPHEMERAL,
    });
    return;
  }

  await interaction.deferReply({ ...EPHEMERAL });

  const ticketName = `ticket-${interaction.user.id}`;
  const existing = interaction.guild.channels.cache.find(c => c.name === ticketName);
  if (existing) {
    await interaction.editReply({ embeds: [errorEmbed(`คุณมี Ticket อยู่แล้ว: ${existing}`)] });
    return;
  }

  const openTickets = interaction.guild.channels.cache.filter(c => c.name?.startsWith('ticket-')).size;
  if (openTickets >= 15) {
    await interaction.editReply({ embeds: [errorEmbed('มี Ticket เปิดอยู่เต็มจำนวนแล้ว')] });
    return;
  }

  const staffRoleId = getGuildConfig(interaction.guild.id, 'ticketStaffRole');
  const overwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];
  if (isSnowflake(staffRoleId)) {
    overwrites.push({
      id: staffRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const channel = await interaction.guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: interaction.channel.parent,
    topic: `ticket-owner:${interaction.user.id}`,
    permissionOverwrites: overwrites,
    reason: `Ticket โดย ${interaction.user.id}`,
  });

  await channel.send({
    content: `${interaction.user} ยินดีต้อนรับ! ทีมงานจะมาช่วยเร็วๆ นี้\nเจ้าของ Ticket ใช้ \`/ticket close\` เพื่อปิดได้`,
    allowedMentions: mentionUsers(interaction.user.id),
  });
  await interaction.editReply({ content: `สร้าง Ticket แล้ว: ${channel}` });
}

/**
 * Handle ticket open from a panel button (ticket_panel_open_<category>).
 */
async function handlePanelTicketOpen(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('ใช้ได้เฉพาะในเซิร์ฟเวอร์')], ...EPHEMERAL });
    return;
  }

  const category = interaction.customId.replace('ticket_panel_open_', '');
  await interaction.deferReply({ ephemeral: true });

  try {
    // Try to find panel config for this category/channel
    const panels = await getGuildPanels(interaction.guild.id);
    const panel = panels.find((p) =>
      p.categories?.some((c) => c.id === category),
    );
    const panelConfig = panel
      ? {
          parentCategory: panel.parentCategory || null,
          categories: panel.categories,
          maxOpen: panel.maxOpen || 3,
        }
      : null;

    const { channel } = await openTicket(interaction.guild, interaction.user, {
      category,
      subject: '',
      panelConfig,
    });
    await interaction.editReply({ content: `สร้าง Ticket แล้ว: ${channel}` });
  } catch (err) {
    await interaction.editReply({ embeds: [errorEmbed(err.message)] });
  }
}

/**
 * Handle claim button (ticket_claim_<id>).
 */
async function handleTicketClaim(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('ใช้ได้เฉพาะในเซิร์ฟเวอร์')], ...EPHEMERAL });
    return;
  }

  const ticketId = parseInt(interaction.customId.replace('ticket_claim_', ''), 10);
  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await claimTicketByStaff(interaction.guild, ticketId, interaction.member);
    const responseMin = Math.floor(result.responseMs / 60000);
    await interaction.editReply({
      embeds: [successEmbed(`${interaction.member} claimed Ticket #${ticketId}\nFirst response: ${responseMin}m`)],
    });
    // Update the welcome message buttons
    try {
      await interaction.message.edit({
        components: [],
      });
    } catch { /* message might not be editable */ }
  } catch (err) {
    await interaction.editReply({ embeds: [errorEmbed(err.message)] });
  }
}

/**
 * Handle close button (ticket_close_<id>).
 */
async function handleTicketClose(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('ใช้ได้เฉพาะในเซิร์ฟเวอร์')], ...EPHEMERAL });
    return;
  }

  const ticketId = parseInt(interaction.customId.replace('ticket_close_', ''), 10);
  await interaction.deferReply({ ephemeral: true });

  try {
    const closed = await closeTicketById(interaction.guild, ticketId, interaction.user.id, 'Closed via button');
    // Request feedback from the owner
    await requestFeedback(interaction.client, interaction.guild, closed);
    await interaction.editReply({
      embeds: [successEmbed(`ปิด Ticket #${ticketId} แล้ว`)],
    });
  } catch (err) {
    await interaction.editReply({ embeds: [errorEmbed(err.message)] });
  }
}

/**
 * Handle feedback button (feedback_<rating>_<ticketId>).
 */
async function handleFeedback(interaction) {
  const parts = interaction.customId.split('_');
  // feedback_<rating>_<ticketId>
  const rating = parseInt(parts[1], 10);
  const ticketId = parseInt(parts[2], 10);

  if (isNaN(rating) || isNaN(ticketId)) {
    await interaction.reply({ content: 'Invalid feedback data.', ephemeral: true });
    return;
  }

  try {
    await processFeedback(interaction, ticketId, rating);
  } catch (err) {
    logger.error('handleFeedback error', err);
    await interaction.reply({ content: 'Error processing feedback.', ephemeral: true });
  }
}
