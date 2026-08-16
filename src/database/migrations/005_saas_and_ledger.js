/**
 * SaaS, Double-Entry Transaction Ledger, Explainable Decision Engine,
 * and Policy-Driven Bot Protection Migration.
 */

export async function up(knex) {
  // ── 1. Double-Entry Economy Transactions Ledger ──
  await knex.schema.createTable('economy_transactions', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('from_user', 32).notNullable(); // User ID, 'SYSTEM', or 'BANK'
    t.string('to_user', 32).notNullable();   // User ID, 'SYSTEM', or 'BANK'
    t.bigInteger('amount').notNullable();
    t.string('type', 32).notNullable();      // pay, deposit, withdraw, daily, work, gamble, rob, admin_grant
    t.bigInteger('balance_before').notNullable();
    t.bigInteger('balance_after').notNullable();
    t.string('idempotency_key', 64).notNullable().unique();
    t.jsonb('metadata').defaultTo('{}');
    t.bigInteger('created_at').notNullable();
    t.index(['guild_id', 'created_at']);
    t.index(['from_user']);
    t.index(['to_user']);
    t.index(['type']);
  });

  // ── 2. Explainable Security Decision Engine ──
  await knex.schema.createTable('security_decisions', (t) => {
    t.increments('id').primary();
    t.integer('incident_id').nullable();
    t.string('guild_id', 20).notNullable();
    t.string('user_id', 20).notNullable();
    t.string('action', 32).notNullable();          // quarantine, timeout, kick, ban, alert, ignore
    t.text('decision_reason').notNullable();
    t.integer('confidence_score').defaultTo(100);  // 0-100%
    t.jsonb('factors').defaultTo('[]');            // [{label, points}]
    t.string('rule_version', 16).defaultTo('1.0.0');
    t.string('engine_version', 16).defaultTo('2.0.0');
    t.bigInteger('timestamp').notNullable();
    t.index(['guild_id', 'timestamp']);
    t.index(['user_id']);
  });

  // ── 3. Policy-Driven Bot Protection & Allowlists ──
  await knex.schema.createTable('bot_allowlists', (t) => {
    t.increments('id').primary();
    t.string('guild_id', 20).notNullable();
    t.string('bot_id', 20).notNullable();
    t.string('bot_name', 64).nullable();
    t.string('status', 16).defaultTo('approved'); // approved, pending_review, quarantined, denied
    t.string('approved_by', 20).nullable();
    t.string('max_permissions', 64).defaultTo('DEFAULT');
    t.jsonb('policy_flags').defaultTo('{}');      // { allowAdministrator: false, requireStaffApproval: true }
    t.bigInteger('added_at').notNullable();
    t.bigInteger('updated_at').defaultTo(Date.now());
    t.unique(['guild_id', 'bot_id']);
    t.index(['guild_id', 'status']);
  });

  // ── 4. Multi-Guild SaaS Subscriptions & Entitlements ──
  await knex.schema.createTable('guild_subscriptions', (t) => {
    t.string('guild_id', 20).primary();
    t.string('plan', 32).defaultTo('FREE');        // FREE, PRO, BUSINESS, ENTERPRISE
    t.string('status', 16).defaultTo('ACTIVE');    // ACTIVE, TRIAL, PAST_DUE, CANCELED
    t.jsonb('features').defaultTo('{}');           // { customBranding: true, unlimitedSnapshots: true }
    t.jsonb('limits').defaultTo('{}');             // { maxSnapshots: 50, rateLimitMultiplier: 2.0 }
    t.string('billing_cycle', 16).defaultTo('MONTHLY');
    t.bigInteger('expires_at').nullable();
    t.bigInteger('created_at').notNullable();
    t.bigInteger('updated_at').defaultTo(Date.now());
    t.index(['plan', 'status']);
  });
}

export async function down(knex) {
  const tables = ['guild_subscriptions', 'bot_allowlists', 'security_decisions', 'economy_transactions'];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
