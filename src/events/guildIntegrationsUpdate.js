import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';

export default {
  name: Events.GuildIntegrationsUpdate,
  async execute(guild) {
    try {
      await createIncident(guild.id, 'integration_update', 'info', null, {}, 'integration_update');
      await sendSecurityAlert(guild, 'Server Integration Updated', {}, { severity: 'info' });
    } catch (err) {
      logger.error('guildIntegrationsUpdate handler failed', err);
    }
  },
};
