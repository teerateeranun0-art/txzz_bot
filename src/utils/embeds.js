import { EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { truncate } from './sanitize.js';

export const EPHEMERAL = { flags: MessageFlags.Ephemeral };

export function baseEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTimestamp();
  if (title) embed.setTitle(truncate(title, 256));
  if (description) embed.setDescription(truncate(description, 4096));
  return embed;
}

export function successEmbed(description) {
  return baseEmbed('สำเร็จ', description).setColor(config.colors.success);
}

export function errorEmbed(description) {
  return baseEmbed('ผิดพลาด', description).setColor(config.colors.error);
}

export function infoEmbed(title, description) {
  return baseEmbed(title, description).setColor(config.colors.info);
}

export function warnEmbed(description) {
  return baseEmbed('คำเตือน', description).setColor(config.colors.warning);
}

export function ephemeralReply(payload) {
  return { ...payload, ...EPHEMERAL };
}
