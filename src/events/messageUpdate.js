import { Events } from 'discord.js';
import { logModEvent } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { safeText } from '../utils/sanitize.js';

export default {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage, client) {
    if (!oldMessage.guild) return;
    if (oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    try {
      await logModEvent(oldMessage.guild.id, 'message', 'message_edit', {
        userId: oldMessage.author?.id,
        targetId: oldMessage.channel.id,
        details: {
          channelId: oldMessage.channel.id,
          channelName: oldMessage.channel.name,
          oldContent: safeText(oldMessage.content || '[no content]', 500),
          newContent: safeText(newMessage.content || '[no content]', 500),
        },
      });
    } catch (err) {
      logger.error('messageUpdate logging failed', err);
    }
  },
};
