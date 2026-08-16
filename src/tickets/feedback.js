/**
 * Feedback — Post-ticket feedback collection via DM or button.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { addTicketFeedback, getTicketFeedback } from '../utils/database.js';
import { logger } from '../utils/logger.js';

/**
 * Send a feedback request to the ticket owner via DM.
 */
export async function requestFeedback(client, guild, ticket) {
  try {
    const user = await client.users.fetch(ticket.ownerId).catch(() => null);
    if (!user) return false;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`feedback_1_${ticket.id}`).setLabel('1 ⭐').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`feedback_2_${ticket.id}`).setLabel('2 ⭐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`feedback_3_${ticket.id}`).setLabel('3 ⭐').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`feedback_4_${ticket.id}`).setLabel('4 ⭐').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`feedback_5_${ticket.id}`).setLabel('5 ⭐').setStyle(ButtonStyle.Success),
    );

    await user.send({
      content: `How was your ticket experience in **${guild.name}**?\nTicket #${ticket.id} | Category: ${ticket.category}${ticket.claimedBy ? ` | Staff: <@${ticket.claimedBy}>` : ''}\n\nPlease rate your experience:`,
      components: [row],
    });
    return true;
  } catch {
    // DMs might be closed
    return false;
  }
}

/**
 * Process a feedback button interaction.
 */
export async function processFeedback(interaction, ticketId, rating) {
  const { getTicketById } = await import('../utils/database.js');
  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
    return;
  }

  // Check if already gave feedback
  const existing = await getTicketFeedback(ticketId);
  if (existing) {
    await interaction.reply({ content: 'You already submitted feedback for this ticket.', ephemeral: true });
    return;
  }

  // Only the ticket owner can give feedback
  if (interaction.user.id !== ticket.ownerId) {
    await interaction.reply({ content: 'Only the ticket owner can submit feedback.', ephemeral: true });
    return;
  }

  await addTicketFeedback(ticketId, interaction.guildId || ticket.guildId, interaction.user.id, rating, '', ticket.claimedBy);
  await interaction.reply({ content: `Thank you! You rated ${rating}/5 ⭐`, ephemeral: true });

  // Update the message to disable buttons
  try {
    await interaction.message.edit({
      content: `Thank you for your feedback! You rated **${rating}/5** ⭐`,
      components: [],
    });
  } catch { /* message might not be editable */ }
}
