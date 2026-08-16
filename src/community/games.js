/**
 * Channel Games — Counting and Word Chain mini-games.
 * Called from messageCreate when the message is in a configured game channel.
 */
import {
  getCountingState,
  updateCountingState,
  getWordChainState,
  updateWordChainState,
} from '../utils/database.js';
import { logger } from '../utils/logger.js';

/**
 * Handle counting game — next message must be current + 1.
 * Same user cannot count twice in a row.
 */
export async function handleCounting(message) {
  const state = await getCountingState(message.guild.id, message.channel.id);
  if (!state) return false;

  const input = message.content.trim();
  const num = parseInt(input, 10);
  if (isNaN(num)) {
    await message.react('❌').catch(() => {});
    await message.reply(`Expected a number! The count was at **${state.current_number}**. Reset to 0.`).catch(() => {});
    await updateCountingState(message.guild.id, message.channel.id, 0, null);
    return true;
  }

  const expected = state.current_number + 1;
  if (num !== expected) {
    await message.react('❌').catch(() => {});
    await message.reply(`Wrong! Expected **${expected}** but got **${num}**. Reset to 0. Record was **${state.record}**.`).catch(() => {});
    await updateCountingState(message.guild.id, message.channel.id, 0, null);
    return true;
  }

  if (state.last_counter_id === message.author.id) {
    await message.react('❌').catch(() => {});
    await message.reply(`You can't count twice in a row! Reset to 0. Record was **${state.record}**.`).catch(() => {});
    await updateCountingState(message.guild.id, message.channel.id, 0, null);
    return true;
  }

  await updateCountingState(message.guild.id, message.channel.id, num, message.author.id);
  await message.react('✅').catch(() => {});

  // Milestone reactions
  if (num % 100 === 0 && num > 0) {
    await message.react('🎉').catch(() => {});
    await message.reply(`🎉 Milestone! You reached **${num}**!`).catch(() => {});
  } else if (num % 50 === 0 && num > 0) {
    await message.react('👏').catch(() => {});
  }

  return true;
}

/**
 * Handle word chain — next word must start with the last letter of the previous word.
 * Same user cannot go twice in a row. Words must be lowercase alphabetic.
 */
export async function handleWordChain(message) {
  const state = await getWordChainState(message.guild.id, message.channel.id);
  if (!state) return false;

  const word = message.content.trim().toLowerCase();

  // Validate: only lowercase letters
  if (!/^[a-z]+$/.test(word)) {
    await message.react('❌').catch(() => {});
    await message.reply('Words must contain only lowercase letters (a-z). Chain reset!').catch(() => {});
    await updateWordChainState(message.guild.id, message.channel.id, null, null, 0);
    return true;
  }

  // First word in chain — any word is accepted
  if (!state.last_word) {
    await updateWordChainState(message.guild.id, message.channel.id, word, message.author.id, 1);
    await message.react('✅').catch(() => {});
    return true;
  }

  // Same user check
  if (state.last_user_id === message.author.id) {
    await message.react('❌').catch(() => {});
    await message.reply(`You can't go twice in a row! Chain broken at **${state.chain_length}** words. Record was **${state.record}**.`).catch(() => {});
    await updateWordChainState(message.guild.id, message.channel.id, null, null, 0);
    return true;
  }

  // Must start with last letter of previous word
  const lastLetter = state.last_word.slice(-1);
  if (!word.startsWith(lastLetter)) {
    await message.react('❌').catch(() => {});
    await message.reply(`Word must start with **${lastLetter.toUpperCase()}** (from "${state.last_word}"). Chain broken at **${state.chain_length}** words. Record was **${state.record}**.`).catch(() => {});
    await updateWordChainState(message.guild.id, message.channel.id, null, null, 0);
    return true;
  }

  const newLength = state.chain_length + 1;
  await updateWordChainState(message.guild.id, message.channel.id, word, message.author.id, newLength);
  await message.react('✅').catch(() => {});

  // Milestone
  if (newLength % 50 === 0) {
    await message.react('🎉').catch(() => {});
    await message.reply(`🎉 Chain milestone: **${newLength}** words!`).catch(() => {});
  }

  return true;
}
