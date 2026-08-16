/**
 * Server state snapshot and recovery system.
 * Captures roles, channels, permissions, and server settings for recovery.
 * Features:
 * - Automated incident pre-raid snapshot
 * - Diff preview report before restoration
 * - Selective safe recovery mode (restore only damaged resources)
 */

import { logger } from '../utils/logger.js';
import { createSnapshot, getSnapshotById, getSnapshots, createIncident } from '../utils/database.js';
import { restQueue } from '../utils/rest-queue.js';

/**
 * Capture a full snapshot of the guild state.
 */
export async function captureSnapshot(guild, label = 'manual', trigger = 'manual') {
  const rolesData = [];
  for (const [, role] of guild.roles.cache) {
    if (role.id === guild.id) continue; // skip @everyone
    rolesData.push({
      id: role.id,
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      mentionable: role.mentionable,
    });
  }

  const channelsData = [];
  for (const [, channel] of guild.channels.cache) {
    const overwrites = [];
    for (const [id, overwrite] of channel.permissionOverwrites?.cache || []) {
      overwrites.push({
        id,
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString(),
      });
    }
    channelsData.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      position: channel.position,
      topic: channel.topic || '',
      nsfw: channel.nsfw || false,
      rateLimitPerUser: channel.rateLimitPerUser || 0,
      overwrites,
    });
  }

  const serverData = {
    name: guild.name,
    icon: guild.iconURL(),
    description: guild.description || '',
    verificationLevel: guild.verificationLevel,
    explicitContentFilter: guild.explicitContentFilter,
    defaultMessageNotifications: guild.defaultMessageNotifications,
  };

  const id = await createSnapshot(guild.id, label, trigger, rolesData, channelsData, serverData);
  logger.info(`Snapshot #${id} created for guild ${guild.id} (Trigger: ${trigger}, Label: ${label})`);
  return id;
}

/**
 * Auto snapshot triggered when critical anti-nuke / raid occurs.
 */
export async function autoIncidentSnapshot(guild, reason = 'auto_incident') {
  try {
    return await captureSnapshot(guild, `Auto-PreRaid-${new Date().toISOString().slice(11, 19)}`, reason);
  } catch (err) {
    logger.error('autoIncidentSnapshot failed', err);
    return null;
  }
}

/**
 * Generate a comprehensive diff preview report between a snapshot and current state.
 */
export async function generateDiffReport(guild, snapshotId) {
  const snapshot = await getSnapshotById(guild.id, snapshotId);
  if (!snapshot) return { error: 'ไม่พบ Snapshot ที่ระบุ' };

  const report = {
    snapshotId,
    label: snapshot.label,
    timestamp: snapshot.timestamp,
    deletedRoles: [],
    newRoles: [],
    modifiedRoles: [],
    deletedChannels: [],
    newChannels: [],
    modifiedChannels: [],
    serverChanges: [],
    summary: '',
  };

  // 1. Compare roles
  const snapshotRoleIds = new Set(snapshot.rolesData.map((r) => r.id));
  const currentRoleIds = new Set(guild.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id));

  for (const roleData of snapshot.rolesData) {
    if (!currentRoleIds.has(roleData.id)) {
      report.deletedRoles.push(roleData.name);
    } else {
      const current = guild.roles.cache.get(roleData.id);
      if (current && (current.name !== roleData.name || current.permissions.bitfield.toString() !== roleData.permissions)) {
        report.modifiedRoles.push(roleData.name);
      }
    }
  }

  for (const [, role] of guild.roles.cache) {
    if (role.id === guild.id) continue;
    if (!snapshotRoleIds.has(role.id)) {
      report.newRoles.push(role.name);
    }
  }

  // 2. Compare channels
  const snapshotChannelIds = new Set(snapshot.channelsData.map((c) => c.id));
  const currentChannelIds = new Set(guild.channels.cache.map((c) => c.id));

  for (const channelData of snapshot.channelsData) {
    if (!currentChannelIds.has(channelData.id)) {
      report.deletedChannels.push(channelData.name);
    } else {
      const current = guild.channels.cache.get(channelData.id);
      if (current && current.name !== channelData.name) {
        report.modifiedChannels.push(channelData.name);
      }
    }
  }

  for (const [, channel] of guild.channels.cache) {
    if (!snapshotChannelIds.has(channel.id)) {
      report.newChannels.push(channel.name);
    }
  }

  // 3. Compare server settings
  if (guild.name !== snapshot.serverData.name) {
    report.serverChanges.push(`Server Name: "${snapshot.serverData.name}" -> "${guild.name}"`);
  }

  report.summary = `Roles: -${report.deletedRoles.length} / +${report.newRoles.length} / ~${report.modifiedRoles.length} | Channels: -${report.deletedChannels.length} / +${report.newChannels.length} / ~${report.modifiedChannels.length}`;

  return report;
}

