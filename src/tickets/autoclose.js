/**
 * Auto-Close — Automatically close inactive tickets with a warning period.
 * Checks periodically and sends a warning before closing.
 */
import { getInactiveTickets, getTicketByChannel, closeTicket, updateTicketActivity } from '../utils/database.js';
import { logger } from '../utils/logger.js';

const WARN_BEFORE_CLOSE_MS = 10 * 60 * 1000; // Warn 10 minutes before auto-close

/**
 * Check for inactive tickets and auto-close them.
 * Call periodically (every 60s).
 * @param {Client} client
 * @param {number} inactiveMs - Inactivity threshold (default: 2 hours)
 */
export async function checkAutoClose(client, inactiveMs = 2 * 60 * 60 * 1000) {
  for (const [, guild] of client.guilds.cache) {
    try {
      const inactive = await getInactiveTickets(guild.id, inactiveMs);
      for (const ticket of inactive) {
        if (!ticket.channelId) continue;
        const channel = guild.channels.cache.get(ticket.channelId);
        if (!channel) continue;

        try {
          await channel.send(
            `⏰ This ticket has been inactive for ${Math.floor(inactiveMs / 3600000)}h. ` +
            `It will be closed automatically in ${Math.floor(WARN_BEFORE_CLOSE_MS / 60000)} minutes. ` +
            `Send a message to keep it open.`
          );

          // Update activity so the warning timer resets
          // The ticket will be closed on the NEXT check cycle if still inactive
          await updateTicketActivity(ticket.id);
        } catch (err) {
          logger.error(`Auto-close warning failed for ticket #${ticket.id}`, err);
          // If we can't send the warning, just close the ticket
          await closeTicket(ticket.id, client.user.id, 'Auto-close: inactive');
          await channel.delete('[Auto-Close] Inactive').catch(() => {});
        }
      }
    } catch (err) {
      logger.error(`Auto-close check failed for guild ${guild.id}`, err);
    }
  }
}
