import { Events } from 'discord.js';
import { config } from '../config.js';
import { getUserLevel, updateUserLevel, xpForLevel, getAfk, clearAfk, ensureUserLevel } from '../utils/database.js';
import { mentionUsers, safeText } from '../utils/sanitize.js';
import { processMessage } from '../security/engine.js';
import { checkMessage, executeAutoModAction } from '../moderation/automod-engine.js';
import { saveTranscriptMessage } from '../tickets/transcript.js';
import { handleCounting, handleWordChain } from '../community/games.js';
import { logger } from '../utils/logger.js';

const afkNoticeCooldown = new Map();

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    // Security: anti-spam processing
    try {
      await processMessage(message);
    } catch (err) {
      logger.error('Security: processMessage failed', err);
    }

    // AutoMod: word/regex/domain filtering
    try {
      const automodResult = await checkMessage(message);
      if (automodResult.action) {
        await executeAutoModAction(message, automodResult);
        return; // Don't process further if message was flagged
      }
    } catch (err) {
      logger.error('AutoMod: checkMessage failed', err);
    }

    // Ticket transcript: save message if in a ticket channel
    try {
      await saveTranscriptMessage(message);
    } catch (err) {
      logger.error('Transcript: saveTranscriptMessage failed', err);
    }

    // Channel games: counting and word chain
    try {
      const wasCounting = await handleCounting(message);
      if (wasCounting) return; // Don't process XP for game messages
      const wasWordChain = await handleWordChain(message);
      if (wasWordChain) return;
    } catch (err) {
      logger.error('Games: counting/wordchain failed', err);
    }

    const afk = getAfk(message.author.id);
    if (afk) {
      clearAfk(message.author.id);
      await message.reply({
        content: `ยินดีต้อนรับกลับ ปิด AFK แล้ว (AFK ${Math.floor((Date.now() - afk.since) / 60000)} นาที)`,
        allowedMentions: mentionUsers(message.author.id),
      }).catch(() => {});
    }

    if (message.mentions.users.size) {
      let shown = 0;
      for (const [, user] of message.mentions.users) {
        if (shown >= 3) break;
        if (user.id === message.author.id) continue;
        const userAfk = getAfk(user.id);
        if (!userAfk) continue;
        const noticeKey = `${message.author.id}:${user.id}`;
        const last = afkNoticeCooldown.get(noticeKey) || 0;
        if (Date.now() - last < 30_000) continue;
        afkNoticeCooldown.set(noticeKey, Date.now());
        shown += 1;
        await message.reply({
          content: `**${user.username}** กำลัง AFK: ${safeText(userAfk.reason, 100)}`,
          allowedMentions: mentionUsers(),
        }).catch(() => {});
      }
    }

    const content = message.content?.trim() || '';
    if (content.length >= config.levels.minMessageLength) {
      const data = await ensureUserLevel(message.guild.id, message.author.id);
      const now = Date.now();
      if (now - data.lastXp >= config.levels.cooldown) {
        const xpGain = Math.floor(Math.random() * (config.levels.xpMax - config.levels.xpMin + 1)) + config.levels.xpMin;
        let newXp = data.xp + xpGain;
        let newLevel = data.level;
        let needed = xpForLevel(newLevel + 1);
        let leveled = false;
        while (newXp >= needed && newLevel < 1000) {
          newXp -= needed;
          newLevel += 1;
          needed = xpForLevel(newLevel + 1);
          leveled = true;
        }
        updateUserLevel(message.guild.id, message.author.id, { xp: newXp, level: newLevel, lastXp: now });
        if (leveled) {
          await message.channel.send({
            content: `${message.author} Level Up! ตอนนี้ **Level ${newLevel}**`,
            allowedMentions: mentionUsers(message.author.id),
          }).catch(() => {});
        }
      }
    }

    const prefix = config.prefix;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();
    if (cmd === 'ping') {
      await message.reply({ content: `Pong! ${client.ws.ping}ms`, allowedMentions: mentionUsers() });
    }
    if (cmd === 'help') {
      await message.reply({ content: 'ใช้ `/help` เพื่อดู Slash Commands ทั้งหมด', allowedMentions: mentionUsers() });
    }
  },
};
