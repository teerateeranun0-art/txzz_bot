import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed, errorEmbed, EPHEMERAL } from '../utils/embeds.js';
import { safeText, noMentions } from '../utils/sanitize.js';

const jokes = [
  'ทำไมคอมพิวเตอร์ถึงเย็น? เพราะมันเปิด Windows ไว้',
  'โปรแกรมเมอร์กินข้าวที่ไหน? ที่ Stack Overflow',
  'Bug คือ feature ที่ยังไม่มีใครรู้จัก',
  '99 little bugs in the code, take one down patch it around, 127 little bugs in the code...',
  'ทำไม JavaScript ถึงไปงานปาร์ตี้ไม่ได้? เพราะมัน null',
  'I would tell you a UDP joke but you might not get it.',
  'There are only 10 types of people: those who understand binary and those who don\'t.',
];

const eightBall = [
  'แน่นอน!', 'ใช่เลย', 'ไม่ต้องสงสัย', 'ได้เลย', 'ลุย!',
  'ถามอีกที', 'ไม่แน่ใจ', 'ลองใหม่', 'ไม่บอก', 'ห้ามถาม',
  'ไม่', 'ไม่มีทาง', 'อย่าฝัน', 'แย่มาก', 'ไม่น่าเป็นไปได้',
];

const emojifyMap = {
  a: '🇦', b: '🇧', c: '🇨', d: '🇩', e: '🇪', f: '🇫', g: '🇬', h: '🇭',
  i: '🇮', j: '🇯', k: '🇰', l: '🇱', m: '🇲', n: '🇳', o: '🇴', p: '🇵',
  q: '🇶', r: '🇷', s: '🇸', t: '🇹', u: '🇺', v: '🇻', w: '🇼', x: '🇽',
  y: '🇾', z: '🇿', '0': '0️⃣', '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', '4': '4️⃣',
  '5': '5️⃣', '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣', ' ': '  ',
};

