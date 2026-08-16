/**
 * Jail System — Isolate users in a dedicated jail channel.
 * Creates a private text channel visible only to the jailed user and staff.
 * Saves/restores roles on jail/unjail.
 */
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import {
  jailUser,
  unjailUser,
  getJailedUsers,
  isJailed,
} from '../utils/database.js';
import { createModCase } from './case-manager.js';
import { sendModLog } from '../utils/modlog.js';
import { parseDuration } from '../utils/duration.js';
import { getGuildConfig } from '../utils/database.js';
import { logger } from '../utils/logger.js';

/**
 * Jail a user: remove all roles, create private channel, restrict access.
 */
export async function jailMember(guild, member, moderator, reason, durationStr) {
  if (await isJailed(guild.id, member.id)) {
    throw new Error(`${member.user.username} is already jailed`);
  }

  let expiresAt = null;
  if (durationStr) {
    const ms = parseDuration(durationStr, { min: 60_000, max: 90 * 24 * 60 * 60 * 1000 });
    if (ms) expiresAt = Date.now() + ms;
  }

  // Save previous roles
  const previousRoles = member.roles.cache
    .filter((r) => !r.managed && r.id !== guild.id)
    .map((r) => r.id);

  // Remove all roles
  for (const roleId of previousRoles) {
    await member.roles.remove(roleId, `[Jail] ${reason}`).catch(() => {});
  }

  // Create jail case
  const caseId = await createModCase(guild.id, 'jail', member.id, moderator.id, reason, {
    duration: durationStr || 'indefinite',
    expiresAt,
  });

  // Create private jail channel
  const staffRoleId = getGuildConfig(guild.id, 'ticketStaffRole');
  const jailChannelName = `jail-${member.id}`;
  let channelId = null;

  try {
    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];
    if (staffRoleId) {
      overwrites.push({
        id: staffRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    const channel = await guild.channels.create({
      name: jailChannelName,
      type: ChannelType.GuildText,
      topic: `Jail: ${member.user.tag} (${member.id})`,
      permissionOverwrites: overwrites,
      reason: `[Jail] ${reason}`,
    });
    channelId = channel.id;

    await channel.send({
      content: `${member.user} คุณถูก Jail: ${reason}\nทีมงานจะติดต่อเร็วๆ นี้\n${expiresAt ? `หมดอายุ: <t:${Math.floor(expiresAt / 1000)}:R>` : 'ไม่มีกำหนดเวลา'}`,
    }).catch(() => {});
  } catch (err) {
    logger.error('Failed to create jail channel', err);
  }

  // Save to DB
  await jailUser(guild.id, member.id, reason, moderator.id, previousRoles, caseId, channelId, expiresAt);

  // Log
  await sendModLog(guild, {
    action: 'Jail',
    moderator,
    target: member.user,
    reason,
    extra: `Duration: ${durationStr || 'Indefinite'} | Roles removed: ${previousRoles.length}`,
  });

  return { caseId, channelId, expiresAt };
}

/**
 * Release a user from jail: restore roles, delete jail channel.
 */
export async function unjailMember(guild, userId, moderator) {
  const data = await unjailUser(guild.id, userId);
  if (!data) throw new Error('User is not jailed');

  // Restore roles
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    for (const roleId of data.previousRoles) {
      await member.roles.add(roleId, '[Unjail] Restored').catch(() => {});
    }
  }

  // Delete jail channel
  if (data.channelId) {
    const channel = guild.channels.cache.get(data.channelId);
    if (channel) {
      await channel.delete('[Unjail] Releasing user').catch(() => {});
    }
  }

  // Create unjail case
  await createModCase(guild.id, 'unjail', userId, moderator.id, 'Released from jail');

  // Log
  await sendModLog(guild, {
    action: 'Unjail',
    moderator,
    target: member?.user || { id: userId, toString: () => `<@${userId}>` },
    reason: `Released from jail. Roles restored: ${data.previousRoles.length}`,
  });

  return { previousRoles: data.previousRoles, reason: data.reason };
}

/**
 * Get all jailed users for a guild.
 */
export async function getJailedList(guildId) {
  return getJailedUsers(guildId);
}

/**
 * Check and release expired jails. Call periodically.
 */
export async function checkExpiredJails(client) {
  const now = Date.now();
  for (const [, guild] of client.guilds.cache) {
    const jailed = await getJailedUsers(guild.id);
    for (const entry of jailed) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        try {
          await unjailMember(guild, entry.userId, client.user);
          logger.info(`Auto-unjailed ${entry.userId} in ${guild.id} (jail expired)`);
        } catch (err) {
          logger.error(`Failed to auto-unjail ${entry.userId}`, err);
        }
      }
    }
  }
}
