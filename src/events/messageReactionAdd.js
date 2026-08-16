import { Events } from 'discord.js';
import { handleReactionAdd } from '../community/reaction-roles.js';
import { handleStarReaction } from '../community/starboard.js';
import { addGiveawayEntry } from '../utils/database.js';
import { getGiveawayByMessage } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageReactionAdd,
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
      await handleReactionAdd(reaction, user);
    } catch (err) {
      logger.error('ReactionAdd: handleReactionAdd failed', err);
    }

    // Starboard
    try {
      await handleStarReaction(reaction, true);
    } catch (err) {
      logger.error('ReactionAdd: handleStarReaction failed', err);
    }

    // Giveaway entry
    try {
      if (reaction.emoji.name === '🎉') {
        const gw = await getGiveawayByMessage(reaction.message.id);
        if (gw && !gw.ended) {
          await addGiveawayEntry(gw.id, user.id);
        }
      }
    } catch (err) {
      logger.error('ReactionAdd: giveaway entry failed', err);
    }
  },
};
