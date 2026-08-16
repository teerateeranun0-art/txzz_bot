import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';
import { rateLimiter } from '../security/rate-limiter.js';
import { config } from '../config.js';

export default {
  name: Events.WebhooksUpdate,
  async execute(channel) {
    if (!channel.guild) return;
    try {
      const result = rateLimiter.checkGuild(channel.guild.id, 'webhook_change', config.security.rateLimitWindow, 3);
      if (result.exceeded) {
        await createIncident(channel.guild.id, 'mass_webhook_change', 'warning', null, {
          count: result.count,
          channel: channel.name,
        }, 'alert');
        await sendSecurityAlert(channel.guild, 'Rapid Webhook Changes', {
          channel: `#${channel.name}`,
          count: `${result.count} changes in ${config.security.rateLimitWindow / 1000}s`,
        }, { severity: 'warning' });
      }
    } catch (err) {
      logger.error('webhooksUpdate handler failed', err);
    }
  },
};
