import { Events } from 'discord.js';
import { logModEvent } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InviteDelete,
  async execute(invite, client) {
    if (!invite.guild) return;

    try {
      await logModEvent(invite.guild.id, 'invite', 'invite_delete', {
        userId: invite.inviter?.id,
        targetId: invite.channel?.id,
        details: {
          code: invite.code,
          channelName: invite.channel?.name,
          uses: invite.uses,
        },
      });
    } catch (err) {
      logger.error('inviteDelete logging failed', err);
    }
  },
};
