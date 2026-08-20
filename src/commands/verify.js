import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed, baseEmbed, EPHEMERAL } from '../utils/embeds.js';
import {
  getVerificationConfig,
  setVerificationConfig,
  deleteVerificationConfig,
  getVerificationStats,
} from '../utils/database.js';
import {
  deployVerificationPanel,
  buildVerificationEmbed,
  buildVerificationButton,
} from '../community/verification.js';
import { safeText } from '../utils/sanitize.js';

export const data = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('ระบบยืนยันตัวตนเพื่อรับยศ (Verification Panel)')
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('สร้างหรืออัพเดทหน้าต่างยืนยันตัวตน (Verification Panel)')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('ช่องสำหรับวางหน้าต่างยืนยันตัวตน')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addRoleOption(o =>
          o.setName('role')
            .setDescription('ยศที่จะมอบให้เมื่อยืนยันตัวตนสำเร็จ')
            .setRequired(true),
        )
        .addRoleOption(o =>
          o.setName('unverified_role')
            .setDescription('ยศที่จะลบออกเมื่อยืนยันสำเร็จ (เช่น ยศยังไม่ยืนยัน)'),
        )
        .addStringOption(o =>
          o.setName('mode')
            .setDescription('รูปแบบการยืนยัน')
            .addChoices(
              { name: '⚡ ทันที (Instant Click - กดปุ่มรับยศเลย)', value: 'instant' },
              { name: '🔐 Captcha (ปลอดภัยสูง - กรอกรหัสสั้นๆ กันบอท)', value: 'captcha' },
            ),
        )
        .addStringOption(o =>
          o.setName('title')
            .setDescription('หัวข้อ Embed (ไม่เกิน 150 ตัวอักษร)')
            .setMaxLength(150),
        )
        .addStringOption(o =>
          o.setName('description')
            .setDescription('คำอธิบาย / กฎของเซิร์ฟเวอร์ (ไม่เกิน 2,000 ตัวอักษร)')
            .setMaxLength(2000),
        )
        .addStringOption(o =>
          o.setName('button_text')
            .setDescription('ข้อความบนปุ่มกด (เช่น ✅ ยืนยันตัวตน)')
            .setMaxLength(80),
        )
        .addStringOption(o =>
          o.setName('button_style')
            .setDescription('สีของปุ่ม')
            .addChoices(
              { name: '🟢 สีเขียว (Success)', value: 'Success' },
              { name: '🔵 สีน้ำเงิน (Primary)', value: 'Primary' },
              { name: '⚪ สีเทา (Secondary)', value: 'Secondary' },
              { name: '🔴 สีแดง (Danger)', value: 'Danger' },
            ),
        )
        .addChannelOption(o =>
          o.setName('log_channel')
            .setDescription('ช่องสำหรับบันทึก Log การยืนยันตัวตน')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption(o =>
          o.setName('min_account_age')
            .setDescription('อายุบัญชีขั้นต่ำ (วัน) ก่อนยืนยันได้ เช่น 7 = ต้องมีบัญชีมาแล้ว 7 วัน')
            .setMinValue(0)
            .setMaxValue(365),
        ),
    )
    .addSubcommand(s =>
      s.setName('status')
        .setDescription('ดูสถานะและสถิติการยืนยันตัวตนของเซิร์ฟเวอร์'),
    )
    .addSubcommand(s =>
      s.setName('test')
        .setDescription('ดูตัวอย่างหน้าต่างยืนยันตัวตนแบบจำลอง (Ephemeral Preview)'),
    )
    .addSubcommand(s =>
      s.setName('disable')
        .setDescription('ปิดการใช้งานระบบยืนยันตัวตน'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),
];

export const meta = {
  verify: {
    guildOnly: true,
    cooldown: 5,
    userPermissions: [PermissionFlagsBits.ManageRoles],
    botPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  },
};