export const data = [
  new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('ถามคำถามกับลูกแก้ววิเศษ')
    .addStringOption(o => o.setName('question').setDescription('คำถาม').setRequired(true).setMaxLength(250)),

  new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('โยนเหรียญ'),

  new SlashCommandBuilder()
    .setName('dice')
    .setDescription('ทอยลูกเต๋า')
    .addIntegerOption(o => o.setName('sides').setDescription('จำนวนด้าน (default 6)').setMinValue(2).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName('rps')
    .setDescription('เป่ายิงฉุบ')
    .addStringOption(o =>
      o.setName('choice')
        .setDescription('เลือก')
        .setRequired(true)
        .addChoices(
          { name: '🪨 ค้อน', value: 'rock' },
          { name: '📄 กระดาษ', value: 'paper' },
          { name: '✂️ กรรไกร', value: 'scissors' },
        ),
    ),

  new SlashCommandBuilder()
    .setName('joke')
    .setDescription('เล่า joke'),

  new SlashCommandBuilder()
    .setName('choose')
    .setDescription('สุ่มเลือกจากตัวเลือก')
    .addStringOption(o => o.setName('options').setDescription('คั่นด้วย comma เช่น ข้าว,ก๋วยเตี๋ยว,พิซซ่า').setRequired(true).setMaxLength(500)),

  new SlashCommandBuilder()
    .setName('reverse')
    .setDescription('กลับข้อความ')
    .addStringOption(o => o.setName('text').setDescription('ข้อความ').setRequired(true).setMaxLength(500)),

  new SlashCommandBuilder()
    .setName('emojify')
    .setDescription('แปลงข้อความเป็น emoji')
    .addStringOption(o => o.setName('text').setDescription('ข้อความ').setRequired(true).setMaxLength(100)),

  new SlashCommandBuilder()
    .setName('ascii')
    .setDescription('สร้าง ASCII art ตัวอักษรใหญ่')
    .addStringOption(o => o.setName('text').setDescription('ข้อความ (1-10 ตัว)').setRequired(true).setMaxLength(10)),
];

export const meta = {
  '8ball': { guildOnly: false, cooldown: 3 },
  coinflip: { guildOnly: false, cooldown: 2 },
  dice: { guildOnly: false, cooldown: 2 },
  rps: { guildOnly: false, cooldown: 3 },
  joke: { guildOnly: false, cooldown: 3 },
  choose: { guildOnly: false, cooldown: 3 },
  reverse: { guildOnly: false, cooldown: 2 },
  emojify: { guildOnly: false, cooldown: 3 },
  ascii: { guildOnly: false, cooldown: 3 },
};

const asciiArt = {
  A: ['  █  ', ' █ █ ', '█████', '█   █', '█   █'],
  B: ['████ ', '█   █', '████ ', '█   █', '████ '],
  C: [' ████', '█    ', '█    ', '█    ', ' ████'],
  H: ['█   █', '█   █', '█████', '█   █', '█   █'],
  I: [' ███ ', '  █  ', '  █  ', '  █  ', ' ███ '],
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  ' ': ['  ', '  ', '  ', '  ', '  '],
};

function renderAscii(text) {
  const upper = text.toUpperCase().slice(0, 10);
  const lines = ['', '', '', '', ''];
  for (const char of upper) {
    const art = asciiArt[char] || asciiArt[' '];
    for (let i = 0; i < 5; i++) lines[i] += (art[i] || '  ') + ' ';
  }
  return '```\n' + lines.join('\n') + '\n```';
}

export async function execute(interaction) {
  const { commandName } = interaction;

  if (commandName === '8ball') {
    const q = safeText(interaction.options.getString('question'), 250);
    const answer = eightBall[Math.floor(Math.random() * eightBall.length)];
    const embed = baseEmbed('🎱 Magic 8-Ball', `**คำถาม:** ${q}\n**คำตอบ:** ${answer}`);
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'coinflip') {
    const result = Math.random() < 0.5 ? 'หัว 🪙' : 'ก้อย 🪙';
    await interaction.reply(`โยนเหรียญได้: **${result}**`);
    return;
  }

  if (commandName === 'dice') {
    const sides = interaction.options.getInteger('sides') || 6;
    const roll = Math.floor(Math.random() * sides) + 1;
    await interaction.reply(`🎲 ทอย d${sides} ได้: **${roll}**`);
    return;
  }

  if (commandName === 'rps') {
    const choices = ['rock', 'paper', 'scissors'];
    const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
    const names = { rock: 'ค้อน', paper: 'กระดาษ', scissors: 'กรรไกร' };
    const user = interaction.options.getString('choice');
    const bot = choices[Math.floor(Math.random() * 3)];
    let result;
    if (user === bot) result = 'เสมอ!';
    else if (
      (user === 'rock' && bot === 'scissors')
      || (user === 'paper' && bot === 'rock')
      || (user === 'scissors' && bot === 'paper')
    ) result = 'คุณชนะ! 🎉';
    else result = 'บอทชนะ! 😈';
    await interaction.reply({
      content: `${emojis[user]} vs ${emojis[bot]}\n**คุณ:** ${names[user]} | **บอท:** ${names[bot]}\n${result}`,
      allowedMentions: noMentions(),
    });
    return;
  }

  if (commandName === 'joke') {
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    await interaction.reply({ content: `😂 ${joke}`, allowedMentions: noMentions() });
    return;
  }

  if (commandName === 'choose') {
    const opts = interaction.options.getString('options')
      .split(',')
      .map(s => safeText(s.trim(), 100))
      .filter(Boolean);
    if (opts.length < 2) {
      return interaction.reply({ embeds: [errorEmbed('ต้องมีอย่างน้อย 2 ตัวเลือก คั่นด้วย comma (เช่น ข้าว,ก๋วยเตี๋ยว)')], ...EPHEMERAL });
    }
    const pick = opts[Math.floor(Math.random() * opts.length)];
    await interaction.reply({ content: `🎯 เลือก: **${pick}**`, allowedMentions: noMentions() });
    return;
  }

  if (commandName === 'reverse') {
    const text = safeText(interaction.options.getString('text'), 500);
    await interaction.reply({ content: `🔄 ${[...text].reverse().join('')}`, allowedMentions: noMentions() });
    return;
  }

  if (commandName === 'emojify') {
    const text = interaction.options.getString('text').toLowerCase();
    const result = [...text].map(c => emojifyMap[c] ?? c).join('');
    await interaction.reply({ content: safeText(result, 2000), allowedMentions: noMentions() });
    return;
  }

  if (commandName === 'ascii') {
    const text = safeText(interaction.options.getString('text'), 10);
    await interaction.reply({ content: renderAscii(text), allowedMentions: noMentions() });
  }
}
