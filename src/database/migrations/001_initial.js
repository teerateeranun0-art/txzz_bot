/**
 * Initial database schema migration
 * Creates all tables for economy, levels, warnings, guild config, reminders, afk,
 * and the full security/anti-raid system.
 */
export async function up(knex) {
  // ── Economy ──
  await knex.schema.createTable('economy', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.bigInteger('balance').defaultTo(500);
    t.bigInteger('bank').defaultTo(0);
    t.bigInteger('last_daily').defaultTo(0);
    t.bigInteger('last_work').defaultTo(0);
    t.bigInteger('last_rob').defaultTo(0);
    t.primary(['guild_id', 'user_id']);
  });

  // ── Levels / XP ──
  await knex.schema.createTable('levels', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.integer('xp').defaultTo(0);
    t.integer('level').defaultTo(0);
    t.bigInteger('last_xp').defaultTo(0);
    t.primary(['guild_id', 'user_id']);
  });

  // ── Warnings ──
  await knex.schema.createTable('warnings', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('mod_id', 20).notNullable();
    t.string('reason', 400).defaultTo('');
    t.bigInteger('date').notNullable();
    t.index(['guild_id', 'user_id']);
  });

  // ── Guild Config ──
  await knex.schema.createTable('guild_configs', (t) => {
    t.string('guild_id', 20).primary();
    t.string('welcome_channel', 20).nullable();
    t.text('welcome_message').nullable();
    t.string('autorole', 20).nullable();
    t.string('mod_log_channel', 20).nullable();
    t.string('ticket_staff_role', 20).nullable();
    // Security config stored as JSONB
    t.jsonb('security_config').defaultTo('{}');
    t.bigInteger('created_at').defaultTo(Date.now());
    t.bigInteger('updated_at').defaultTo(Date.now());
  });

  // ── Reminders ──
  await knex.schema.createTable('reminders', (t) => {
    t.increments('id').primary();
    t.string('user_id', 20).notNullable();
    t.string('channel_id', 20).notNullable();
    t.string('message', 200).notNullable();
    t.bigInteger('time').notNullable();
    t.index(['user_id']);
  });

  // ── AFK ──
  await knex.schema.createTable('afk', (t) => {
    t.string('user_id', 20).primary();
    t.string('reason', 100).defaultTo('AFK');
    t.bigInteger('since').notNullable();
  });

  // ── Security Incidents ──
  await knex.schema.createTable('security_incidents', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('type', 64).notNullable();     // anti_nuke, raid, spam, nuke, etc.
    t.string('severity', 16).defaultTo('warning'); // info, warning, critical, emergency
    t.string('executor_id', 20).nullable();
    t.jsonb('details').defaultTo('{}');
    t.string('action_taken', 64).nullable();
    t.bigInteger('timestamp').notNullable();
    t.index(['guild_id', 'timestamp']);
    t.index(['guild_id', 'type']);
  });

  // ── Security Snapshots ──
  await knex.schema.createTable('security_snapshots', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('label', 100).defaultTo('');
    t.string('trigger', 64).defaultTo('manual'); // manual, raid, lockdown, panic
    t.jsonb('roles_data').defaultTo('[]');
    t.jsonb('channels_data').defaultTo('[]');
    t.jsonb('server_data').defaultTo('{}');
    t.bigInteger('timestamp').notNullable();
    t.index(['guild_id', 'timestamp']);
  });

  // ── Trusted Users ──
  await knex.schema.createTable('trusted_users', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('added_by', 20).nullable();
    t.bigInteger('added_at').defaultTo(Date.now());
    t.primary(['guild_id', 'user_id']);
  });

  // ── Trusted Roles ──
  await knex.schema.createTable('trusted_roles', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('role_id', 20).notNullable();
    t.string('added_by', 20).nullable();
    t.bigInteger('added_at').defaultTo(Date.now());
    t.primary(['guild_id', 'role_id']);
  });

  // ── Protected Roles ──
  await knex.schema.createTable('protected_roles', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('role_id', 20).notNullable();
    t.string('added_by', 20).nullable();
    t.bigInteger('added_at').defaultTo(Date.now());
    t.primary(['guild_id', 'role_id']);
  });

  // ── Protected Channels ──
  await knex.schema.createTable('protected_channels', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('channel_id', 20).notNullable();
    t.string('added_by', 20).nullable();
    t.bigInteger('added_at').defaultTo(Date.now());
    t.primary(['guild_id', 'channel_id']);
  });

  // ── Protected Categories ──
  await knex.schema.createTable('protected_categories', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('category_id', 20).notNullable();
    t.string('added_by', 20).nullable();
    t.bigInteger('added_at').defaultTo(Date.now());
    t.primary(['guild_id', 'category_id']);
  });

  // ── Protected Webhooks ──
  await knex.schema.createTable('protected_webhooks', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('webhook_id', 20).notNullable();
    t.string('added_by', 20).nullable();
    t.bigInteger('added_at').defaultTo(Date.now());
    t.primary(['guild_id', 'webhook_id']);
  });

  // ── Action Log (staff security actions) ──
  await knex.schema.createTable('action_log', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('staff_id', 20).notNullable();
    t.string('action', 64).notNullable();
    t.string('target_id', 20).nullable();
    t.string('reason', 400).defaultTo('');
    t.jsonb('extra').defaultTo('{}');
    t.bigInteger('timestamp').notNullable();
    t.index(['guild_id', 'timestamp']);
    t.index(['guild_id', 'staff_id']);
  });

  // ── User Scores ──
  await knex.schema.createTable('user_scores', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.integer('raid_score').defaultTo(0);
    t.integer('risk_score').defaultTo(0);
    t.integer('trust_score').defaultTo(50);
    t.bigInteger('updated_at').defaultTo(Date.now());
    t.primary(['guild_id', 'user_id']);
  });

  // ── Quarantine ──
  await knex.schema.createTable('quarantine', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('reason', 400).defaultTo('');
    t.string('quarantined_by', 20).nullable();
    t.string('previous_roles').defaultTo('[]'); // JSON array of role IDs
    t.bigInteger('quarantined_at').notNullable();
    t.bigInteger('expires_at').nullable();       // null = indefinite
    t.primary(['guild_id', 'user_id']);
  });

  // ── Lockdown State ──
  await knex.schema.createTable('lockdown_state', (t) => {
    t.string('guild_id', 20).primary();
    t.string('state', 32).defaultTo('normal'); // normal, slowmode, verification, raid, maintenance, panic
    t.string('reason', 400).defaultTo('');
    t.string('activated_by', 20).nullable();
    t.bigInteger('activated_at').nullable();
    t.bigInteger('expires_at').nullable();
    t.jsonb('previous_overwrites').defaultTo('{}'); // saved channel overwrites for rollback
  });
}

export async function down(knex) {
  const tables = [
    'lockdown_state', 'quarantine', 'user_scores', 'action_log',
    'protected_webhooks', 'protected_categories', 'protected_channels',
    'protected_roles', 'trusted_roles', 'trusted_users',
    'security_snapshots', 'security_incidents', 'afk', 'reminders',
    'guild_configs', 'warnings', 'levels', 'economy',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
