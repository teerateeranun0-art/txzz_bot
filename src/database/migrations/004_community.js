/**
 * Community features migration
 * Adds tables for: giveaways, reaction roles, starboard, suggestions,
 * birthdays, announcements, counting game, and word chain game.
 */
export async function up(knex) {
  // ── Giveaways ──
  await knex.schema.createTable('giveaways', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('channel_id', 20).notNullable();
    t.string('message_id', 20).nullable();
    t.string('host_id', 20).notNullable();
    t.string('prize', 200).notNullable();
    t.integer('winners_count').defaultTo(1);
    t.bigInteger('ends_at').notNullable();
    t.boolean('ended').defaultTo(false);
    t.jsonb('winners').defaultTo('[]');             // array of user IDs
    t.jsonb('requirements').defaultTo('{}');         // {role, minLevel}
    t.jsonb('entries').defaultTo('[]');              // array of user IDs who entered
    t.bigInteger('created_at').notNullable();
    t.index(['guild_id', 'ended']);
    t.index(['ends_at']);
  });

  // ── Reaction Roles ──
  await knex.schema.createTable('reaction_roles', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('channel_id', 20).notNullable();
    t.string('message_id', 20).notNullable();
    t.string('emoji', 64).notNullable();              // unicode emoji or custom emoji ID
    t.string('role_id', 20).notNullable();
    t.string('added_by', 20).nullable();
    t.bigInteger('created_at').notNullable();
    t.unique(['message_id', 'emoji']);
    t.index(['guild_id']);
    t.index(['message_id']);
  });

  // ── Starboard ──
  await knex.schema.createTable('starboard', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('original_message_id', 20).notNullable();
    t.string('starboard_message_id', 20).nullable();
    t.string('channel_id', 20).notNullable();
    t.string('author_id', 20).notNullable();
    t.integer('star_count').defaultTo(0);
    t.bigInteger('starred_at').notNullable();
    t.unique(['guild_id', 'original_message_id']);
    t.index(['guild_id', 'star_count']);
  });

  // ── Suggestions ──
  await knex.schema.createTable('suggestions', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('title', 200).notNullable();
    t.text('description').notNullable();
    t.string('status', 16).defaultTo('pending');      // pending, approved, denied, implemented
    t.string('message_id', 20).nullable();             // message in suggestion channel
    t.integer('upvotes').defaultTo(0);
    t.integer('downvotes').defaultTo(0);
    t.string('resolved_by', 20).nullable();
    t.text('resolution_note').nullable();
    t.bigInteger('created_at').notNullable();
    t.bigInteger('resolved_at').nullable();
    t.index(['guild_id', 'status']);
    t.index(['guild_id', 'user_id']);
  });

  // ── Birthdays ──
  await knex.schema.createTable('birthdays', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.integer('month').notNullable();                 // 1-12
    t.integer('day').notNullable();                   // 1-31
    t.string('timezone', 64).defaultTo('UTC');
    t.bigInteger('last_celebrated').defaultTo(0);
    t.primary(['guild_id', 'user_id']);
    t.index(['guild_id', 'month', 'day']);
  });

  // ── Announcements ──
  await knex.schema.createTable('announcements', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('channel_id', 20).notNullable();
    t.text('content').notNullable();
    t.bigInteger('scheduled_at').notNullable();
    t.boolean('sent').defaultTo(false);
    t.string('created_by', 20).notNullable();
    t.bigInteger('created_at').notNullable();
    t.index(['guild_id', 'sent', 'scheduled_at']);
  });

  // ── Counting Game ──
  await knex.schema.createTable('counting', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('channel_id', 20).notNullable();
    t.integer('current_number').defaultTo(0);
    t.string('last_counter_id', 20).nullable();
    t.integer('record').defaultTo(0);
    t.primary(['guild_id', 'channel_id']);
  });

  // ── Word Chain Game ──
  await knex.schema.createTable('word_chain', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('channel_id', 20).notNullable();
    t.string('last_word', 64).nullable();
    t.string('last_user_id', 20).nullable();
    t.integer('chain_length').defaultTo(0);
    t.integer('record').defaultTo(0);
    t.primary(['guild_id', 'channel_id']);
  });
}

export async function down(knex) {
  const tables = [
    'word_chain', 'counting', 'announcements', 'birthdays',
    'suggestions', 'starboard', 'reaction_roles', 'giveaways',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
