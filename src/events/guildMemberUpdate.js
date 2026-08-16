import { Events, AuditLogEvent } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';
import { rateLimiter } from '../security/rate-limiter.js';
import { config } from '../config.js';

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (!newMember.guild) return;
    const guild = newMember.guild;

    try {
      // Detect mass timeout
      if (!oldMember.isCommunicationDisabled() && newMember.isCommunicationDisabled()) {
        const result = rateLimiter.checkGuild(guild.id, 'mass_timeout', config.security.rateLimitWindow, 5);
        if (result.exceeded) {
          await createIncident(guild.id, 'mass_timeout', 'critical', null, {
            count: result.count,
            target: newMember.id,
          }, 'alert');
          await sendSecurityAlert(guild, 'Mass Timeout Detected', {
            count: `${result.count} timeouts in ${config.security.rateLimitWindow / 1000}s`,
          }, { severity: 'critical' });
        }
      }

      // Detect mass role changes
      const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
      const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

      if (addedRoles.size > 0 || removedRoles.size > 0) {
        const result = rateLimiter.checkGuild(guild.id, 'mass_role_change', config.security.rateLimitWindow, 10);
        if (result.exceeded) {
          await createIncident(guild.id, 'mass_role_change', 'warning', newMember.id, {
            added: addedRoles.map((r) => r.name),
            removed: removedRoles.map((r) => r.name),
          }, 'alert');
        }
      }
    } catch (err) {
      logger.error('guildMemberUpdate handler failed', err);
    }
  },
};