export async function execute(interaction) {
  const { commandName, guild } = interaction;
  if (commandName !== 'verify') return;

  const sub = interaction.options.getSubcommand();
  const botMember = guild.members.me;

  try {
    // ══════════════ /verify setup ══════════════
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const unverifiedRole = interaction.options.getRole('unverified_role');
      const mode = interaction.options.getString('mode') || 'instant';
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const buttonText = interaction.options.getString('button_text');
      const buttonStyle = interaction.options.getString('button_style');
      const logChannel = interaction.options.getChannel('log_channel');

      // Check role hierarchy
      if (role.position >= botMember.roles.highest.position) {
        return interaction.reply({
          embeds: [errorEmbed(`ยศ **${role.name}** อยู่สูงกว่าหรือเท่ากับยศสูงสุดของบอท โปรดเลื่อนยศของบอทให้อยู่เหนือยศนี้ใน Server Settings`)],
          ...EPHEMERAL,
        });
      }

      if (unverifiedRole && unverifiedRole.position >= botMember.roles.highest.position) {
        return interaction.reply({
          embeds: [errorEmbed(`ยศ **${unverifiedRole.name}** อยู่สูงกว่ายศของบอท ไม่สามารถลบออกได้`)],
          ...EPHEMERAL,
        });
      }

      await interaction.deferReply({ ...EPHEMERAL });

      const options = {
        roleId: role.id,
        unverifiedRoleId: unverifiedRole?.id || null,
        logChannelId: logChannel?.id || null,
        mode,
        title: title || undefined,
        description: description || undefined,
        buttonText: buttonText || undefined,
        buttonStyle: buttonStyle || undefined,
        minAccountAgeDays: interaction.options.getInteger('min_account_age') ?? 0,
      };

      const result = await deployVerificationPanel(guild, channel, options);

      const embed = successEmbed(`สร้างหน้าต่างยืนยันตัวตนสำเร็จในช่อง ${channel}`)
        .addFields(
          { name: '🎖️ ยศที่มอบให้', value: `${role}`, inline: true },
          { name: '⚙️ รูปแบบ', value: mode === 'captcha' ? '🔐 Captcha' : '⚡ ทันที (Instant)', inline: true },
          { name: '📩 Panel Message', value: `[คลิกเพื่อไปที่ข้อความ](${result.message.url})`, inline: true },
        );

      if (unverifiedRole) {
        embed.addFields({ name: '🗑️ ยศที่จะลบออก', value: `${unverifiedRole}`, inline: true });
      }
      if (logChannel) {
        embed.addFields({ name: '📜 Log Channel', value: `${logChannel}`, inline: true });
      }
      const minAge = interaction.options.getInteger('min_account_age') ?? 0;
      if (minAge > 0) {
        embed.addFields({ name: '📅 อายุบัญชีขั้นต่ำ', value: `${minAge} วัน`, inline: true });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    // ══════════════ /verify status ══════════════
    if (sub === 'status') {
      const stats = await getVerificationStats(guild.id);
      const config = await getVerificationConfig(guild.id);

      if (!config) {
        return interaction.reply({
          embeds: [infoEmbed('สถานะระบบยืนยันตัวตน', 'เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่าหน้าต่างยืนยันตัวตน\nใช้คำสั่ง `/verify setup` เพื่อเริ่มต้น')],
          ...EPHEMERAL,
        });
      }

      const channelText = config.channelId ? `<#${config.channelId}>` : 'ไม่ระบุ';
      const roleText = config.roleId ? `<@&${config.roleId}>` : 'ไม่ระบุ';
      const unverifiedText = config.unverifiedRoleId ? `<@&${config.unverifiedRoleId}>` : 'ไม่มี';
      const logText = config.logChannelId ? `<#${config.logChannelId}>` : 'ใช้ Mod Log เริ่มต้น';

      const embed = baseEmbed('🛡️ สถานะระบบยืนยันตัวตน (Verification Status)', null)
        .addFields(
          { name: 'สถานะระบบ', value: config.enabled ? '🟢 เปิดใช้งาน' : '🔴 ปิดใช้งาน', inline: true },
          { name: 'ช่องวาง Panel', value: channelText, inline: true },
          { name: 'รูปแบบการยืนยัน', value: config.mode === 'captcha' ? '🔐 Captcha' : '⚡ Instant Click', inline: true },
          { name: 'ยศที่จะได้รับ', value: roleText, inline: true },
          { name: 'ยศที่ลบออก', value: unverifiedText, inline: true },
          { name: 'อายุบัญชีขั้นต่ำ', value: config.minAccountAgeDays > 0 ? `${config.minAccountAgeDays} วัน` : 'ไม่กำหนด', inline: true },
          { name: 'จำนวนผู้ยืนยันแล้ว', value: `**${stats.totalVerified.toLocaleString()}** คน`, inline: true },
          { name: 'ช่องบันทึก Log', value: logText, inline: false },
        );

      if (stats.recentLogs?.length) {
        const lines = stats.recentLogs.slice(0, 5).map((l, i) =>
          `${i + 1}. <@${l.userId}> — <@&${l.roleId}> (<t:${Math.floor(l.verifiedAt / 1000)}:R>) [${l.method}]`
        );
        embed.addFields({ name: '🕒 ผู้ยืนยันล่าสุด', value: lines.join('\n') });
      }

      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════ /verify test ══════════════
    if (sub === 'test') {
      const config = await getVerificationConfig(guild.id) || {};
      const embed = buildVerificationEmbed(config);
      const row = buildVerificationButton(config);

      return interaction.reply({
        content: '🔍 **ตัวอย่างการแสดงผลหน้าต่างยืนยันตัวตน (Preview Mode):**',
        embeds: [embed],
        components: [row],
        ...EPHEMERAL,
      });
    }

    // ══════════════ /verify disable ══════════════
    if (sub === 'disable') {
      await deleteVerificationConfig(guild.id);
      return interaction.reply({
        embeds: [successEmbed('ปิดการใช้งานและลบการตั้งค่าหน้าต่างยืนยันตัวตนเรียบร้อยแล้ว')],
      });
    }
  } catch (err) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    } else {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
  }
}
