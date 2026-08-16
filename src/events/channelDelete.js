import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident, isProtected } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';

export default {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;
    try {
      // Check if deleted channel was protected
      if (await isProtected(channel.guild.id, 'channels', channel.id)) {
        await createIncident(channel.guild.id, 'protected_channel_delete', 'critical', null, {
          channelId: channel.id,
          channelName: channel.name,
        }, 'alert');

        await sendSecurityAlert(channel.guild, 'Protected Channel Deleted!', {
          channel: `#${channel.name}`,
          channelId: channel.id,
        }, { severity: 'critical' });
      }
    } catch (err) {
      logger.error('channelDelete handler failed', err);
    }
  },
};
