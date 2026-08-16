import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import ms from 'ms';
import { successEmbed, errorEmbed, baseEmbed, EPHEMERAL } from '../utils/embeds.js';
import {
  createGiveaway,
  getGiveaway,
  getGiveawayByMessage,
  getActiveGiveaways,
  updateGiveawayMessage,
  endGiveaway as dbEndGiveaway,
  updateGiveaway,
} from '../utils/database.js';
import { safeText } from '../utils/sanitize.js';

const GIVEAWAY_EMOJI = '🎉';

export const data = [
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('ระบบ Giveaway')
    .addSubcommand(s =>
      s.setName('start')
        .setDescription('เริ่ม Giveaway ใหม่')
        .addStringOption(o => o.setName('prize').setDescription('ของรางวัล').setRequired(true).setMaxLength(200))
        .addStringOption(o => o.setName('duration').setDescription('ระยะเวลา เช่น 1h, 30m, 1d').setRequired(true))
        .addIntegerOption(o => o.setName('winners').setDescription('จำนวนผู้ชนะ').setMinValue(1).setMaxValue(20))
        .addChannelOption(o => o.setName('channel').setDescription('ช่องจัด Giveaway').addChannelTypes(ChannelType.GuildText))
        .addRoleOption(o => o.setName('role').setDescription('ต้องมี role นี้จึงจะเข้าร่วมได้'))
        .addIntegerOption(o => o.setName('minlevel').setDescription('เลเวลขั้นต่ำ').setMinValue(1)),
    )
    .addSubcommand(s =>
      s.setName('end')
        .setDescription('จบ Giveaway ล่วงหน้า')
        .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('reroll')
        .setDescription('สุ่มผู้ชนะใหม่')
        .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)),
    )
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('ดู Giveaway ที่กำลัง active'),
    )
    .addSubcommand(s =>
      s.setName('edit')
        .setDescription('แก้ไข Giveaway ที่กำลัง active')
        .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
        .addStringOption(o => o.setName('prize').setDescription('ของรางวัลใหม่').setMaxLength(200))
        .addIntegerOption(o => o.setName('winners').setDescription('จำนวนผู้ชนะใหม่').setMinValue(1).setMaxValue(20))
        .addStringOption(o => o.setName('addtime').setDescription('เพิ่มเวลา เช่น 1h, 30m')),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
];

export const meta = {
  giveaway: { guildOnly: true, cooldown: 5 },
};

