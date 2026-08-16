import 'dotenv/config';
import { isSnowflake } from './utils/sanitize.js';
import { logger } from './utils/logger.js';

function env(name, fallback = '') {
  const value = process.env[name];
  return (value ?? fallback).trim();
}

export const config = {
  token: env('DISCORD_TOKEN'),
  clientId: env('CLIENT_ID'),
  guildId: env('GUILD_ID'),
  prefix: env('PREFIX', '!').slice(0, 5) || '!',
  database: {
    url: env('DATABASE_URL'),
    host: env('DB_HOST', 'localhost'),
    port: parseInt(env('DB_PORT', '5432'), 10),
    name: env('DB_NAME', 'bot_db'),
    user: env('DB_USER', 'postgres'),
    pass: env('DB_PASS', ''),
    pool: { min: 2, max: 10 },
  },
  colors: {
    primary: 0x5865f2,
    success: 0x57f287,
    warning: 0xfee75c,
    error: 0xed4245,
    info: 0xeb459e,
  },
  limits: {
    reason: 400,
    nickname: 32,
    qr: 400,
    calc: 64,
    say: 1800,
    welcome: 500,
    afk: 100,
    reminder: 200,
    pollOption: 80,
    ticketsPerGuild: 15,
  },
  economy: {
    startBalance: 500,
    dailyMin: 100,
    dailyMax: 500,
    workMin: 50,
    workMax: 200,
    workCooldown: 60 * 60 * 1000,
    dailyCooldown: 24 * 60 * 60 * 1000,
    robCooldown: 30 * 60 * 1000,
    gambleMax: 25000,
    maxBalance: 1_000_000_000,
  },
  levels: {
    xpMin: 15,
    xpMax: 25,
    cooldown: 60_000,
    minMessageLength: 3,
  },
  security: {
    // Rate limit windows (ms) and thresholds
    rateLimitWindow: 60_000,         // 1 minute sliding window
    antiNukeWindow: 30_000,          // 30 seconds for nuke detection
    antiNuke: {
      maxBans: 3,
      maxKicks: 4,
      maxRoleDeletes: 3,
      maxChannelDeletes: 3,
      maxPermissionEdits: 5,
    },
    antiSpam: {
      maxMessages: 8,                // max messages per window
      windowMs: 10_000,             // 10 seconds
      duplicateThreshold: 3,        // same message N times
      capsThreshold: 0.7,           // 70% uppercase
      emojiLimit: 10,               // max emojis per message
      mentionLimit: 5,              // max mentions per message
    },
    antiFlood: {
      maxMessages: 15,
      windowMs: 8_000,
    },
    joinRate: {
      maxJoins: 10,                 // max joins per window
      windowMs: 30_000,            // 30 seconds
    },
    accountAge: {
      minAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days minimum
      quarantineAge: 24 * 60 * 60 * 1000, // 1 day → quarantine
    },
    scoring: {
      raidThreshold: 80,
      riskThreshold: 70,
      trustMinimum: 20,
      weights: {
        accountAge: 25,
        joinRate: 20,
        messageFlood: 20,
        suspiciousPatterns: 15,
        priorInfractions: 20,
      },
    },
    punishment: {
      escalation: ['warn', 'timeout', 'kick', 'ban'],
      timeoutDuration: 10 * 60 * 1000, // 10 minutes
      cooldown: 30_000,                  // 30s between auto-punishments
    },
    lockdown: {
      defaultSlowmode: 30,   // seconds
      maxDuration: 24 * 60 * 60 * 1000, // 24 hours max
    },
    snapshot: {
      maxSnapshots: 20, // per guild
    },
  },
};

if (!config.token || config.token.split('.').length !== 3) {
  logger.error('ไม่พบ DISCORD_TOKEN ที่ถูกต้องใน .env');
  process.exit(1);
}

if (config.clientId && !isSnowflake(config.clientId)) {
  logger.error('CLIENT_ID ใน .env ไม่ใช่ Snowflake ที่ถูกต้อง');
  process.exit(1);
}

if (config.guildId && !isSnowflake(config.guildId)) {
  logger.error('GUILD_ID ใน .env ไม่ใช่ Snowflake ที่ถูกต้อง');
  process.exit(1);
}
