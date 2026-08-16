import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { config } from './config.js';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!config.clientId) {
  logger.error('ต้องตั้ง CLIENT_ID ใน .env ก่อน deploy');
  process.exit(1);
}

async function collectCommands() {
  const commandsPath = join(__dirname, 'commands');
  const files = readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  const all = [];

  for (const file of files) {
    const mod = await import(pathToFileURL(join(commandsPath, file)).href);
    const cmds = Array.isArray(mod.data) ? mod.data : [mod.data];
    for (const cmd of cmds) all.push(cmd.toJSON());
  }
  return all;
}

const commands = await collectCommands();
const rest = new REST({ version: '10' }).setToken(config.token);

try {
  logger.info(`กำลัง deploy ${commands.length} คำสั่ง...`);

  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );
    logger.info(`Deploy ไป Guild ${config.guildId} สำเร็จ`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    logger.info('Deploy Global commands สำเร็จ (อาจใช้เวลาถึง 1 ชั่วโมง)');
  }
} catch (error) {
  logger.error('Deploy ไม่สำเร็จ', error);
  process.exit(1);
}
