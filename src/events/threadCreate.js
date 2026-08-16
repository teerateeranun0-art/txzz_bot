import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident } from '../utils/database.js';
import { rateLimiter } from '../security/rate-limiter.js';
import { config } from '../config.js';

export default {
  name: Events.ThreadCreate,
  async execute(thread) {
    if (!thread.guild) return;
    try {
      const result = rateLimiter.checkGuild(thread.guild.id, 'thread_create', config.security.rateLimitWindow, 10);
      if (result.exceeded) {
        await createIncident(thread.guild.id, 'mass_thread_create', 'warning', null, {
          count: result.count,
          thread: thread.name,
        }, 'alert');
      }
    } catch (err) {
      logger.error('threadCreate handler failed', err);
    }
  },
};
