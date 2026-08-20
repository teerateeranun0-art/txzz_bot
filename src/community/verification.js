/**
 * Role Verification System (ระบบหน้ายืนยันตัวตนเพื่อรับยศ)
 * Handles verification panels, interactive buttons, modal captchas,
 * role assignment, unverified role removal, anti-raid safety, and audit logs.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { baseEmbed, successEmbed, errorEmbed, infoEmbed } from '../utils/embeds.js';
import {
  getVerificationConfig,
  setVerificationConfig,
  recordVerificationLog,
  isJailed,
  isQuarantined,
} from '../utils/database.js';
import { getLockdownStatus } from '../security/lockdown.js';
import { sendModLog } from '../utils/modlog.js';
import { logger } from '../utils/logger.js';
import { safeText } from '../utils/sanitize.js';

/**
 * Map button style string to Discord ButtonStyle enum
 */
export function resolveButtonStyle(style) {
  const s = String(style || '').toLowerCase();
  if (s === 'primary' || s === 'blurple' || s === 'blue') return ButtonStyle.Primary;
  if (s === 'secondary' || s === 'grey' || s === 'gray') return ButtonStyle.Secondary;
  if (s === 'danger' || s === 'red') return ButtonStyle.Danger;
  return ButtonStyle.Success; // Default: Green
}

/**
 * Generate verification embed for the panel.
 */
export function buildVerificationEmbed(options = {}) {
  const title = options.title || '🛡️ ยืนยันตัวตนเพื่อรับยศ / Member Verification';
  const description = options.description ||
    'ยินดีต้อนรับสู่เซิร์ฟเวอร์! กรุณากดปุ่มด้านล่างเพื่อยืนยันตัวตนและรับยศเข้าใช้งาน\n\n' +
    '📌 **ข้อตกลงและกติกาเบื้องต้น:**\n' +
    '1. โปรดปฏิบัติตามกฎของเซิร์ฟเวอร์อย่างเคร่งครัด\n' +
    '2. ห้ามสแปม ก่อกวน หรือใช้ถ้อยคำไม่สุภาพ\n' +
    '3. ร่วมสร้างสังคมที่ดีและพูดคุยอย่างเป็นมิตร';

  const embed = baseEmbed(title, description)
    .setColor(0x2ecc71) // Nice emerald green
    .setFooter({ text: 'ระบบยืนยันตัวตนอัตโนมัติ • Secured Verification' })
    .setTimestamp();

  if (options.roleId) {
    embed.addFields({
      name: '🎖️ ยศที่จะได้รับ',
      value: `<@&${options.roleId}>`,
      inline: true,
    });
  }

  if (options.mode) {
    const modeLabel = options.mode === 'captcha' ? '🔐 Captcha (ปลอดภัยสูง)' : '⚡ ทันที (Instant Click)';
    embed.addFields({
      name: '⚙️ รูปแบบการยืนยัน',
      value: modeLabel,
      inline: true,
    });
  }

  const minDays = options.minAccountAgeDays ?? 0;
  if (minDays > 0) {
    embed.addFields({
      name: '📅 อายุบัญชีขั้นต่ำ',
      value: `${minDays} วัน`,
      inline: true,
    });
  }

  return embed;
}

/**
 * Generate action row containing the verification button.
 */
export function buildVerificationButton(options = {}) {
  const label = options.buttonText || '✅ ยืนยันตัวตน (รับยศ)';
  const style = resolveButtonStyle(options.buttonStyle);

  const button = new ButtonBuilder()
    .setCustomId('verify_btn_click')
    .setLabel(label.slice(0, 80))
    .setStyle(style);

  return new ActionRowBuilder().addComponents(button);
}

/**
 * Deploy or update the Verification Panel in a channel.
 */
export async function deployVerificationPanel(guild, channel, options = {}) {
  const botMember = guild.members.me;
  if (!channel.permissionsFor(botMember)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) {
    throw new Error('บอทไม่มีสิทธิ์ส่งข้อความและ Embed ในช่องนี้');
  }

  const embed = buildVerificationEmbed(options);
  const row = buildVerificationButton(options);

  let message;
  // If editing an existing panel message in the same channel
  const current = await getVerificationConfig(guild.id);
  if (current?.messageId && current.channelId === channel.id) {
    try {
      const existingMsg = await channel.messages.fetch(current.messageId).catch(() => null);
      if (existingMsg) {
        message = await existingMsg.edit({ embeds: [embed], components: [row] });
      }
    } catch {
      /* fallback to sending new message */
    }
  }

  if (!message) {
    message = await channel.send({ embeds: [embed], components: [row] });
  }

  // Save to database
  const updatedConfig = await setVerificationConfig(guild.id, {
    ...options,
    channelId: channel.id,
    messageId: message.id,
  });

  return { message, config: updatedConfig };
}

/**
 * Generate a random alphanumeric Captcha challenge.
 */
export function generateCaptchaChallenge() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing 0/O, 1/I
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Show Captcha Modal to the user upon clicking the button.
 */
