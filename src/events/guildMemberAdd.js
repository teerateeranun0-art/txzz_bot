import { Events, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, getVerificationConfig, logModEvent } from '../utils/database.js';
import { welcomeMessage } from '../commands/system.js';
import { canAssignRole } from '../utils/permissions.js';
import { mentionUsers } from '../utils/sanitize.js';
import { processMemberJoin } from '../security/engine.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    // Skip bots — they should not receive autorole, unverified roles, or welcome messages
    if (member.user?.bot) return;

    // Security: anti-raid, account age check, join rate limiting
    try {
      await processMemberJoin(member);
    } catch (err) {
      logger.error('Security: processMemberJoin failed', err);
    }

    const botMember = member.guild.members.me;
    let roleId = getGuildConfig(member.guild.id, 'autorole');

    // If autorole is not set, check if verification system has an unverified_role configured
    if (!roleId) {
      try {
        const verifyCfg = await getVerificationConfig(member.guild.id);
        if (verifyCfg?.enabled && verifyCfg?.unverifiedRoleId) {
          roleId = verifyCfg.unverifiedRoleId;
        }
      } catch {
        /* ignore */
      }
    }

    if (roleId && botMember) {
      const role = member.guild.roles.cache.get(roleId);
      const check = canAssignRole(member.guild, botMember, role);
      if (check.ok) await member.roles.add(role, 'autorole/unverified').catch(() => {});
    }

    const channelId = getGuildConfig(member.guild.id, 'welcomeChannel');
    if (!channelId) return;
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    if (!channel.permissionsFor(botMember)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ])) return;

    const template = getGuildConfig(member.guild.id, 'welcomeMessage');
    await channel.send({
      content: welcomeMessage(template, member),
      allowedMentions: mentionUsers(member.id),
    }).catch(() => {});

    // Log member join
    try {
      await logModEvent(member.guild.id, 'member', 'member_join', {
        userId: member.id,
        details: {
          accountCreated: member.user?.createdTimestamp,
          accountAge: Date.now() - (member.user?.createdTimestamp || 0),
        },
      });
    } catch { /* ignore */ }
  },
};
