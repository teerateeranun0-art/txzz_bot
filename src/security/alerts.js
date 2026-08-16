/**
 * Multi-channel security alert dispatcher.
 * Supports: channel messages, DMs, webhooks.
 * Implements cooldown and aggregation to prevent alert spam.
 */

import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../utils/database.js';

const alertCooldowns = new Map(); // key: guildId:alertType, value: timestamp

const SEVERITY_COLORS = {
  info: 0x5865f2,
  warning: 0xfee75c,
  critical: 0xed4245,
  emergency: 0xff0000,
};

const SEVERITY_EMOJIS = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
  emergency: '🆘',
};

const ALERT_COOLDOWN = 15_000; // 15 seconds between same alert type

/**
 * Send a security alert to the configured alert channel(s).
 */
export async function sendSecurityAlert(guild, title, details, options = {}) {
  const severity = options.severity || 'warning';
  const alertType = options.alertType || title.toLowerCase().replace(/\s+/g, '_');

  // Cooldown check
  const cooldownKey = `${guild.id}:${alertType}`;
  const lastAlert = alertCooldowns.get(cooldownKey) || 0;
  if (Date.now() - lastAlert < ALERT_COOLDOWN && !options.force) {
    return; // Suppress to prevent spam
  }
  alertCooldowns.set(cooldownKey, Date.now());

  const embed = new EmbedBuilder()
    .setColor(SEVERITY_COLORS[severity] || 0x5865f2)
    .setTitle(`${SEVERITY_EMOJIS[severity] || '🔔'} ${title}`)
    .setTimestamp();

  if (details) {
    const fields = [];
    for (const [key, value] of Object.entries(details)) {
      fields.push({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        value: String(value).slice(0, 1024),
        inline: true,
      });
    }
    if (fields.length) embed.addFields(fields);
  }

  // 1. Send to configured mod log channel
  const modLogChannelId = getGuildConfig(guild.id, 'modLogChannel');
  if (modLogChannelId) {
    const channel = guild.channels.cache.get(modLogChannelId);
    if (channel?.isTextBased()) {
      const botMember = guild.members.me;
      if (channel.permissionsFor(botMember)?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ])) {
        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  // 2. DM server owner for critical/emergency
  if (severity === 'critical' || severity === 'emergency') {
    try {
      const owner = await guild.fetchOwner();
      if (owner) {
        await owner.send({ embeds: [embed] }).catch(() => {});
      }
    } catch { /* owner DM failed */ }
  }

  // 3. Send to security alert channel if configured
  const secConfig = guild._securityConfig; // Set by engine
  if (secConfig?.alertChannel) {
    const channel = guild.channels.cache.get(secConfig.alertChannel);
    if (channel?.isTextBased() && channel.id !== modLogChannelId) {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

/**
 * Send a digest of multiple alerts grouped together.
 */
export async function sendDigestAlert(guild, title, alerts) {
  if (!alerts.length) return;

  const embed = new EmbedBuilder()
    .setColor(SEVERITY_COLORS.warning)
    .setTitle(`📋 ${title}`)
    .setDescription(alerts.map((a) => `• ${a}`).join('\n').slice(0, 4096))
    .setTimestamp();

  const modLogChannelId = getGuildConfig(guild.id, 'modLogChannel');
  if (modLogChannelId) {
    const channel = guild.channels.cache.get(modLogChannelId);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

/**
 * Send a security status report.
 */
export async function sendStatusReport(guild, statusData) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🛡️ Security Status Report')
    .addFields(
      { name: 'Lockdown State', value: statusData.lockdownState || 'Normal', inline: true },
      { name: 'Raid Mode', value: statusData.raidMode ? 'Active' : 'Inactive', inline: true },
      { name: 'Recent Incidents', value: String(statusData.incidentCount || 0), inline: true },
      { name: 'Quarantined Users', value: String(statusData.quarantinedCount || 0), inline: true },
      { name: 'Trusted Users', value: String(statusData.trustedCount || 0), inline: true },
      { name: 'Protected Resources', value: String(statusData.protectedCount || 0), inline: true },
    )
    .setTimestamp();

  const modLogChannelId = getGuildConfig(guild.id, 'modLogChannel');
  if (modLogChannelId) {
    const channel = guild.channels.cache.get(modLogChannelId);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

/**
 * Clean up old cooldown entries.
 */
export function cleanupAlertCooldowns() {
  const cutoff = Date.now() - 60_000;
  for (const [key, time] of alertCooldowns) {
    if (time < cutoff) alertCooldowns.delete(key);
  }
}

setInterval(cleanupAlertCooldowns, 60_000);
