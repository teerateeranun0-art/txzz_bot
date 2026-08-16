import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident, logModEvent } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (!member.guild) return;
    try {
      // Leave rate detection is handled via rate limiter in engine
      // This event primarily logs departures for security analysis
      const wasKick = member.guild.members.me
        ? Date.now() - (member.joinedTimestamp || 0) < 5000 // Recent join that left
        : false;

      if (wasKick) {
        await createIncident(member.guild.id, 'quick_leave', 'info', member.id, {
          joinedAt: member.joinedTimestamp,
          accountCreated: member.user?.createdTimestamp,
        }, 'member_left');
      }

      // Log member leave
      await logModEvent(member.guild.id, 'member', 'member_leave', {
        userId: member.id,
        details: {
          joinedAt: member.joinedTimestamp,
          serverTime: Date.now() - (member.joinedTimestamp || 0),
          roles: member.roles?.cache.filter((r) => !r.managed && r.id !== member.guild.id).map((r) => r.id) || [],
        },
      });
    } catch (err) {
      logger.error('guildMemberRemove handler failed', err);
    }
  },
};
