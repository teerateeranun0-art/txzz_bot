import { SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { successEmbed, errorEmbed, infoEmbed, baseEmbed, EPHEMERAL } from '../utils/embeds.js';
import {
  load,
  getUserEconomy,
  updateUserEconomy,
  withEconomy,
  ensureEconomy,
  getEconomyLeaderboard,
  transferMoneyStrict,
  depositMoneyStrict,
  withdrawMoneyStrict,
  gambleMoneyStrict,
  robMoneyStrict,
} from '../utils/database.js';
import { noMentions } from '../utils/sanitize.js';

function formatMoney(n) {
  return n.toLocaleString('th-TH');
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const data = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('ดูยอดเงิน')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้'))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('รับเงินรายวัน')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('work')
    .setDescription('ทำงานหาเงิน')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('เดิมพัน')
    .addIntegerOption(o => o.setName('amount').setDescription('จำนวนเงิน').setRequired(true).setMinValue(10).setMaxValue(25000))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('pay')
    .setDescription('โอนเงิน')
    .addUserOption(o => o.setName('user').setDescription('ผู้รับ').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('จำนวน').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('อันดับเงินสูงสุดของเซิร์ฟเวอร์นี้')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('ฝากเงินเข้าธนาคาร')
    .addIntegerOption(o => o.setName('amount').setDescription('จำนวน').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('ถอนเงินจากธนาคาร')
    .addIntegerOption(o => o.setName('amount').setDescription('จำนวน').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('rob')
    .setDescription('ปล้นเงินผู้ใช้ (เสี่ยง!)')
    .addUserOption(o => o.setName('user').setDescription('เป้าหมาย').setRequired(true))
    .setDMPermission(false),
];

export const meta = {
  balance: { guildOnly: true, cooldown: 3 },
  daily: { guildOnly: true, cooldown: 5 },
  work: { guildOnly: true, cooldown: 5 },
  gamble: { guildOnly: true, cooldown: 8 },
  pay: { guildOnly: true, cooldown: 8 },
  leaderboard: { guildOnly: true, cooldown: 10 },
  deposit: { guildOnly: true, cooldown: 3 },
  withdraw: { guildOnly: true, cooldown: 3 },
  rob: { guildOnly: true, cooldown: 15 },
};

export async function execute(interaction) {
  const { commandName, guild } = interaction;
  const userId = interaction.user.id;
  const guildId = guild.id;
  const ec = config.economy;

  if (commandName === 'balance') {
    const target = interaction.options.getUser('user') || interaction.user;
    const data = await ensureEconomy(guildId, target.id);
    const total = data.balance + data.bank;
    const embed = infoEmbed(`ยอดเงิน - ${target.username}`, null)
      .addFields(
        { name: 'กระเป๋า', value: `${formatMoney(data.balance)} เหรียญ`, inline: true },
        { name: 'ธนาคาร', value: `${formatMoney(data.bank)} เหรียญ`, inline: true },
        { name: 'รวม', value: `${formatMoney(total)} เหรียญ`, inline: true },
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'daily') {
    await withEconomy(guildId, userId, async () => {
      const data = getUserEconomy(guildId, userId);
      const now = Date.now();
      if (now - data.lastDaily < ec.dailyCooldown) {
        const ready = data.lastDaily + ec.dailyCooldown;
        await interaction.reply({
          embeds: [errorEmbed(`รับ daily ได้อีกใน <t:${Math.floor(ready / 1000)}:R>`)],
          ...EPHEMERAL,
        });
        return;
      }
      const amount = randomBetween(ec.dailyMin, ec.dailyMax);
      updateUserEconomy(guildId, userId, { balance: data.balance + amount, lastDaily: now });
      await interaction.reply({ embeds: [successEmbed(`รับ daily **${formatMoney(amount)}** เหรียญแล้ว`)] });
    });
    return;
  }

  if (commandName === 'work') {
    await withEconomy(guildId, userId, async () => {
      const data = getUserEconomy(guildId, userId);
      const now = Date.now();
      if (now - data.lastWork < ec.workCooldown) {
        const ready = data.lastWork + ec.workCooldown;
        await interaction.reply({
          embeds: [errorEmbed(`ทำงานได้อีกใน <t:${Math.floor(ready / 1000)}:R>`)],
          ...EPHEMERAL,
        });
        return;
      }
      const jobs = ['เขียนโค้ด', 'ส่งของ', 'ทำอาหาร', 'ขับแท็กซี่', 'สอนหนังสือ', 'ออกแบบกราฟิก'];
      const job = jobs[Math.floor(Math.random() * jobs.length)];
      const amount = randomBetween(ec.workMin, ec.workMax);
      updateUserEconomy(guildId, userId, { balance: data.balance + amount, lastWork: now });
      await interaction.reply({ embeds: [successEmbed(`ทำงาน **${job}** ได้ **${formatMoney(amount)}** เหรียญ`)] });
    });
    return;
  }

  if (commandName === 'gamble') {
    const amount = Math.min(interaction.options.getInteger('amount'), ec.gambleMax);
    const win = Math.random() < 0.45;
    try {
      const result = await gambleMoneyStrict(guildId, userId, amount, win, 1);
      const msg = win
        ? `ชนะ! ได้ **+${formatMoney(amount)}** เหรียญ (ยอดคงเหลือ: ${formatMoney(result.balance)} เหรียญ)`
        : `แพ้! เสีย **-${formatMoney(amount)}** เหรียญ (ยอดคงเหลือ: ${formatMoney(result.balance)} เหรียญ)`;
      await interaction.reply({ embeds: [win ? successEmbed(msg) : errorEmbed(msg)] });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
    return;
  }

  if (commandName === 'pay') {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    if (target.id === userId) {
      return interaction.reply({ embeds: [errorEmbed('โอนให้ตัวเองไม่ได้')], ...EPHEMERAL });
    }
    if (target.bot) {
      return interaction.reply({ embeds: [errorEmbed('โอนให้บอทไม่ได้')], ...EPHEMERAL });
    }
    try {
      const result = await transferMoneyStrict(guildId, userId, target.id, amount);
      await interaction.reply({
        embeds: [successEmbed(`โอน **${formatMoney(amount)}** เหรียญให้ **${target.username}** สำเร็จ (ยอดคงเหลือของคุณ: ${formatMoney(result.senderBalance)})`)],
        allowedMentions: noMentions(),
      });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
    return;
  }

  if (commandName === 'leaderboard') {
    const sorted = await getEconomyLeaderboard(guildId, 10);
    if (!sorted.length) return interaction.reply({ content: 'ยังไม่มีข้อมูลในเซิร์ฟเวอร์นี้', ...EPHEMERAL });
    const lines = await Promise.all(sorted.map(async (entry, i) => {
      const user = await interaction.client.users.fetch(entry.userId).catch(() => null);
      const name = user ? user.username : entry.userId;
      const medal = i === 0 ? '1.' : `${i + 1}.`;
      return `${medal} **${name}** — ${formatMoney(entry.total)} เหรียญ`;
    }));
    await interaction.reply({ embeds: [baseEmbed('Leaderboard', lines.join('\n'))] });
    return;
  }

  if (commandName === 'deposit') {
    const amount = interaction.options.getInteger('amount');
    try {
      const res = await depositMoneyStrict(guildId, userId, amount);
      await interaction.reply({
        embeds: [successEmbed(`ฝาก **${formatMoney(amount)}** เหรียญเข้าธนาคารแล้ว (กระเป๋า: ${formatMoney(res.balance)} | ธนาคาร: ${formatMoney(res.bank)})`)],
      });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
    return;
  }

  if (commandName === 'withdraw') {
    const amount = interaction.options.getInteger('amount');
    try {
      const res = await withdrawMoneyStrict(guildId, userId, amount);
      await interaction.reply({
        embeds: [successEmbed(`ถอน **${formatMoney(amount)}** เหรียญจากธนาคารแล้ว (กระเป๋า: ${formatMoney(res.balance)} | ธนาคาร: ${formatMoney(res.bank)})`)],
      });
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
    return;
  }

  if (commandName === 'rob') {
    const target = interaction.options.getUser('user');
    if (target.id === userId) {
      return interaction.reply({ embeds: [errorEmbed('ปล้นตัวเองไม่ได้')], ...EPHEMERAL });
    }
    if (target.bot) {
      return interaction.reply({ embeds: [errorEmbed('ปล้นบอทไม่ได้')], ...EPHEMERAL });
    }

    const robber = await ensureEconomy(guildId, userId);
    const now = Date.now();
    if (now - robber.lastRob < ec.robCooldown) {
      const ready = robber.lastRob + ec.robCooldown;
      await interaction.reply({
        embeds: [errorEmbed(`ปล้นได้อีกใน <t:${Math.floor(ready / 1000)}:R>`)],
        ...EPHEMERAL,
      });
      return;
    }

    const victim = await ensureEconomy(guildId, target.id);
    if (victim.balance < 100) {
      await interaction.reply({ embeds: [errorEmbed('เป้าหมายมีเงินในกระเป๋าน้อยเกินไป (ต้องมีอย่างน้อย 100 เหรียญ)')], ...EPHEMERAL });
      return;
    }

    const success = Math.random() < 0.35;
    const stolenAmount = randomBetween(50, 200);
    const fineAmount = Math.min(100, robber.balance);

    try {
      const result = await robMoneyStrict(guildId, userId, target.id, success, stolenAmount, fineAmount);
      if (result.success) {
        await interaction.reply({
          embeds: [successEmbed(`ปล้น **${target.username}** สำเร็จ! ได้เงินมา **+${formatMoney(result.stolen)}** เหรียญ`)],
          allowedMentions: noMentions(),
        });
      } else {
        await interaction.reply({
          embeds: [errorEmbed(`ถูกตำรวจจับ! โดนปรับเงิน **-${formatMoney(result.fine)}** เหรียญ`)],
        });
      }
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed(err.message)], ...EPHEMERAL });
    }
  }
}
