import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { rateLimiter } from '../security/rate-limiter.js';
import { config } from '../config.js';
import { createIncident } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';

export default {
  name: Events.GuildBanAdd,
  async execute(ban) {
    if (!ban.guild) return;
    try {
      const result = rateLimiter.checkGuild(ban.guild.id, 'ban', config.security.rateLimitWindow, config.security.antiNuke.maxBans);
      if (result.exceeded) {
        await createIncident(ban.guild.id, 'mass_ban', 'critical', null, {
          count: result.count,
          target: ban.user.id,
        }, 'alert');
        await sendSecurityAlert(ban.guild, 'Mass Ban Detected', {
          count: `${result.count} bans in ${config.security.rateLimitWindow / 1000}s`,
        }, { severity: 'critical' });
      }
    } catch (err) {
      logger.error('guildBanAdd handler failed', err);
    }
  },
};
