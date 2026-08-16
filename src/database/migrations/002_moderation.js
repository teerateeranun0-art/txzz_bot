/**
 * Moderation system migration
 * Adds tables for: cases, mod notes, automod word/regex filters,
 * temp bans, temp roles, ban appeals, mod queue, and auto-punishment rules.
 * Also enhances the warnings table with points and expiration.
 */
export async function up(knex) {
  // ── Enhance warnings table ──
  if (!(await knex.schema.hasColumn('warnings', 'points'))) {
    await knex.schema.alterTable('warnings', (t) => {
      t.integer('points').defaultTo(1);           // severity points (1-10)
      t.bigInteger('expires_at').nullable();       // null = never expires
      t.boolean('expired').defaultTo(false);
      t.bigInteger('case_id').nullable();          // linked case
    });
  }

  // ── Cases ──
  await knex.schema.createTable('cases', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('type', 32).notNullable();            // ban, kick, timeout, warn, unban, jail, tempban, etc.
    t.string('target_id', 20).notNullable();
    t.string('moderator_id', 20).notNullable();
    t.string('reason', 400).defaultTo('');
    t.jsonb('extra').defaultTo('{}');              // duration, points, message_count, etc.
    t.bigInteger('created_at').notNullable();
    t.bigInteger('updated_at').defaultTo(null);
    t.string('updated_by', 20).nullable();
    t.boolean('active').defaultTo(true);            // false if reversed/overturned
    t.index(['guild_id', 'target_id']);
    t.index(['guild_id', 'type']);
    t.index(['guild_id', 'created_at']);
  });

  // ── Mod Notes ──
  await knex.schema.createTable('mod_notes', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('author_id', 20).notNullable();
    t.text('content').notNullable();
    t.string('category', 32).defaultTo('general');  // general, behavior, evidence, staff_note
    t.bigInteger('created_at').notNullable();
    t.bigInteger('updated_at').nullable();
    t.index(['guild_id', 'user_id']);
  });

  // ── AutoMod Filters (word/regex/domain) ──
  await knex.schema.createTable('automod_filters', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('type', 32).notNullable();             // word, regex, domain_whitelist, domain_blacklist, role_whitelist, channel_whitelist
    t.string('pattern', 500).notNullable();          // word, regex pattern, or domain
    t.string('added_by', 20).nullable();
    t.string('action', 32).defaultTo('delete');      // delete, warn, timeout, kick, ban
    t.boolean('case_sensitive').defaultTo(false);
    t.bigInteger('created_at').notNullable();
    t.index(['guild_id', 'type']);
  });

  // ── Auto-Punishment Rules ──
  await knex.schema.createTable('punishment_rules', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.integer('points_threshold').notNullable();     // total warning points to trigger
    t.string('action', 32).notNullable();            // timeout, kick, ban, quarantine
    t.string('duration', 32).nullable();             // for timeout: "1h", "1d", etc.
    t.integer('action_order').defaultTo(0);           // order for escalation
    t.bigInteger('created_at').notNullable();
    t.string('created_by', 20).nullable();
    t.index(['guild_id']);
  });

  // ── Temp Bans ──
  await knex.schema.createTable('temp_bans', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('banned_by', 20).notNullable();
    t.string('reason', 400).defaultTo('');
    t.bigInteger('banned_at').notNullable();
    t.bigInteger('expires_at').notNullable();
    t.bigInteger('case_id').nullable();
    t.boolean('resolved').defaultTo(false);
    t.primary(['guild_id', 'user_id']);
  });

  // ── Temp Roles ──
  await knex.schema.createTable('temp_roles', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('role_id', 20).notNullable();
    t.string('given_by', 20).notNullable();
    t.bigInteger('given_at').notNullable();
    t.bigInteger('expires_at').notNullable();
    t.boolean('resolved').defaultTo(false);
    t.index(['guild_id', 'user_id']);
  });

  // ── Ban Appeals ──
  await knex.schema.createTable('ban_appeals', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('case_id', 32).nullable();              // linked ban case
    t.text('reason').notNullable();                   // why they should be unbanned
    t.string('status', 16).defaultTo('pending');      // pending, approved, denied, expired
    t.string('reviewed_by', 20).nullable();
    t.text('review_note').nullable();
    t.bigInteger('created_at').notNullable();
    t.bigInteger('reviewed_at').nullable();
    t.index(['guild_id', 'status']);
    t.index(['guild_id', 'user_id']);
  });

  // ── Mod Queue (pending actions for staff review) ──
  await knex.schema.createTable('mod_queue', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('type', 32).notNullable();               // report, automod_flag, appeal, review
    t.string('target_id', 20).nullable();             // flagged user
    t.string('reporter_id', 20).nullable();           // who reported
    t.jsonb('details').defaultTo('{}');               // message content, reason, etc.
    t.string('status', 16).defaultTo('pending');       // pending, resolved, dismissed, escalated
    t.string('resolved_by', 20).nullable();
    t.text('resolution_note').nullable();
    t.bigInteger('created_at').notNullable();
    t.bigInteger('resolved_at').nullable();
    t.index(['guild_id', 'status']);
  });

  // ── Jail ──
  await knex.schema.createTable('jail', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('reason', 400).defaultTo('');
    t.string('jailed_by', 20).nullable();
    t.string('previous_roles').defaultTo('[]');       // JSON array of role IDs
    t.bigInteger('jailed_at').notNullable();
    t.bigInteger('expires_at').nullable();
    t.bigInteger('case_id').nullable();
    t.bigInteger('channel_id').nullable();            // jail channel created for user
    t.primary(['guild_id', 'user_id']);
  });

  // ── Comprehensive Mod Logs ──
  await knex.schema.createTable('mod_logs', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('category', 32).notNullable();           // message, voice, role, channel, nickname, permission, thread, invite, bot, member
    t.string('action', 64).notNullable();             // message_delete, message_edit, voice_join, voice_leave, etc.
    t.string('user_id', 20).nullable();               // the user involved
    t.string('target_id', 20).nullable();             // target (channel, role, etc.)
    t.jsonb('details').defaultTo('{}');               // old/new content, before/after, etc.
    t.bigInteger('timestamp').notNullable();
    t.index(['guild_id', 'category']);
    t.index(['guild_id', 'user_id']);
    t.index(['guild_id', 'timestamp']);
  });
}

export async function down(knex) {
  const tables = [
    'mod_logs', 'jail', 'mod_queue', 'ban_appeals',
    'temp_roles', 'temp_bans', 'punishment_rules',
    'automod_filters', 'mod_notes', 'cases',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
  // Reverse warnings column additions
  if (await knex.schema.hasColumn('warnings', 'points')) {
    await knex.schema.alterTable('warnings', (t) => {
      t.dropColumn('points');
      t.dropColumn('expires_at');
      t.dropColumn('expired');
      t.dropColumn('case_id');
    });
  }
}
