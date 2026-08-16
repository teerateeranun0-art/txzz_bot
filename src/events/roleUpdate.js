import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident, isProtected } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';
import { rateLimiter } from '../security/rate-limiter.js';
import { config } from '../config.js';

export default {
  name: Events.RoleUpdate,
  async execute(oldRole, newRole) {
    if (!newRole.guild) return;
    try {
      // Permission change detection
      if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        const result = rateLimiter.checkGuild(newRole.guild.id, 'permission_edit', config.security.rateLimitWindow, config.security.antiNuke.maxPermissionEdits);
        if (result.exceeded) {
          await createIncident(newRole.guild.id, 'mass_permission_edit', 'critical', null, {
            role: newRole.name,
            count: result.count,
          }, 'alert');
        }

        // Check for admin permission grant
        if (!oldRole.permissions.has('Administrator') && newRole.permissions.has('Administrator')) {
          await createIncident(newRole.guild.id, 'admin_role_grant', 'critical', null, {
            role: newRole.name,
            roleId: newRole.id,
          }, 'alert');
          await sendSecurityAlert(newRole.guild, 'Administrator Permission Granted', {
            role: newRole.name,
          }, { severity: 'critical' });
        }
      }

      // Role rename detection
      if (oldRole.name !== newRole.name) {
        await createIncident(newRole.guild.id, 'role_rename', 'info', null, {
          oldName: oldRole.name,
          newName: newRole.name,
        }, 'role_update');
      }

      // Protected role modification
      if (await isProtected(newRole.guild.id, 'roles', newRole.id)) {
        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
          await sendSecurityAlert(newRole.guild, 'Protected Role Permissions Changed', {
            role: newRole.name,
          }, { severity: 'critical' });
        }
      }
    } catch (err) {
      logger.error('roleUpdate handler failed', err);
    }
  },
};
