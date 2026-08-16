/**
 * Transcript — Save ticket messages and generate text transcripts on close.
 */
import { saveTicketMessage, getTicketMessages } from '../utils/database.js';
import { baseEmbed } from '../utils/embeds.js';
import { safeText } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';

/**
 * Save a message to the ticket transcript database.
 * Call this from messageCreate when the message is in a ticket channel.
 */
export async function saveTranscriptMessage(message) {
  const { getTicketByChannel } = await import('../utils/database.js');
  const ticket = await getTicketByChannel(message.channel.id);
  if (!ticket) return false;

  const attachments = message.attachments.map((a) => ({
    name: a.name,
    url: a.url,
    size: a.size,
  }));

  await saveTicketMessage(
    ticket.id,
    message.author.id,
    message.author.username,
    message.content || '',
    attachments,
    message.author.bot,
  );

  // Update ticket activity
  const { updateTicketActivity } = await import('../utils/database.js');
  await updateTicketActivity(ticket.id);

  return true;
}

/**
 * Generate a formatted transcript text from ticket messages.
 */
export async function generateTranscript(guild, channel, ticket) {
  const messages = await getTicketMessages(ticket.id);

  if (!messages.length) {
    // Fallback: fetch from channel if DB is empty
    try {
      const fetched = await channel.messages.fetch({ limit: 100 });
      const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      return sorted.map((m) => formatMessageLine(m)).join('\n');
    } catch {
      return 'No messages recorded.';
    }
  }

  return messages.map((m) => {
    const time = new Date(m.sentAt).toLocaleString('en-US', { timeZone: 'UTC' });
    const botTag = m.isBot ? ' [BOT]' : '';
    let line = `[${time}] ${m.username}${botTag}: ${m.content}`;
    if (m.attachments.length) {
      const attList = m.attachments.map((a) => `[${a.name}](${a.url})`).join(', ');
      line += `\n  Attachments: ${attList}`;
    }
    return line;
  }).join('\n');
}

function formatMessageLine(message) {
  const time = new Date(message.createdTimestamp).toLocaleString('en-US', { timeZone: 'UTC' });
  const botTag = message.author.bot ? ' [BOT]' : '';
  let line = `[${time}] ${message.author.username}${botTag}: ${message.content || ''}`;
  if (message.attachments.size) {
    const attList = message.attachments.map((a) => `[${a.name}](${a.url})`).join(', ');
    line += `\n  Attachments: ${attList}`;
  }
  return line;
}

/**
 * Send a transcript embed to the designated transcript channel.
 */
export async function sendTranscriptToChannel(guild, channelId, ticket, transcriptText, closedBy, reason) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const durationMs = (ticket.closedAt || Date.now()) - ticket.createdAt;
  const hours = Math.floor(durationMs / 3600000);
  const mins = Math.floor((durationMs % 3600000) / 60000);

  const embed = baseEmbed(`📋 Ticket #${ticket.id} Closed`)
    .addFields(
      { name: 'Owner', value: `<@${ticket.ownerId}>`, inline: true },
      { name: 'Category', value: ticket.category, inline: true },
      { name: 'Closed By', value: closedBy ? `<@${closedBy}>` : 'Unknown', inline: true },
      { name: 'Claimed By', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed', inline: true },
      { name: 'Duration', value: `${hours}h ${mins}m`, inline: true },
      { name: 'Reason', value: safeText(reason || ticket.closeReason || 'No reason', 200) },
    )
    .setFooter({ text: `Ticket #${ticket.id}` });

  // Send embed + transcript as a file if too long
  if (transcriptText.length > 1900) {
    const buffer = Buffer.from(transcriptText, 'utf-8');
    await channel.send({
      embeds: [embed],
      files: [{ attachment: buffer, name: `transcript-${ticket.id}.txt` }],
    });
  } else {
    embed.addFields({ name: 'Transcript', value: `\`\`\`\n${transcriptText.slice(0, 1024)}\n\`\`\`` });
    await channel.send({ embeds: [embed] });
  }
}