function pickWinners(entries, count) {
  if (entries.length <= count) return [...entries];
  const pool = [...entries];
  const winners = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

async function sendGiveawayMessage(channel, gw) {
  const endsTimestamp = Math.floor(gw.endsAt / 1000);
  const requirements = gw.requirements || {};
  const reqParts = [];
  if (requirements.role) reqParts.push(`Must have <@&${requirements.role}>`);
  if (requirements.minLevel) reqParts.push(`Minimum level: ${requirements.minLevel}`);

  const embed = baseEmbed(`🎉 Giveaway: ${safeText(gw.prize, 200)}`)
    .addFields(
      { name: 'Winners', value: `${gw.winnersCount}`, inline: true },
      { name: 'Ends', value: `<t:${endsTimestamp}:R> (<t:${endsTimestamp}:f>)`, inline: true },
      { name: 'Host', value: `<@${gw.hostId}>`, inline: true },
    )
    .setFooter({ text: `Giveaway #${gw.id}` });

  if (reqParts.length) {
    embed.addFields({ name: 'Requirements', value: reqParts.join('\n') });
  }

  const msg = await channel.send({
    content: `🎉 **GIVEAWAY** 🎉`,
    embeds: [embed],
  });
  await msg.react(GIVEAWAY_EMOJI);
  return msg;
}

export async function execute(interaction, client) {
  const { commandName, guild } = interaction;
  if (commandName !== 'giveaway') return;

  const sub = interaction.options.getSubcommand();

  if (sub === 'start') {
    const prize = interaction.options.getString('prize');
    const duration = interaction.options.getString('duration');
    const winnersCount = interaction.options.getInteger('winners') || 1;
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const requiredRole = interaction.options.getRole('role');
    const minLevel = interaction.options.getInteger('minlevel');

    const durationMs = ms(duration);
    if (!durationMs || durationMs < 30_000 || durationMs > 30 * 24 * 60 * 60 * 1000) {
      return interaction.reply({ embeds: [errorEmbed('Duration must be between 30s and 30 days')], ...EPHEMERAL });
    }

    const endsAt = Date.now() + durationMs;
    const requirements = {};
    if (requiredRole) requirements.role = requiredRole.id;
    if (minLevel) requirements.minLevel = minLevel;

    await interaction.deferReply({ ephemeral: true });

    const gwId = await createGiveaway(guild.id, channel.id, interaction.user.id, prize, winnersCount, endsAt, requirements);

    const gw = { id: gwId, prize, winnersCount, endsAt, hostId: interaction.user.id, requirements };
    const msg = await sendGiveawayMessage(channel, gw);

    await updateGiveawayMessage(gwId, msg.id);

    await interaction.editReply({ embeds: [successEmbed(`Giveaway #${gwId} started in ${channel}\nEnds <t:${Math.floor(endsAt / 1000)}:R>`)] });
    return;
  }

  if (sub === 'end') {
    const id = interaction.options.getInteger('id');
    await interaction.deferReply({ ephemeral: true });

    const gw = await getGiveaway(id);
    if (!gw || gw.guild_id !== guild.id) {
      return interaction.editReply({ embeds: [errorEmbed('Giveaway not found')] });
    }
    if (gw.ended) {
      return interaction.editReply({ embeds: [errorEmbed('Giveaway already ended')] });
    }

    const winners = pickWinners(gw.entries || [], gw.winners_count);
    await dbEndGiveaway(id, winners);

    // Announce in the channel
    const channel = guild.channels.cache.get(gw.channel_id);
    if (channel) {
      const winnerText = winners.length ? winners.map((w) => `<@${w}>`).join(', ') : 'No entries';
      await channel.send({
        embeds: [baseEmbed(`🎉 Giveaway Ended!`, `**Prize:** ${safeText(gw.prize, 200)}\n**Winners:** ${winnerText}\n**Entries:** ${(gw.entries || []).length}`)],
      });

      // Edit the original message
      if (gw.message_id) {
        const origMsg = await channel.messages.fetch(gw.message_id).catch(() => null);
        if (origMsg) {
          await origMsg.edit({
            content: `🎉 **GIVEAWAY ENDED** 🎉`,
            embeds: [baseEmbed(`🎉 Giveaway Ended!`, `**Prize:** ${safeText(gw.prize, 200)}\n**Winners:** ${winnerText}\n**Entries:** ${(gw.entries || []).length}`)],
          }).catch(() => {});
        }
      }
    }

    await interaction.editReply({ embeds: [successEmbed(`Giveaway #${id} ended. Winners: ${winners.join(', ') || 'none'}`)] });
    return;
  }

  if (sub === 'reroll') {
    const id = interaction.options.getInteger('id');
    await interaction.deferReply({ ephemeral: true });

    const gw = await getGiveaway(id);
    if (!gw || gw.guild_id !== guild.id) {
      return interaction.editReply({ embeds: [errorEmbed('Giveaway not found')] });
    }
    if (!gw.ended) {
      return interaction.editReply({ embeds: [errorEmbed('Giveaway has not ended yet')] });
    }

    const winners = pickWinners(gw.entries || [], gw.winners_count);
    const channel = guild.channels.cache.get(gw.channel_id);
    if (channel) {
      const winnerText = winners.length ? winners.map((w) => `<@${w}>`).join(', ') : 'No entries';
      await channel.send({ content: `🎉 **Reroll!** New winners: ${winnerText}` });
    }

    await interaction.editReply({ embeds: [successEmbed(`Rerolled giveaway #${id}. New winners: ${winners.join(', ') || 'none'}`)] });
    return;
  }

  if (sub === 'list') {
    const active = await getActiveGiveaways(guild.id);
    if (!active.length) {
      return interaction.reply({ embeds: [baseEmbed('Giveaways', 'No active giveaways')], ...EPHEMERAL });
    }
    const lines = active.map((gw) => {
      const endsAt = Math.floor(gw.ends_at / 1000);
      return `**#${gw.id}** ${safeText(gw.prize, 50)} — ${gw.winners_count} winner(s) — <t:${endsAt}:R> — ${(gw.entries || []).length} entries`;
    });
    await interaction.reply({ embeds: [baseEmbed(`🎉 Active Giveaways (${active.length})`, lines.join('\n'))], ...EPHEMERAL });
    return;
  }

  if (sub === 'edit') {
    const id = interaction.options.getInteger('id');
    const prize = interaction.options.getString('prize');
    const winnersCount = interaction.options.getInteger('winners');
    const addTime = interaction.options.getString('addtime');

    await interaction.deferReply({ ephemeral: true });

    const gw = await getGiveaway(id);
    if (!gw || gw.guild_id !== guild.id) {
      return interaction.editReply({ embeds: [errorEmbed('Giveaway not found')] });
    }
    if (gw.ended) {
      return interaction.editReply({ embeds: [errorEmbed('Cannot edit an ended giveaway')] });
    }

    const updates = {};
    if (prize) updates.prize = prize;
    if (winnersCount) updates.winnersCount = winnersCount;
    if (addTime) {
      const addMs = ms(addTime);
      if (!addMs || addMs < 1000) {
        return interaction.editReply({ embeds: [errorEmbed('Invalid time duration')] });
      }
      updates.endsAt = gw.ends_at + addMs;
    }

    await updateGiveaway(id, updates);
    await interaction.editReply({ embeds: [successEmbed(`Giveaway #${id} updated`)] });
    return;
  }
}

/**
 * Auto-end expired giveaways — called from ready.js periodic loop.
 */
export async function autoEndGiveaways(client) {
  const { getExpiredGiveaways, endGiveaway: dbEnd } = await import('../utils/database.js');
  const expired = await getExpiredGiveaways();
  for (const gw of expired) {
    const winners = pickWinners(gw.entries || [], gw.winners_count);
    await dbEnd(gw.id, winners);

    try {
      const guild = client.guilds.cache.get(gw.guild_id);
      if (!guild) continue;
      const channel = guild.channels.cache.get(gw.channel_id);
      if (!channel) continue;

      const winnerText = winners.length ? winners.map((w) => `<@${w}>`).join(', ') : 'No entries';
      await channel.send({
        embeds: [baseEmbed(`🎉 Giveaway Ended!`, `**Prize:** ${safeText(gw.prize, 200)}\n**Winners:** ${winnerText}\n**Entries:** ${(gw.entries || []).length}`)],
      });

      if (gw.message_id) {
        const origMsg = await channel.messages.fetch(gw.message_id).catch(() => null);
        if (origMsg) {
          await origMsg.edit({
            content: `🎉 **GIVEAWAY ENDED** 🎉`,
            embeds: [baseEmbed(`🎉 Giveaway Ended!`, `**Prize:** ${safeText(gw.prize, 200)}\n**Winners:** ${winnerText}\n**Entries:** ${(gw.entries || []).length}`)],
          }).catch(() => {});
        }
      }
    } catch (err) {
      // Ignore channel errors
    }
  }
}
