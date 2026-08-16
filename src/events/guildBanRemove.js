import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident } from '../utils/database.js';

export default {
  name: Events.GuildBanRemove,
  async execute(ban) {
    if (!ban.guild) return;
    try {
      await createIncident(ban.guild.id, 'unban', 'info', ban.user.id, {
        username: ban.user.username,
      }, 'unban');
    } catch (err) {
      logger.error('guildBanRemove handler failed', err);
    }
  },
};
