import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { processAuditLogEntry } from '../security/engine.js';

export default {
  name: Events.GuildAuditLogEntryCreate,
  async execute(entry, guild) {
    try {
      await processAuditLogEntry(entry, guild);
    } catch (err) {
      logger.error('guildAuditLogEntryCreate handler failed', err);
    }
  },
};
