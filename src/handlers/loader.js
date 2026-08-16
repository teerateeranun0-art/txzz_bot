import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadCommands(client) {
  const commandsPath = join(__dirname, '../commands');
  const files = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const mod = await import(pathToFileURL(join(commandsPath, file)).href);
    const cmds = Array.isArray(mod.data) ? mod.data : [mod.data];
    for (const cmd of cmds) {
      const extra = mod.meta?.[cmd.name] ?? {};
      client.commands.set(cmd.name, {
        ...cmd.toJSON(),
        execute: mod.execute,
        cooldown: extra.cooldown ?? 3,
        guildOnly: extra.guildOnly ?? true,
        userPermissions: extra.userPermissions ?? [],
        botPermissions: extra.botPermissions ?? [],
      });
    }
  }

  logger.info(`โหลด ${client.commands.size} คำสั่ง`);
}

export async function loadEvents(client) {
  const eventsPath = join(__dirname, '../events');
  const files = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const mod = await import(pathToFileURL(join(eventsPath, file)).href);
    const event = mod.default;
    const runner = (...args) => {
      Promise.resolve(event.execute(...args, client)).catch(err => {
        logger.error(`event ${event.name} ล้มเหลว`, err);
      });
    };
    if (event.once) client.once(event.name, runner);
    else client.on(event.name, runner);
  }

  logger.info(`โหลด ${files.length} events`);
}
