/**
 * Ticket/Support system migration
 * Adds tables for tickets, ticket messages (transcript), ticket notes,
 * ticket panels (categories), ticket feedback, and staff performance stats.
 */
export async function up(knex) {
  // ── Tickets ──
  await knex.schema.createTable('tickets', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('channel_id', 20).nullable();           // Discord channel ID (null after close)
    t.string('owner_id', 20).notNullable();           // ticket creator
    t.string('claimed_by', 20).nullable();             // staff who claimed
    t.string('category', 32).defaultTo('general');     // support, bug, suggestion, general
    t.string('subject', 200).defaultTo('');            // ticket subject/topic
    t.string('status', 16).defaultTo('open');          // open, claimed, closed, archived
    t.string('close_reason', 400).defaultTo('');
    t.string('closed_by', 20).nullable();
    t.bigInteger('created_at').notNullable();
    t.bigInteger('claimed_at').nullable();
    t.bigInteger('closed_at').nullable();
    t.bigInteger('last_activity').notNullable();       // for auto-close timer
    t.jsonb('participants').defaultTo('[]');           // array of user IDs who participated
    t.index(['guild_id', 'status']);
    t.index(['guild_id', 'owner_id']);
    t.index(['guild_id', 'claimed_by']);
    t.index(['guild_id', 'channel_id']);
  });

  // ── Ticket Messages (Transcript) ──
  await knex.schema.createTable('ticket_messages', (t) => {
    t.increments('id').primary();
    t.integer('ticket_id').notNullable();
    t.string('user_id', 20).notNullable();
    t.string('username', 64).notNullable();
    t.text('content').defaultTo('');
    t.jsonb('attachments').defaultTo('[]');           // [{url, name}]
    t.bigInteger('sent_at').notNullable();
    t.boolean('is_bot').defaultTo(false);
    t.index(['ticket_id', 'sent_at']);
  });

  // ── Ticket Notes (internal staff notes) ──
  await knex.schema.createTable('ticket_notes', (t) => {
    t.increments('id').primary();
    t.integer('ticket_id').notNullable();
    t.string('author_id', 20).notNullable();
    t.text('content').notNullable();
    t.bigInteger('created_at').notNullable();
    t.index(['ticket_id']);
  });

  // ── Ticket Panels (configurable ticket categories/buttons) ──
  await knex.schema.createTable('ticket_panels', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('channel_id', 20).notNullable();           // where the panel message is
    t.string('message_id', 20).nullable();               // the panel message ID
    t.string('title', 100).defaultTo('Contact Support');
    t.text('description').defaultTo('Click a button to open a ticket');
    t.jsonb('categories').defaultTo('[]');              // [{id, label, emoji, description, staffRole}]
    t.string('parent_category', 20).nullable();          // Discord category for ticket channels
    t.string('transcript_channel', 20).nullable();       // where transcripts are sent
    t.integer('max_open').defaultTo(5);                  // max open tickets per user
    t.bigInteger('created_at').notNullable();
    t.index(['guild_id']);
  });

  // ── Ticket Feedback ──
  await knex.schema.createTable('ticket_feedback', (t) => {
    t.increments('id').primary();
    t.integer('ticket_id').notNullable();
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.integer('rating').notNullable();                  // 1-5
    t.text('comment').defaultTo('');
    t.string('claimed_by', 20).nullable();               // staff who handled
    t.bigInteger('created_at').notNullable();
    t.index(['guild_id', 'claimed_by']);
  });

  // ── Ticket Staff Stats ──
  await knex.schema.createTable('ticket_staff_stats', (t) => {
    t.string('guild_id', 20).notNullable();
    t.string('staff_id', 20).notNullable();
    t.integer('tickets_claimed').defaultTo(0);
    t.integer('tickets_closed').defaultTo(0);
    t.bigInteger('total_response_ms').defaultTo(0);      // sum of first response times
    t.integer('response_count').defaultTo(0);             // number of first responses
    t.bigInteger('updated_at').defaultTo(Date.now());
    t.primary(['guild_id', 'staff_id']);
  });
}

export async function down(knex) {
  const tables = [
    'ticket_staff_stats', 'ticket_feedback', 'ticket_panels',
    'ticket_notes', 'ticket_messages', 'tickets',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
