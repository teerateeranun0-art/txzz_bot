import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from 'discord.js';
import ms from 'ms';
import QRCode from 'qrcode';
import { AttachmentBuilder } from 'discord.js';
import { successEmbed, errorEmbed, baseEmbed } from '../utils/embeds.js';
import { addReminder, setAfk, clearAfk } from '../utils/database.js';

export const data = [
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('สร้างโพล')
    .addStringOption(o => o.setName('question').setDescription('คำถาม').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('ตัวเลือก 1').setRequired(true))
    .addStringOption(o => o.setName('option2').setDescription('ตัวเลือก 2').setRequired(true))
    .addStringOption(o => o.setName('option3').setDescription('ตัวเลือก 3'))
    .addStringOption(o => o.setName('option4').setDescription('ตัวเลือก 4')),

  new SlashCommandBuilder()
    .setName('remind')
    .setDescription('ตั้งเตือนความจำ')
    .addStringOption(o => o.setName('time').setDescription('เวลา เช่น 10m, 2h, 1d').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('ข้อความ').setRequired(true)),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('สร้าง embed')
    .addStringOption(o => o.setName('title').setDescription('หัวข้อ').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('เนื้อหา').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('สี hex เช่น #5865F2'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('ให้บอทพูด')
    .addStringOption(o => o.setName('message').setDescription('ข้อความ').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('ช่อง').addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('calc')
    .setDescription('เครื่องคิดเลข')
    .addStringOption(o => o.setName('expression').setDescription('นิพจน์ เช่น 2+2*5').setRequired(true)),

  new SlashCommandBuilder()
    .setName('base64')
    .setDescription('เข้ารหัส/ถอดรหัส Base64')
    .addStringOption(o => o.setName('text').setDescription('ข้อความ').setRequired(true))
    .addStringOption(o =>
      o.setName('mode')
        .setDescription('โหมด')
        .setRequired(true)
        .addChoices(
          { name: 'Encode', value: 'encode' },
          { name: 'Decode', value: 'decode' },
        ),
    ),

  new SlashCommandBuilder()
    .setName('password')
    .setDescription('สร้างรหัสผ่านสุ่ม')
    .addIntegerOption(o => o.setName('length').setDescription('ความยาว (8-64)').setMinValue(8).setMaxValue(64)),

  new SlashCommandBuilder()
    .setName('qr')
    .setDescription('สร้าง QR Code')
    .addStringOption(o => o.setName('text').setDescription('ข้อความ/URL').setRequired(true)),

  new SlashCommandBuilder()
    .setName('afk')
    .setDescription('ตั้งสถานะ AFK')
    .addStringOption(o => o.setName('reason').setDescription('เหตุผล')),
];

function safeEval(expr) {
  const cleaned = expr.replace(/[^0-9+\-*/().%\s]/g, '');
  if (!cleaned.trim()) throw new Error('invalid');
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${cleaned})`)();
}

function generatePassword(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let pass = '';
  for (let i = 0; i < length; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
}

export async function execute(interaction) {
  const { commandName } = interaction;

  if (commandName === 'poll') {
    const question = interaction.options.getString('question');
    const options = ['option1', 'option2', 'option3', 'option4']
      .map(k => interaction.options.getString(k))
      .filter(Boolean);
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
    const desc = options.map((o, i) => `${emojis[i]} ${o}`).join('\n');
    const embed = baseEmbed(`📊 ${question}`, desc);
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    for (let i = 0; i < options.length; i++) await msg.react(emojis[i]);
    return;
  }

  if (commandName === 'remind') {
    const timeStr = interaction.options.getString('time');
    const message = interaction.options.getString('message');
    const duration = ms(timeStr);
    if (!duration || duration > 2592000000) {
      return interaction.reply({ embeds: [errorEmbed('เวลาไม่ถูกต้อง (สูงสุด 30 วัน) ใช้ 10m, 2h, 1d')], ephemeral: true });
    }
    const remindAt = Date.now() + duration;
    await addReminder(interaction.user.id, interaction.channel.id, message, remindAt);
    await interaction.reply({
      embeds: [successEmbed(`⏰ จะเตือนคุณ <t:${Math.floor(remindAt / 1000)}:R>\n📝 ${message}`)],
      ephemeral: true,
    });
    return;
  }

  if (commandName === 'embed') {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const colorHex = interaction.options.getString('color');
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setTimestamp();
    if (colorHex) {
      const color = parseInt(colorHex.replace('#', ''), 16);
      if (!Number.isNaN(color)) embed.setColor(color);
    }
    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({ embeds: [successEmbed('ส่ง embed แล้ว')], ephemeral: true });
    return;
  }

  if (commandName === 'say') {
    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await channel.send(message);
    await interaction.reply({ embeds: [successEmbed(`ส่งข้อความใน ${channel} แล้ว`)], ephemeral: true });
    return;
  }

  if (commandName === 'calc') {
    const expr = interaction.options.getString('expression');
    try {
      const result = safeEval(expr);
      await interaction.reply(`🔢 \`${expr}\` = **${result}**`);
    } catch {
      await interaction.reply({ embeds: [errorEmbed('นิพจน์ไม่ถูกต้อง')], ephemeral: true });
    }
    return;
  }

  if (commandName === 'base64') {
    const text = interaction.options.getString('text');
    const mode = interaction.options.getString('mode');
    try {
      const result = mode === 'encode'
        ? Buffer.from(text).toString('base64')
        : Buffer.from(text, 'base64').toString('utf8');
      await interaction.reply({ content: `\`\`\`${result.slice(0, 1900)}\`\`\``, ephemeral: true });
    } catch {
      await interaction.reply({ embeds: [errorEmbed('ถอดรหัสไม่สำเร็จ')], ephemeral: true });
    }
    return;
  }

  if (commandName === 'password') {
    const length = interaction.options.getInteger('length') || 16;
    const pass = generatePassword(length);
    await interaction.reply({ content: `🔐 รหัสผ่านของคุณ:\n||${pass}||`, ephemeral: true });
    return;
  }

  if (commandName === 'qr') {
    const text = interaction.options.getString('text');
    const buffer = await QRCode.toBuffer(text, { width: 300 });
    const attachment = new AttachmentBuilder(buffer, { name: 'qrcode.png' });
    await interaction.reply({ files: [attachment] });
    return;
  }

  if (commandName === 'afk') {
    const reason = interaction.options.getString('reason') || 'AFK';
    setAfk(interaction.user.id, reason);
    await interaction.reply({ embeds: [successEmbed(`💤 ตั้ง AFK: **${reason}**`)] });
  }
}
