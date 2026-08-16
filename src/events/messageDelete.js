import { Events } from 'discord.js';
import { logModEvent } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { safeText } from '../utils/sanitize.js';

export default {
  name: Events.MessageDelete,
  async execute(message, client) {
    if (!message.guild) return;
    if (message.author?.bot) return;

    try {
      // Determine who deleted the message
      let deleterId = null;
      // Check audit log for who deleted it (if not the author)
      try {
        const logs = await message.guild.fetchAuditLogs({ type: 72, limit: 1 }); // MESSAGE_DELETE
        const entry = logs.entries.first();
        if (entry && entry.target.id === message.author?.id && Date.now() - entry.createdTimestamp < 5000) {
          deleterId = entry.executor.id;
        }
      } catch { /* no audit log permission */ }

      await logModEvent(message.guild.id, 'message', 'message_delete', {
        userId: message.author?.id,
        targetId: message.channel.id,
        details: {
          channelId: message.channel.id,
          channelName: message.channel.name,
          content: safeText(message.content || '[no content]', 500),
          deleterId: deleterId !== message.author?.id ? deleterId : null,
          attachments: message.attachments?.size || 0,
          embeds: message.embeds?.length || 0,
        },
      });
    } catch (err) {
      logger.error('messageDelete logging failed', err);
    }
  },
};
