import { Events } from 'discord.js';
import { handleReactionRemove } from '../community/reaction-roles.js';
import { handleStarReaction } from '../community/starboard.js';
import { removeGiveawayEntry, getGiveawayByMessage } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageReactionRemove,
  async execute(reaction, user, client) {
    if (user.bot) return;

    // Fetch partial reaction/message if needed
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }
    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch {
        return;
      }
    }

    // Reaction Roles
    try {
      await handleReactionRemove(reaction, user);
    } catch (err) {
      logger.error('ReactionRemove: handleReactionRemove failed', err);
    }

    // Starboard (update star count on remove)
    try {
      await handleStarReaction(reaction, false);
    } catch (err) {
      logger.error('ReactionRemove: handleStarReaction failed', err);
    }

    // Giveaway entry removal
    try {
      if (reaction.emoji.name === '🎉') {
        const gw = await getGiveawayByMessage(reaction.message.id);
        if (gw && !gw.ended) {
          await removeGiveawayEntry(gw.id, user.id);
        }
      }
    } catch (err) {
      logger.error('ReactionRemove: giveaway entry removal failed', err);
    }
  },
};
