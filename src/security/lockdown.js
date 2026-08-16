/**
 * Lockdown state machine.
 * States: normal, slowmode, verification, raid, maintenance, panic
 * Manages channel permission overwrites for lockdown/recovery.
 */

import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getLockdownState, setLockdownState, createSnapshot, createIncident } from '../utils/database.js';
import { sendSecurityAlert } from './alerts.js';

const STATE_PRIORITY = {
  normal: 0,
  slowmode: 1,
  verification: 2,
  raid: 3,
  maintenance: 4,
  panic: 5,
};

/**
 * Activate a lockdown state on a guild.
 */
export async function activateLockdown(guild, newState, reason, activatedBy, durationMs) {
  const current = await getLockdownState(guild.id);

  // Don't downgrade from a higher-priority state
  if (STATE_PRIORITY[newState] < STATE_PRIORITY[current.state] && current.state !== 'normal') {
    return { skipped: true, reason: `Already in ${current.state} mode (higher priority)` };
  }

  // Save current overwrites for recovery
  const previousOverwrites = await captureOverwrites(guild);

  const expiresAt = durationMs ? Date.now() + durationMs : null;
  if (expiresAt && durationMs > config.security.lockdown.maxDuration) {
    return { skipped: true, reason: 'Duration exceeds maximum (24h)' };
  }

  await setLockdownState(guild.id, newState, reason, activatedBy, expiresAt, previousOverwrites);

  // Create a snapshot before lockdown
  try {
    const { captureSnapshot } = await import('./snapshot.js');
    await captureSnapshot(guild, `Pre-${newState} lockdown`, newState);
  } catch (err) {
    logger.error('Snapshot before lockdown failed', err);
  }

  // Apply lockdown effects
  await applyLockdownEffects(guild, newState);

  await createIncident(guild.id, 'lockdown', newState === 'panic' ? 'emergency' : 'critical',
    activatedBy, { newState, reason }, 'lockdown_activated');

  await sendSecurityAlert(guild, `Lockdown activated: **${newState}**`, {
    reason,
    activatedBy: activatedBy || 'System',
    duration: durationMs ? `${Math.floor(durationMs / 60000)} minutes` : 'Indefinite',
  });

  return { activated: true, state: newState };
}

/**
 * Deactivate lockdown and restore normal state.
 */
export async function deactivateLockdown(guild, deactivatedBy) {
  const current = await getLockdownState(guild.id);

  if (current.state === 'normal') {
    return { skipped: true, reason: 'Already in normal state' };
  }

  // Restore previous overwrites
  await restoreOverwrites(guild, current.previousOverwrites);

  await setLockdownState(guild.id, 'normal', '', deactivatedBy, null, {});

  await createIncident(guild.id, 'lockdown', 'info', deactivatedBy, {
    previousState: current.state,
  }, 'lockdown_deactivated');

  await sendSecurityAlert(guild, `Lockdown deactivated (was: **${current.state}**)`, {
    deactivatedBy: deactivatedBy || 'System',
  });

  return { deactivated: true, previousState: current.state };
}

/**
 * Panic button: immediate full lockdown + snapshot + alert owner.
 */
export async function panicButton(guild, reason, activatedBy) {
  // Create immediate snapshot
  try {
    const { captureSnapshot } = await import('./snapshot.js');
    await captureSnapshot(guild, 'PANIC snapshot', 'panic');
  } catch (err) {
    logger.error('Panic snapshot failed', err);
  }

  const result = await activateLockdown(guild, 'panic', reason || 'Panic button activated', activatedBy, null);

  await createIncident(guild.id, 'panic', 'emergency', activatedBy, {
    reason: reason || 'Panic button',
  }, 'panic');

  // Try to DM the server owner
  try {
    const owner = await guild.fetchOwner();
    if (owner) {
      await owner.send(`**PANIC ALERT** - Server **${guild.name}** is in panic mode!\nReason: ${reason || 'Panic button'}`).catch(() => {});
    }
  } catch { /* owner DM failed */ }

  return result;
}

/**
 * Get current lockdown status.
 */
export async function getLockdownStatus(guildId) {
  return getLockdownState(guildId);
}

/**
 * Check and expire timed lockdowns.
 */
export async function checkLockdownExpiry(client) {
  for (const [, guild] of client.guilds.cache) {
    const state = await getLockdownState(guild.id);
    if (state.state !== 'normal' && state.expiresAt && Date.now() >= state.expiresAt) {
      await deactivateLockdown(guild, 'SYSTEM_EXPIRY');
    }
  }
}

// ── Internal helpers ──

async function captureOverwrites(guild) {
  const overwrites = {};
  const textChannels = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement
  );

  for (const [, channel] of textChannels) {
    const channelOverwrites = {};
    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
      channelOverwrites[id] = {
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString(),
      };
    }
    overwrites[channel.id] = channelOverwrites;
  }
  return overwrites;
}

async function restoreOverwrites(guild, previousOverwrites) {
  if (!previousOverwrites || typeof previousOverwrites !== 'object') return;

  for (const [channelId, overwrites] of Object.entries(previousOverwrites)) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;

    for (const [targetId, perms] of Object.entries(overwrites)) {
      try {
        await channel.permissionOverwrites.edit(targetId, {
          SendMessages: undefined, // Reset to default
        }, { reason: 'Lockdown recovery' }).catch(() => {});
      } catch { /* channel/target gone */ }
    }
  }
}

async function applyLockdownEffects(guild, state) {
  const textChannels = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement
  );

  switch (state) {
    case 'slowmode': {
      const slowmode = config.security.lockdown.defaultSlowmode;
      for (const [, channel] of textChannels) {
        await channel.setRateLimitPerUser(slowmode, 'Lockdown: slowmode').catch(() => {});
      }
      break;
    }

    case 'verification': {
      // Lock @everyone from sending in all channels
      for (const [, channel] of textChannels) {
        await channel.permissionOverwrites.edit(guild.id, {
          SendMessages: false,
        }, { reason: 'Lockdown: verification' }).catch(() => {});
      }
      break;
    }

    case 'raid': {
      // Lock all channels + set slowmode
      for (const [, channel] of textChannels) {
        await channel.permissionOverwrites.edit(guild.id, {
          SendMessages: false,
        }, { reason: 'Lockdown: raid' }).catch(() => {});
        await channel.setRateLimitPerUser(config.security.lockdown.defaultSlowmode, 'Lockdown: raid').catch(() => {});
      }
      break;
    }

    case 'maintenance': {
      // Lock all channels
      for (const [, channel] of textChannels) {
        await channel.permissionOverwrites.edit(guild.id, {
          SendMessages: false,
          AddReactions: false,
        }, { reason: 'Lockdown: maintenance' }).catch(() => {});
      }
      break;
    }

    case 'panic': {
      // Full lockdown: everything locked
      for (const [, channel] of textChannels) {
        await channel.permissionOverwrites.edit(guild.id, {
          SendMessages: false,
          AddReactions: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
        }, { reason: 'PANIC LOCKDOWN' }).catch(() => {});
      }
      break;
    }
  }
}
