import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createIncident } from '../utils/database.js';
import { sendSecurityAlert } from '../security/alerts.js';

export default {
  name: Events.GuildUpdate,
  async execute(oldGuild, newGuild) {
    try {
      const changes = [];

      // Server name change
      if (oldGuild.name !== newGuild.name) {
        changes.push(`Name: ${oldGuild.name} -> ${newGuild.name}`);
      }

      // Server icon change
      if (oldGuild.iconURL() !== newGuild.iconURL()) {
        changes.push('Server icon changed');
      }

      // Vanity URL change
      if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        changes.push(`Vanity: ${oldGuild.vanityURLCode || 'none'} -> ${newGuild.vanityURLCode || 'none'}`);
      }

      // Verification level change
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        changes.push(`Verification: ${oldGuild.verificationLevel} -> ${newGuild.verificationLevel}`);
      }

      if (changes.length) {
        await createIncident(newGuild.id, 'guild_update', 'warning', null, {
          changes,
        }, 'guild_update');

        if (oldGuild.name !== newGuild.name) {
          await sendSecurityAlert(newGuild, 'Server Name Changed', {
            from: oldGuild.name,
            to: newGuild.name,
          }, { severity: 'warning' });
        }
      }
    } catch (err) {
      logger.error('guildUpdate handler failed', err);
    }
  },
};
