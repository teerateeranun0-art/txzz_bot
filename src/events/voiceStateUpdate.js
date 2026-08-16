import { Events } from 'discord.js';
import { logModEvent } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client) {
    if (!oldState.guild) return;
    const member = newState.member || oldState.member;
    if (member?.user.bot) return;

    try {
      const userId = member?.id;
      const username = member?.user?.username || 'Unknown';

      // Joined a voice channel
      if (!oldState.channel && newState.channel) {
        await logModEvent(oldState.guild.id, 'voice', 'voice_join', {
          userId,
          targetId: newState.channel.id,
          details: { channelName: newState.channel.name, channelType: newState.channel.type },
        });
      }
      // Left a voice channel
      else if (oldState.channel && !newState.channel) {
        await logModEvent(oldState.guild.id, 'voice', 'voice_leave', {
          userId,
          targetId: oldState.channel.id,
          details: { channelName: oldState.channel.name, channelType: oldState.channel.type },
        });
      }
      // Moved between voice channels
      else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        await logModEvent(oldState.guild.id, 'voice', 'voice_move', {
          userId,
          targetId: newState.channel.id,
          details: {
            fromChannel: oldState.channel.name,
            toChannel: newState.channel.name,
          },
        });
      }

      // Server mute/unmute
      if (oldState.serverMute !== newState.serverMute) {
        await logModEvent(oldState.guild.id, 'voice', newState.serverMute ? 'voice_server_mute' : 'voice_server_unmute', {
          userId,
          details: { channelName: (newState.channel || oldState.channel)?.name },
        });
      }

      // Server deafen/undeafen
      if (oldState.serverDeaf !== newState.serverDeaf) {
        await logModEvent(oldState.guild.id, 'voice', newState.serverDeaf ? 'voice_server_deafen' : 'voice_server_undeafen', {
          userId,
          details: { channelName: (newState.channel || oldState.channel)?.name },
        });
      }

      // Stream start/stop
      if (oldState.streaming !== newState.streaming) {
        await logModEvent(oldState.guild.id, 'voice', newState.streaming ? 'voice_stream_start' : 'voice_stream_stop', {
          userId,
          details: { channelName: newState.channel?.name },
        });
      }
    } catch (err) {
      logger.error('voiceStateUpdate logging failed', err);
    }
  },
};
