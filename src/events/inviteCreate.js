import { Events } from 'discord.js';
import { logModEvent } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InviteCreate,
  async execute(invite, client) {
    if (!invite.guild) return;

    try {
      await logModEvent(invite.guild.id, 'invite', 'invite_create', {
        userId: invite.inviter?.id,
        targetId: invite.channel?.id,
        details: {
          code: invite.code,
          channelName: invite.channel?.name,
          maxUses: invite.maxUses,
          maxAge: invite.maxAge,
          temporary: invite.temporary,
          expiresAt: invite.expiresTimestamp,
        },
      });
    } catch (err) {
      logger.error('inviteCreate logging failed', err);
    }
  },
};
