/**
 * Ticket Manager — Full ticket lifecycle management.
 * Create, close, claim, transfer, rename, add/remove members.
 */
import { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  createTicket,
  getTicketByChannel,
  getOpenTicketsByUser,
  claimTicket as dbClaimTicket,
  transferTicket as dbTransferTicket,
  closeTicket as dbCloseTicket,
  getTicketById,
  updateTicketChannel,
  incrementStaffClaimed,
  incrementStaffClosed,
  recordStaffResponseTime,
  getGuildConfig,
} from '../utils/database.js';
import { generateTranscript, sendTranscriptToChannel } from './transcript.js';
import { logger } from '../utils/logger.js';

/**
 * Create a new ticket channel and database record.
 */
export async function openTicket(guild, user, options = {}) {
  const { category = 'general', subject = '', panelConfig = null } = options;

  // Check per-user open ticket limit
  const userTickets = await getOpenTicketsByUser(guild.id, user.id);
  const maxPerUser = panelConfig?.maxOpen || 3;
  if (userTickets.length >= maxPerUser) {
    throw new Error(`You already have ${userTickets.length} open ticket(s) (max ${maxPerUser})`);
  }

  // Determine parent category
  const parentId = panelConfig?.parentCategory || null;
  const staffRoleId = getGuildConfig(guild.id, 'ticketStaffRole');

  // Create the channel
  const channelName = `ticket-${category}-${user.id.slice(-4)}`;
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ];
  if (staffRoleId) {
    overwrites.push({
      id: staffRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }
  // If panel has a specific staff role for this category
  if (panelConfig?.categories) {
    const cat = panelConfig.categories.find((c) => c.id === category);
    if (cat?.staffRole && cat.staffRole !== staffRoleId) {
      overwrites.push({
        id: cat.staffRole,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }
  }

  const createOpts = {
    name: channelName,
    type: ChannelType.GuildText,
    topic: `Ticket #${Date.now().toString(36)} | ${user.tag} | ${category}`,
    permissionOverwrites: overwrites,
    reason: `Ticket by ${user.tag}: ${subject || category}`,
  };
  if (parentId) createOpts.parent = parentId;

  const channel = await guild.channels.create(createOpts);

  // Create DB record
  const ticketId = await createTicket(guild.id, user.id, channel.id, category, subject);

  // Send welcome message with action buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('🙋 Claim').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('🔒 Close').setStyle(ButtonStyle.Danger),
  );

  const welcomeParts = [
    `${user} Welcome! Your ticket **#${ticketId}** has been opened.`,
    subject ? `**Subject:** ${subject}` : '',
    `**Category:** ${category}`,
    '',
    'A staff member will be with you shortly. Use the buttons below:',
    '- 🙋 **Claim** — Staff can claim this ticket',
    '- 🔒 **Close** — Close the ticket when resolved',
  ].filter(Boolean);

  await channel.send({ content: welcomeParts.join('\n'), components: [row] });

  return { ticketId, channel };
}

/**
 * Claim a ticket (staff takes ownership).
 */
export async function claimTicketByStaff(guild, ticketId, staffMember) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error('Ticket not found');
  if (ticket.status === 'closed') throw new Error('Ticket is already closed');
  if (ticket.claimedBy === staffMember.id) throw new Error('You already claimed this ticket');

  // Record response time (time between creation and first claim)
  const responseMs = Date.now() - ticket.createdAt;
  await dbClaimTicket(ticketId, staffMember.id);
  await incrementStaffClaimed(guild.id, staffMember.id);
  await recordStaffResponseTime(guild.id, staffMember.id, responseMs);

  // Update channel topic
  if (ticket.channelId) {
    const channel = guild.channels.cache.get(ticket.channelId);
    if (channel) {
      await channel.setTopic(`Ticket #${ticketId} | Claimed by ${staffMember.user.tag}`, '[Ticket Claim]').catch(() => {});
    }
  }

  return { ticket, responseMs };
}

/**
 * Transfer a ticket to another staff member.
 */
export async function transferTicketToStaff(guild, ticketId, newStaffMember) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error('Ticket not found');
  if (ticket.status === 'closed') throw new Error('Ticket is already closed');

  await dbTransferTicket(ticketId, newStaffMember.id);

  if (ticket.channelId) {
    const channel = guild.channels.cache.get(ticket.channelId);
    if (channel) {
      await channel.setTopic(`Ticket #${ticketId} | Transferred to ${newStaffMember.user.tag}`, '[Ticket Transfer]').catch(() => {});
    }
  }

  return ticket;
}

/**
 * Close a ticket: generate transcript, delete channel, update stats.
 */
export async function closeTicketById(guild, ticketId, closedBy, reason) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error('Ticket not found');
  if (ticket.status === 'closed') throw new Error('Ticket is already closed');

  await dbCloseTicket(ticketId, closedBy, reason);

  // Increment closed stat for the staff who handled it
  if (ticket.claimedBy) {
    await incrementStaffClosed(guild.id, ticket.claimedBy);
  }

  // Generate and send transcript
  if (ticket.channelId) {
    const channel = guild.channels.cache.get(ticket.channelId);
    if (channel) {
      try {
        const transcript = await generateTranscript(guild, channel, ticket);
        // Find transcript channel
        const panelConfigs = await import('../utils/database.js').then((m) => m.getGuildPanels(guild.id));
        const transcriptChannelId = panelConfigs.find((p) => p.transcriptChannel)?.transcriptChannel;
        if (transcriptChannelId) {
          await sendTranscriptToChannel(guild, transcriptChannelId, ticket, transcript, closedBy, reason);
        }
      } catch (err) {
        logger.error('Transcript generation failed', err);
      }

      // Delete the channel after a delay
      setTimeout(() => channel.delete().catch(() => {}), 3000);
    }
  }

  return ticket;
}

/**
 * Rename a ticket channel.
 */
export async function renameTicketChannel(guild, ticketId, newName) {
  const ticket = await getTicketById(ticketId);
  if (!ticket || !ticket.channelId) throw new Error('Ticket or channel not found');

  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) throw new Error('Channel not found');

  await channel.setName(`ticket-${newName}`, `[Ticket Rename] by admin`);
  return ticket;
}

/**
 * Add a user to a ticket channel.
 */
export async function addMemberToTicket(guild, ticketId, member) {
  const ticket = await getTicketById(ticketId);
  if (!ticket || !ticket.channelId) throw new Error('Ticket or channel not found');

  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) throw new Error('Channel not found');

  await channel.permissionOverwrites.edit(member.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  }, { reason: `Added to ticket #${ticketId}` });

  const { addTicketParticipant } = await import('../utils/database.js');
  await addTicketParticipant(ticketId, member.id);

  return ticket;
}

/**
 * Remove a user from a ticket channel.
 */
export async function removeMemberFromTicket(guild, ticketId, member) {
  const ticket = await getTicketById(ticketId);
  if (!ticket || !ticket.channelId) throw new Error('Ticket or channel not found');

  const channel = guild.channels.cache.get(ticket.channelId);
  if (!channel) throw new Error('Channel not found');

  await channel.permissionOverwrites.delete(member.id, `Removed from ticket #${ticketId}`);
  return ticket;
}
