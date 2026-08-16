import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident } from '../utils/database.js';
import { rateLimiter } from '../security/rate-limiter.js';
import { config } from '../config.js';

export default {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    try {
      // Detect permission changes
      if (oldChannel.permissionOverwrites?.cache.size !== newChannel.permissionOverwrites?.cache.size) {
        const result = rateLimiter.checkGuild(newChannel.guild.id, 'permission_edit', config.security.rateLimitWindow, config.security.antiNuke.maxPermissionEdits);
        if (result.exceeded) {
          await createIncident(newChannel.guild.id, 'mass_permission_edit', 'critical', null, {
            channel: newChannel.name,
            count: result.count,
          }, 'alert');
        }
      }

      // Detect channel rename
      if (oldChannel.name !== newChannel.name) {
        await createIncident(newChannel.guild.id, 'channel_rename', 'info', null, {
          oldName: oldChannel.name,
          newName: newChannel.name,
        }, 'channel_update');
      }
    } catch (err) {
      logger.error('channelUpdate handler failed', err);
    }
  },
};
