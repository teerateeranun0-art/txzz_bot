/**
 * Reaction Roles — Grant/remove roles when users react to messages.
 */
import {
  addReactionRole,
  removeReactionRole,
  getReactionRolesForMessage,
} from '../utils/database.js';
import { logger } from '../utils/logger.js';

/**
 * Setup a reaction role on a message.
 */
export async function setupReactionRole(guildId, channelId, messageId, emoji, roleId, addedBy) {
  await addReactionRole(guildId, channelId, messageId, emoji, roleId, addedBy);
}

/**
 * Handle a reaction being added — grant the corresponding role.
 */
export async function handleReactionAdd(reaction, user) {
  if (user.bot) return;
  if (!reaction.message.guild) return;

  const emojiKey = reaction.emoji.id || reaction.emoji.name;
  const roles = await getReactionRolesForMessage(reaction.message.id);
  const match = roles.find((r) => r.emoji === emojiKey);
  if (!match) return;

  try {
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    await member.roles.add(match.role_id, '[Reaction Role]');
  } catch (err) {
    logger.error('Reaction role add failed', err);
  }
}

/**
 * Handle a reaction being removed — remove the corresponding role.
 */
export async function handleReactionRemove(reaction, user) {
  if (user.bot) return;
  if (!reaction.message.guild) return;

  const emojiKey = reaction.emoji.id || reaction.emoji.name;
  const roles = await getReactionRolesForMessage(reaction.message.id);
  const match = roles.find((r) => r.emoji === emojiKey);
  if (!match) return;

  try {
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    await member.roles.remove(match.role_id, '[Reaction Role]');
  } catch (err) {
    logger.error('Reaction role remove failed', err);
  }
}
