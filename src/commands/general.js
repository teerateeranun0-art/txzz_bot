import { SlashCommandBuilder } from 'discord.js';
import { baseEmbed } from '../utils/embeds.js';
import { invitePermissionBits } from '../utils/permissions.js';

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d}d ${h}h ${m}m ${sec}s`;
}

export const data = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('ตรวจสอบความหน่วงของบอท'),

  new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('ดูเวลาที่บอททำงาน'),

  new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('ข้อมูลบอท'),

  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('ข้อมูลเซิร์ฟเวอร์')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('ข้อมูลผู้ใช้')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้ที่ต้องการดู')),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('ดูรูปโปรไฟล์')
    .addUserOption(o => o.setName('user').setDescription('ผู้ใช้')),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('รายการคำสั่งทั้งหมด')
    .addStringOption(o =>
      o.setName('category')
        .setDescription('หมวดหมู่')
        .addChoices(
          { name: 'ทั่วไป', value: 'general' },
          { name: 'ม็อด', value: 'moderation' },
          { name: 'ม็อดขั้นสูง', value: 'mod-advanced' },
          { name: 'สนุก', value: 'fun' },
          { name: 'เศรษฐกิจ', value: 'economy' },
          { name: 'ยูทิลิตี้', value: 'utility' },
          { name: 'ระบบ', value: 'system' },
          { name: 'ชุมชน', value: 'community' },
          { name: 'ความปลอดภัย', value: 'security' },
          { name: 'AutoMod', value: 'automod' },
        ),
    ),

  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('ลิงก์เชิญบอท'),
];

export const meta = {
  ping: { guildOnly: false, cooldown: 5 },
  uptime: { guildOnly: false, cooldown: 5 },
  botinfo: { guildOnly: false, cooldown: 5 },
  serverinfo: { guildOnly: true, cooldown: 5 },
  userinfo: { guildOnly: false, cooldown: 5 },
  avatar: { guildOnly: false, cooldown: 5 },
  help: { guildOnly: false, cooldown: 3 },
  invite: { guildOnly: false, cooldown: 10 },
};

export async function execute(interaction, client) {
  const { commandName } = interaction;

  if (commandName === 'ping') {
    const sent = await interaction.reply({ content: 'Pong!', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const api = Math.round(client.ws.ping);
    await interaction.editReply(`Pong!\nLatency: **${latency}ms**\nAPI: **${api}ms**`);
    return;
  }

  if (commandName === 'uptime') {
    await interaction.reply(`บอททำงานมาแล้ว: **${formatUptime(Date.now() - client.startTime)}**`);
    return;
  }

  if (commandName === 'botinfo') {
    const embed = baseEmbed('Ultimate Bot', 'บอท Discord ครบฟีเจอร์')
      .addFields(
        { name: 'เซิร์ฟเวอร์', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'คำสั่ง', value: `${client.commands.size}`, inline: true },
        { name: 'Uptime', value: formatUptime(Date.now() - client.startTime), inline: true },
        { name: 'Node.js', value: process.version, inline: true },
        { name: 'Discord.js', value: 'v14', inline: true },
        { name: 'Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
      )
      .setThumbnail(client.user.displayAvatarURL());
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'serverinfo') {
    const guild = interaction.guild;
    const owner = await guild.fetchOwner().catch(() => null);
    const embed = baseEmbed(`${guild.name}`, guild.description ? guild.description.slice(0, 200) : null)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: 'เจ้าของ', value: owner ? owner.user.username : 'ไม่ทราบ', inline: true },
        { name: 'ID', value: `\`${guild.id}\``, inline: true },
        { name: 'สร้างเมื่อ', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'สมาชิก', value: `${guild.memberCount}`, inline: true },
        { name: 'ช่อง', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'บทบาท', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'อีโมจิ', value: `${guild.emojis.cache.size}`, inline: true },
        { name: 'ระดับ Boost', value: `Level ${guild.premiumTier}`, inline: true },
        { name: 'Boost', value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'userinfo') {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild
      ? await interaction.guild.members.fetch(user.id).catch(() => null)
      : null;
    const embed = baseEmbed(`${user.username}`, null)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: `\`${user.id}\``, inline: true },
        { name: 'บอท', value: user.bot ? 'ใช่' : 'ไม่', inline: true },
        { name: 'สร้างบัญชี', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      );
    if (member) {
      embed.addFields(
        { name: 'เข้าร่วมเซิร์ฟ', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'บทบาทสูงสุด', value: member.roles.highest.toString(), inline: true },
        { name: 'สี', value: member.displayHexColor, inline: true },
      );
    }
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'avatar') {
    const user = interaction.options.getUser('user') || interaction.user;
    const url = user.displayAvatarURL({ size: 4096 });
    const embed = baseEmbed(`Avatar - ${user.username}`, null)
      .setImage(url)
      .setURL(url);
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'help') {
    const cat = interaction.options.getString('category');
    const categories = {
      general: '**ทั่วไป:** `/ping` `/uptime` `/botinfo` `/serverinfo` `/userinfo` `/avatar` `/help` `/invite`',
      moderation: '**ม็อด:** `/kick` `/ban` `/unban` `/timeout` `/untimeout` `/clear` `/warn` `/warnings` `/clearwarns` `/slowmode` `/lock` `/unlock` `/nick`',
      fun: '**สนุก:** `/8ball` `/coinflip` `/dice` `/rps` `/joke` `/choose` `/reverse` `/emojify` `/ascii`',
      economy: '**เศรษฐกิจ:** `/balance` `/daily` `/work` `/gamble` `/pay` `/leaderboard` `/deposit` `/withdraw` `/rob`',
      utility: '**ยูทิลิตี้:** `/poll` `/remind` `/embed` `/say` `/calc` `/base64` `/password` `/qr` `/afk`',
      system: '**ระบบ:** `/welcome` `/autorole` `/rank` `/levelboard` `/ticket`',
      community: '**ชุมชน:** `/giveaway` `/suggestion` `/birthday` `/announce` `/counting` `/wordchain` `/reactionrole` `/starboard`',
      security: '**ความปลอดภัย:** `/security` `/lockdown` `/panic` `/raidmode` `/trusted` `/trusted-role` `/protected` `/incident` `/score` `/snapshot` `/quarantine`',
      'mod-advanced': '**ม็อดขั้นสูง:** `/case` `/modnote` `/moddashboard` `/tempban` `/temprole` `/tempinfo` `/jail` `/unjail` `/jail-list` `/report` `/modqueue` `/appeal` `/punish-rule`',
      automod: '**AutoMod:** `/automod spam` `/automod flood` `/automod caps` `/automod emoji` `/automod links` `/automod invites` `/automod mentions` `/automod duplicates` `/automod scam` `/automod attachments` `/automod status` `/automod filter-add` `/automod filter-remove` `/automod filter-list` `/automod whitelist-role` `/automod whitelist-channel`',
    };
    if (cat && categories[cat]) {
      await interaction.reply({ content: categories[cat], ephemeral: true });
      return;
    }
    const embed = baseEmbed('คู่มือคำสั่ง Ultimate Bot', 'ใช้ `/help category:<หมวด>` เพื่อดูรายละเอียด')
      .addFields(
        Object.entries(categories).map(([key, val]) => ({
          name: val.split(':')[0].replaceAll('*', ''),
          value: `\`/help category:${key}\``,
          inline: true,
        })),
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (commandName === 'invite') {
    const perms = invitePermissionBits();
    const url = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=${perms}&scope=bot%20applications.commands`;
    await interaction.reply({ content: `[เชิญบอทเข้าเซิร์ฟเวอร์](${url})` });
  }
}
