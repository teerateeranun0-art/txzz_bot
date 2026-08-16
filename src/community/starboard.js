/**
 * Starboard — Messages that receive enough star reactions appear in a starboard channel.
 */
import { baseEmbed } from '../utils/embeds.js';
import {
  getStarboardEntry,
  upsertStarboardEntry,
  updateStarboardMessageId,
  updateStarCount,
  getGuildConfig,
} from '../utils/database.js';
import { logger } from '../utils/logger.js';

const STAR_EMOJI = '⭐';
const STAR_THRESHOLD = 3; // Default minimum stars

/**
 * Handle a star reaction being added or removed.
 * @param {MessageReaction} reaction
 * @param {boolean} added - true if star was added, false if removed
 */
export async function handleStarReaction(reaction, added) {
  if (!reaction.message.guild) return;

  const emojiKey = reaction.emoji.id || reaction.emoji.name;
  if (emojiKey !== STAR_EMOJI) return;

  const guildId = reaction.message.guild.id;
  const starboardChannelId = getGuildConfig(guildId, 'starboardChannel');
  if (!starboardChannelId) return;

  // Don't starboard messages in the starboard channel itself
  if (reaction.message.channel.id === starboardChannelId) return;

  const starCount = reaction.count;
  const message = reaction.message;

  try {
    let entry = await getStarboardEntry(guildId, message.id);

    if (starCount < STAR_THRESHOLD) {
      // Below threshold — remove from starboard if it was there
      if (entry?.starboard_message_id) {
        const starChannel = reaction.message.guild.channels.cache.get(starboardChannelId);
        if (starChannel) {
          const starMsg = await starChannel.messages.fetch(entry.starboard_message_id).catch(() => null);
          if (starMsg) await starMsg.delete().catch(() => {});
        }
        await updateStarboardMessageId(entry.id, null);
      }
      return;
    }

    // At or above threshold
    if (!entry) {
      entry = await upsertStarboardEntry(guildId, message.id, message.channel.id, message.author.id, starCount);
    } else {
      await updateStarCount(entry.id, starCount);
    }

    const starChannel = reaction.message.guild.channels.cache.get(starboardChannelId);
    if (!starChannel?.isTextBased()) return;

    const embed = formatStarboardEmbed(message, starCount);

    if (entry.starboard_message_id) {
      // Update existing starboard message
      const starMsg = await starChannel.messages.fetch(entry.starboard_message_id).catch(() => null);
      if (starMsg) {
        await starMsg.edit({ embeds: [embed] });
      } else {
        // Starboard message was deleted, repost
        const newMsg = await starChannel.send({ embeds: [embed] });
        await updateStarboardMessageId(entry.id, newMsg.id);
      }
    } else {
      // Create new starboard message
      const newMsg = await starChannel.send({ embeds: [embed] });
      await updateStarboardMessageId(entry.id, newMsg.id);
    }
  } catch (err) {
    logger.error('Starboard handling failed', err);
  }
}

/**
 * Format a starboard embed for a message.
 */
export function formatStarboardEmbed(message, starCount) {
  const stars = starCount >= 10 ? '🌟' : starCount >= 5 ? '⭐' : '⭐';
  const content = message.content
    ? message.content.slice(0, 1024)
    : (message.attachments.first()?.description || '');

  const embed = baseEmbed(`${stars} ${starCount} — #${message.channel.name}`)
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 64 }) })
    .addFields({ name: 'Message', value: content || '*No text content*' })
    .addFields({ name: 'Jump', value: `[Go to message](${message.url})` })
    .setTimestamp(message.createdTimestamp);

  // Add first image attachment
  const image = message.attachments.find((a) => a.contentType?.startsWith('image/'));
  if (image) embed.setImage(image.url);

  return embed;
}
