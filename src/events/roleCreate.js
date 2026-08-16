import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { rateLimiter } from '../security/rate-limiter.js';
import { config } from '../config.js';
import { createIncident } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';

export default {
  name: Events.RoleCreate,
  async execute(role) {
    if (!role.guild) return;
    try {
      const result = rateLimiter.checkGuild(role.guild.id, 'role_create', config.security.rateLimitWindow, 5);
      if (result.exceeded) {
        await createIncident(role.guild.id, 'mass_role_create', 'warning', null, {
          count: result.count,
          role: role.name,
        }, 'alert');
        await sendSecurityAlert(role.guild, 'Rapid Role Creation', {
          count: `${result.count} roles in ${config.security.rateLimitWindow / 1000}s`,
        }, { severity: 'warning' });
      }

      // Check for dangerous permissions on new role
      const dangerous = role.permissions.has(['Administrator', 'ManageGuild', 'ManageRoles', 'BanMembers']);
      if (dangerous) {
        await createIncident(role.guild.id, 'dangerous_role_create', 'warning', null, {
          role: role.name,
          permissions: role.permissions.toArray().filter(p =>
            ['Administrator', 'ManageGuild', 'ManageRoles', 'BanMembers', 'KickMembers'].includes(p)
          ),
        }, 'alert');
      }
    } catch (err) {
      logger.error('roleCreate handler failed', err);
    }
  },
};