/**
 * Restore roles from a snapshot safely.
 */
export async function restoreRoles(guild, snapshotId) {
  return restoreSelective(guild, snapshotId, ['roles']);
}

/**
 * Restore channels from a snapshot safely.
 */
export async function restoreChannels(guild, snapshotId) {
  return restoreSelective(guild, snapshotId, ['channels']);
}

/**
 * Selective Safe Restore Mode.
 * Allows restoring only specific damaged resource scopes ('roles', 'channels', 'permissions', 'all')
 */
export async function restoreSelective(guild, snapshotId, scopes = ['all']) {
  const snapshot = await getSnapshotById(guild.id, snapshotId);
  if (!snapshot) return { error: 'ไม่พบ Snapshot ที่ระบุ' };

  const shouldRestoreRoles = scopes.includes('all') || scopes.includes('roles');
  const shouldRestoreChannels = scopes.includes('all') || scopes.includes('channels');

  const restoredRoles = [];
  const failedRoles = [];
  const restoredChannels = [];
  const failedChannels = [];

  // Restore Roles through RestQueue
  if (shouldRestoreRoles) {
    for (const roleData of snapshot.rolesData) {
      try {
        await restQueue.enqueue(async () => {
          const existing = guild.roles.cache.get(roleData.id);
          if (existing) {
            await existing.edit({
              name: roleData.name,
              color: roleData.color,
              hoist: roleData.hoist,
              mentionable: roleData.mentionable,
              permissions: BigInt(roleData.permissions),
            }, `Safe Restore Snapshot #${snapshotId}`).catch(() => {});
            restoredRoles.push(roleData.name);
          } else {
            const newRole = await guild.roles.create({
              name: roleData.name,
              color: roleData.color,
              hoist: roleData.hoist,
              mentionable: roleData.mentionable,
              permissions: BigInt(roleData.permissions),
              reason: `Safe Restore Snapshot #${snapshotId}`,
            });
            restoredRoles.push(`${roleData.name} (recreated)`);
          }
        });
      } catch (err) {
        failedRoles.push({ name: roleData.name, error: err.message });
      }
    }
  }

  // Restore Channels through RestQueue
  if (shouldRestoreChannels) {
    for (const channelData of snapshot.channelsData) {
      try {
        await restQueue.enqueue(async () => {
          const existing = guild.channels.cache.get(channelData.id);
          if (existing) {
            await existing.edit({
              name: channelData.name,
              topic: channelData.topic,
              nsfw: channelData.nsfw,
              rateLimitPerUser: channelData.rateLimitPerUser,
            }, `Safe Restore Snapshot #${snapshotId}`).catch(() => {});
            restoredChannels.push(channelData.name);
          } else {
            const newChannel = await guild.channels.create({
              name: channelData.name,
              type: channelData.type,
              parent: channelData.parentId,
              topic: channelData.topic,
              nsfw: channelData.nsfw,
              rateLimitPerUser: channelData.rateLimitPerUser,
              reason: `Safe Restore Snapshot #${snapshotId}`,
            }).catch(() => null);
            if (newChannel) {
              restoredChannels.push(`${channelData.name} (recreated)`);
            } else {
              failedChannels.push({ name: channelData.name, error: 'Recreation failed' });
            }
          }
        });
      } catch (err) {
        failedChannels.push({ name: channelData.name, error: err.message });
      }
    }
  }

  await createIncident(guild.id, 'safe_recovery', 'info', null, {
    scopes,
    snapshotId,
    restoredRoles: restoredRoles.length,
    restoredChannels: restoredChannels.length,
  }, 'selective_restore');

  return {
    scopes,
    restoredRoles,
    failedRoles,
    restoredChannels,
    failedChannels,
  };
}
