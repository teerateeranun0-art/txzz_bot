import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';

export const INVITE_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ViewAuditLog,
];

export function invitePermissionBits() {
  return new PermissionsBitField(INVITE_PERMISSIONS).bitfield.toString();
}

export function canModerate(guild, moderator, target, botMember) {
  if (!target) return { ok: false, reason: 'ไม่พบสมาชิกในเซิร์ฟเวอร์' };
  if (!moderator) return { ok: false, reason: 'ไม่พบผู้ใช้คำสั่ง' };
  if (!botMember) return { ok: false, reason: 'บอทยังไม่พร้อมในเซิร์ฟเวอร์นี้' };
  if (target.id === moderator.id) return { ok: false, reason: 'ไม่สามารถใช้คำสั่งนี้กับตัวเองได้' };
  if (target.id === guild.ownerId) return { ok: false, reason: 'ไม่สามารถจัดการเจ้าของเซิร์ฟเวอร์ได้' };
  if (target.id === botMember.id) return { ok: false, reason: 'ไม่สามารถจัดการบอทได้' };
  if (moderator.id !== guild.ownerId
    && target.roles.highest.position >= moderator.roles.highest.position) {
    return { ok: false, reason: 'บทบาทของเป้าหมายสูงกว่าหรือเท่ากับคุณ' };
  }
  if (target.roles.highest.position >= botMember.roles.highest.position) {
    return { ok: false, reason: 'บทบาทของเป้าหมายสูงกว่าหรือเท่ากับบอท' };
  }
  return { ok: true };
}

export function canAssignRole(guild, botMember, role) {
  if (!role) return { ok: false, reason: 'ไม่พบบทบาท' };
  if (role.id === guild.id) return { ok: false, reason: 'ไม่สามารถใช้บทบาท @everyone ได้' };
  if (role.managed) return { ok: false, reason: 'ไม่สามารถใช้บทบาทที่ระบบจัดการได้' };
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, reason: 'บอทไม่มีสิทธิ์ Manage Roles' };
  }
  if (role.position >= botMember.roles.highest.position) {
    return { ok: false, reason: 'บทบาทนี้สูงกว่าหรือเท่ากับบอท' };
  }
  return { ok: true };
}

export function memberHas(member, permissions = []) {
  if (!permissions.length) return true;
  if (!member) return false;
  return member.permissions.has(permissions, true);
}

export function botHasInChannel(channel, botMember, permissions = []) {
  if (!permissions.length) return true;
  if (!channel || !botMember) return false;
  return channel.permissionsFor(botMember)?.has(permissions, true) ?? false;
}

export function permissionNames(permissions) {
  return new PermissionsBitField(permissions)
    .toArray()
    .map(name => `\`${name}\``)
    .join(', ');
}
