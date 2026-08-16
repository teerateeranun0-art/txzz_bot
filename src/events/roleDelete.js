import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident, isProtected } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';

export default {
  name: Events.RoleDelete,
  async execute(role) {
    if (!role.guild) return;
    try {
      // Check if deleted role was protected
      if (await isProtected(role.guild.id, 'roles', role.id)) {
        await createIncident(role.guild.id, 'protected_role_delete', 'critical', null, {
          roleId: role.id,
          roleName: role.name,
        }, 'alert');

        await sendSecurityAlert(role.guild, 'Protected Role Deleted!', {
          role: role.name,
          roleId: role.id,
        }, { severity: 'critical' });
      }
    } catch (err) {
      logger.error('roleDelete handler failed', err);
    }
  },
};
