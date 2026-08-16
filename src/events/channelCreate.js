import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { rateLimiter } from '../security/rate-limiter.js';
import { config } from '../config.js';
import { createIncident } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';

export default {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild) return;
    try {
      const result = rateLimiter.checkGuild(channel.guild.id, 'channel_create', config.security.rateLimitWindow, 5);
      if (result.exceeded) {
        await createIncident(channel.guild.id, 'mass_channel_create', 'warning', null, {
          count: result.count,
          channel: channel.name,
        }, 'alert');
        await sendSecurityAlert(channel.guild, 'Rapid Channel Creation', {
          count: `${result.count} channels in ${config.security.rateLimitWindow / 1000}s`,
        }, { severity: 'warning' });
      }
    } catch (err) {
      logger.error('channelCreate handler failed', err);
    }
  },
};