export async function showCaptchaModal(interaction) {
  const code = generateCaptchaChallenge();

  const modal = new ModalBuilder()
    .setCustomId(`verify_modal_submit_${code}`)
    .setTitle('🔐 ยืนยันตัวตน (Captcha Security)');

  const captchaInput = new TextInputBuilder()
    .setCustomId('captcha_code')
    .setLabel(`พิมพ์รหัสยืนยันต่อไปนี้: [ ${code} ]`)
    .setPlaceholder(`พิมพ์ ${code} ตรงนี้ (ตัวพิมพ์ใหญ่/เล็กได้)`)
    .setStyle(TextInputStyle.Short)
    .setMinLength(code.length)
    .setMaxLength(code.length)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(captchaInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

/**
 * Process the verification and assign roles.
 */
export async function processVerification(interaction, member, config, method = 'instant') {
  const guild = interaction.guild;
  const botMember = guild.members.me;

  // 1. Check Anti-Raid / Lockdown status
  const lockdown = await getLockdownStatus(guild.id);
  if (lockdown.state === 'raid' || lockdown.state === 'verification') {
    throw new Error('🛡️ เซิร์ฟเวอร์กำลังอยู่ในโหมดป้องกันการบุกรุก (Raid/Verification Lockdown) การยืนยันตัวตนถูกระงับชั่วคราว โปรดลองใหม่ในภายหลัง');
  }

  // 1.1 Check Jail / Quarantine status
  if (await isJailed(guild.id, member.id) || await isQuarantined(guild.id, member.id)) {
    throw new Error('🚫 คุณกำลังอยู่ระหว่างถูกกักบริเวณ (Jail / Quarantine) ไม่สามารถยืนยันตัวตนหรือรับยศได้ในขณะนี้');
  }

  // 1.2 Check minimum account age requirement
  const minDays = config?.minAccountAgeDays ?? 0;
  if (minDays > 0) {
    const accountAgeMs = Date.now() - (member.user.createdTimestamp ?? 0);
    const accountAgeDays = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24));
    if (accountAgeDays < minDays) {
      throw new Error(
        `⏳ บัญชีของคุณต้องมีอายุอย่างน้อย **${minDays} วัน** จึงจะยืนยันตัวตนได้\n` +
        `📅 บัญชีของคุณมีอายุ **${accountAgeDays} วัน** (อีก ${minDays - accountAgeDays} วันจึงจะสามารถยืนยันได้)`,
      );
    }
  }

  // 2. Validate target role existence
  const role = guild.roles.cache.get(config.roleId);
  if (!role) {
    throw new Error('ไม่พบยศที่กำหนดไว้สำหรับการยืนยันตัวตน โปรดแจ้งผู้ดูแลเซิร์ฟเวอร์');
  }

  // 3. Check bot permissions to manage roles
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('บอทไม่มีสิทธิ์ Manage Roles สำหรับแจกยศ');
  }

  if (role.position >= botMember.roles.highest.position) {
    throw new Error(`ยศ **${role.name}** อยู่สูงกว่ายศสูงสุดของบอท โปรดเลื่อนยศของบอทให้อยู่เหนือกว่ายศนี้`);
  }

  // 4. Check if member already has verified role
  if (member.roles.cache.has(role.id)) {
    return {
      alreadyVerified: true,
      roleName: role.name,
      roleId: role.id,
    };
  }

  // 5. Add verified role
  await member.roles.add(role, `[Verification] Verified via ${method}`);

  // 6. Remove unverified role if configured
  let removedUnverified = false;
  if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) {
    const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);
    if (unverifiedRole && unverifiedRole.position < botMember.roles.highest.position) {
      await member.roles.remove(unverifiedRole, `[Verification] Removed unverified role`).catch(() => {});
      removedUnverified = true;
    }
  }

  // 7. Record verification stats in DB
  await recordVerificationLog(guild.id, member.id, role.id, method);

  // 8. Send log to verification log channel or mod log
  try {
    if (config.logChannelId) {
      const logChannel = guild.channels.cache.get(config.logChannelId);
      if (logChannel?.isTextBased()) {
        const logEmbed = baseEmbed('✅ Member Verified', null)
          .addFields(
            { name: '👤 สมาชิก', value: `${member} (\`${member.id}\`)`, inline: true },
            { name: '🎖️ ยศที่ได้รับ', value: `${role}`, inline: true },
            { name: '⚙️ รูปแบบ', value: `\`${method}\``, inline: true },
          )
          .setFooter({ text: `Total Verified: ${(config.verifiedCount || 0) + 1}` })
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    } else {
      await sendModLog(guild, {
        action: 'Member Verified',
        moderator: { id: botMember.id, toString: () => 'System' },
        target: member.user,
        reason: `Verified via ${method} (Assigned: ${role.name})`,
      });
    }
  } catch (err) {
    logger.warn('Failed to dispatch verification log', err);
  }

  return {
    alreadyVerified: false,
    roleName: role.name,
    roleId: role.id,
    removedUnverified,
  };
}
