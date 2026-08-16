-- All migrations (001_initial, 002_moderation, 003_tickets, 004_community, 005_saas_and_ledger)
-- Run this in Supabase SQL Editor or psql connected to your project's database.

-- NOTE: Defaults using current time are in milliseconds.

-- 001_initial.js

CREATE TABLE IF NOT EXISTS economy (
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  balance bigint DEFAULT 500,
  bank bigint DEFAULT 0,
  last_daily bigint DEFAULT 0,
  last_work bigint DEFAULT 0,
  last_rob bigint DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS levels (
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  xp integer DEFAULT 0,
  level integer DEFAULT 0,
  last_xp bigint DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS warnings (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  mod_id varchar(20) NOT NULL,
  reason varchar(400) DEFAULT '',
  date bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS warnings_guild_user_idx ON warnings (guild_id, user_id);

CREATE TABLE IF NOT EXISTS guild_configs (
  guild_id varchar(20) PRIMARY KEY,
  welcome_channel varchar(20),
  welcome_message text,
  autorole varchar(20),
  mod_log_channel varchar(20),
  ticket_staff_role varchar(20),
  security_config jsonb DEFAULT '{}',
  created_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint
);

CREATE TABLE IF NOT EXISTS reminders (
  id serial PRIMARY KEY,
  user_id varchar(20) NOT NULL,
  channel_id varchar(20) NOT NULL,
  message varchar(200) NOT NULL,
  time bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_user_idx ON reminders (user_id);

CREATE TABLE IF NOT EXISTS afk (
  user_id varchar(20) PRIMARY KEY,
  reason varchar(100) DEFAULT 'AFK',
  since bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS security_incidents (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  type varchar(64) NOT NULL,
  severity varchar(16) DEFAULT 'warning',
  executor_id varchar(20),
  details jsonb DEFAULT '{}',
  action_taken varchar(64),
  timestamp bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS security_incidents_guild_ts_idx ON security_incidents (guild_id, timestamp);
CREATE INDEX IF NOT EXISTS security_incidents_guild_type_idx ON security_incidents (guild_id, type);

CREATE TABLE IF NOT EXISTS security_snapshots (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  label varchar(100) DEFAULT '',
  trigger varchar(64) DEFAULT 'manual',
  roles_data jsonb DEFAULT '[]',
  channels_data jsonb DEFAULT '[]',
  server_data jsonb DEFAULT '{}',
  timestamp bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS security_snapshots_guild_ts_idx ON security_snapshots (guild_id, timestamp);

CREATE TABLE IF NOT EXISTS trusted_users (
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  added_by varchar(20),
  added_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS trusted_roles (
  guild_id varchar(20) NOT NULL,
  role_id varchar(20) NOT NULL,
  added_by varchar(20),
  added_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint,
  PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS protected_roles (
  guild_id varchar(20) NOT NULL,
  role_id varchar(20) NOT NULL,
  added_by varchar(20),
  added_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint,
  PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS protected_channels (
  guild_id varchar(20) NOT NULL,
  channel_id varchar(20) NOT NULL,
  added_by varchar(20),
  added_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS protected_categories (
  guild_id varchar(20) NOT NULL,
  category_id varchar(20) NOT NULL,
  added_by varchar(20),
  added_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint,
  PRIMARY KEY (guild_id, category_id)
);

CREATE TABLE IF NOT EXISTS protected_webhooks (
  guild_id varchar(20) NOT NULL,
  webhook_id varchar(20) NOT NULL,
  added_by varchar(20),
  added_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint,
  PRIMARY KEY (guild_id, webhook_id)
);

CREATE TABLE IF NOT EXISTS action_log (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  staff_id varchar(20) NOT NULL,
  action varchar(64) NOT NULL,
  target_id varchar(20),
  reason varchar(400) DEFAULT '',
  extra jsonb DEFAULT '{}',
  timestamp bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS action_log_guild_ts_idx ON action_log (guild_id, timestamp);
CREATE INDEX IF NOT EXISTS action_log_guild_staff_idx ON action_log (guild_id, staff_id);

CREATE TABLE IF NOT EXISTS user_scores (
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  raid_score integer DEFAULT 0,
  risk_score integer DEFAULT 0,
  trust_score integer DEFAULT 50,
  updated_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS quarantine (
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  reason varchar(400) DEFAULT '',
  quarantined_by varchar(20),
  previous_roles text DEFAULT '[]',
  quarantined_at bigint NOT NULL,
  expires_at bigint,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS lockdown_state (
  guild_id varchar(20) PRIMARY KEY,
  state varchar(32) DEFAULT 'normal',
  reason varchar(400) DEFAULT '',
  activated_by varchar(20),
  activated_at bigint,
  expires_at bigint,
  previous_overwrites jsonb DEFAULT '{}'
);

-- 002_moderation.js

CREATE TABLE IF NOT EXISTS cases (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  type varchar(32) NOT NULL,
  target_id varchar(20) NOT NULL,
  moderator_id varchar(20) NOT NULL,
  reason varchar(400) DEFAULT '',
  extra jsonb DEFAULT '{}',
  created_at bigint NOT NULL,
  updated_at bigint,
  updated_by varchar(20),
  active boolean DEFAULT true
);
CREATE INDEX IF NOT EXISTS cases_guild_target_idx ON cases (guild_id, target_id);
CREATE INDEX IF NOT EXISTS cases_guild_type_idx ON cases (guild_id, type);
CREATE INDEX IF NOT EXISTS cases_guild_created_idx ON cases (guild_id, created_at);

CREATE TABLE IF NOT EXISTS mod_notes (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  author_id varchar(20) NOT NULL,
  content text NOT NULL,
  category varchar(32) DEFAULT 'general',
  created_at bigint NOT NULL,
  updated_at bigint,
  created_by varchar(20)
);
CREATE INDEX IF NOT EXISTS mod_notes_guild_user_idx ON mod_notes (guild_id, user_id);

CREATE TABLE IF NOT EXISTS automod_filters (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  type varchar(32) NOT NULL,
  pattern varchar(500) NOT NULL,
  added_by varchar(20),
  action varchar(32) DEFAULT 'delete',
  case_sensitive boolean DEFAULT false,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS automod_filters_guild_type_idx ON automod_filters (guild_id, type);

CREATE TABLE IF NOT EXISTS punishment_rules (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  points_threshold integer NOT NULL,
  action varchar(32) NOT NULL,
  duration varchar(32),
  action_order integer DEFAULT 0,
  created_at bigint NOT NULL,
  created_by varchar(20)
);
CREATE INDEX IF NOT EXISTS punishment_rules_guild_idx ON punishment_rules (guild_id);

CREATE TABLE IF NOT EXISTS temp_bans (
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  banned_by varchar(20) NOT NULL,
  reason varchar(400) DEFAULT '',
  banned_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  case_id bigint,
  resolved boolean DEFAULT false,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS temp_roles (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  role_id varchar(20) NOT NULL,
  given_by varchar(20) NOT NULL,
  given_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  resolved boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS temp_roles_guild_user_idx ON temp_roles (guild_id, user_id);

CREATE TABLE IF NOT EXISTS ban_appeals (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  case_id varchar(32),
  reason text NOT NULL,
  status varchar(16) DEFAULT 'pending',
  reviewed_by varchar(20),
  review_note text,
  created_at bigint NOT NULL,
  reviewed_at bigint
);
CREATE INDEX IF NOT EXISTS ban_appeals_guild_status_idx ON ban_appeals (guild_id, status);
CREATE INDEX IF NOT EXISTS ban_appeals_guild_user_idx ON ban_appeals (guild_id, user_id);

CREATE TABLE IF NOT EXISTS mod_queue (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  type varchar(32) NOT NULL,
  target_id varchar(20),
  reporter_id varchar(20),
  details jsonb DEFAULT '{}',
  status varchar(16) DEFAULT 'pending',
  resolved_by varchar(20),
  resolution_note text,
  created_at bigint NOT NULL,
  resolved_at bigint
);
CREATE INDEX IF NOT EXISTS mod_queue_guild_status_idx ON mod_queue (guild_id, status);

CREATE TABLE IF NOT EXISTS jail (
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  reason varchar(400) DEFAULT '',
  jailed_by varchar(20),
  previous_roles text DEFAULT '[]',
  jailed_at bigint NOT NULL,
  expires_at bigint,
  case_id bigint,
  channel_id bigint,
  resolved boolean DEFAULT false,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS mod_logs (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  category varchar(32) NOT NULL,
  action varchar(64) NOT NULL,
  user_id varchar(20),
  target_id varchar(20),
  details jsonb DEFAULT '{}',
  timestamp bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS mod_logs_guild_cat_idx ON mod_logs (guild_id, category);
CREATE INDEX IF NOT EXISTS mod_logs_guild_user_idx ON mod_logs (guild_id, user_id);
CREATE INDEX IF NOT EXISTS mod_logs_guild_ts_idx ON mod_logs (guild_id, timestamp);

-- 003_tickets.js

CREATE TABLE IF NOT EXISTS tickets (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  channel_id varchar(20),
  owner_id varchar(20) NOT NULL,
  claimed_by varchar(20),
  category varchar(32) DEFAULT 'general',
  subject varchar(200) DEFAULT '',
  status varchar(16) DEFAULT 'open',
  close_reason varchar(400) DEFAULT '',
  closed_by varchar(20),
  created_at bigint NOT NULL,
  claimed_at bigint,
  closed_at bigint,
  last_activity bigint NOT NULL,
  participants jsonb DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS tickets_guild_status_idx ON tickets (guild_id, status);
CREATE INDEX IF NOT EXISTS tickets_guild_owner_idx ON tickets (guild_id, owner_id);
CREATE INDEX IF NOT EXISTS tickets_guild_claimed_idx ON tickets (guild_id, claimed_by);
CREATE INDEX IF NOT EXISTS tickets_guild_channel_idx ON tickets (guild_id, channel_id);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL,
  user_id varchar(20) NOT NULL,
  username varchar(64) NOT NULL,
  content text DEFAULT '',
  attachments jsonb DEFAULT '[]',
  sent_at bigint NOT NULL,
  is_bot boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_sent_idx ON ticket_messages (ticket_id, sent_at);

CREATE TABLE IF NOT EXISTS ticket_notes (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL,
  author_id varchar(20) NOT NULL,
  content text NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_notes_ticket_idx ON ticket_notes (ticket_id);

CREATE TABLE IF NOT EXISTS ticket_panels (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  channel_id varchar(20) NOT NULL,
  message_id varchar(20),
  title varchar(100) DEFAULT 'Contact Support',
  description text DEFAULT 'Click a button to open a ticket',
  categories jsonb DEFAULT '[]',
  parent_category varchar(20),
  transcript_channel varchar(20),
  max_open integer DEFAULT 5,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_panels_guild_idx ON ticket_panels (guild_id);

CREATE TABLE IF NOT EXISTS ticket_feedback (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL,
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  rating integer NOT NULL,
  comment text DEFAULT '',
  claimed_by varchar(20),
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_feedback_guild_claimed_idx ON ticket_feedback (guild_id, claimed_by);

CREATE TABLE IF NOT EXISTS ticket_staff_stats (
  guild_id varchar(20) NOT NULL,
  staff_id varchar(20) NOT NULL,
  tickets_claimed integer DEFAULT 0,
  tickets_closed integer DEFAULT 0,
  total_response_ms bigint DEFAULT 0,
  response_count integer DEFAULT 0,
  updated_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint,
  PRIMARY KEY (guild_id, staff_id)
);

-- 004_community.js

CREATE TABLE IF NOT EXISTS giveaways (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  channel_id varchar(20) NOT NULL,
  message_id varchar(20),
  host_id varchar(20) NOT NULL,
  prize varchar(200) NOT NULL,
  winners_count integer DEFAULT 1,
  ends_at bigint NOT NULL,
  ended boolean DEFAULT false,
  winners jsonb DEFAULT '[]',
  requirements jsonb DEFAULT '{}',
  entries jsonb DEFAULT '[]',
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS giveaways_guild_ended_idx ON giveaways (guild_id, ended);
CREATE INDEX IF NOT EXISTS giveaways_ends_at_idx ON giveaways (ends_at);

CREATE TABLE IF NOT EXISTS reaction_roles (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  channel_id varchar(20) NOT NULL,
  message_id varchar(20) NOT NULL,
  emoji varchar(64) NOT NULL,
  role_id varchar(20) NOT NULL,
  added_by varchar(20),
  created_at bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS reaction_roles_message_emoji_uq ON reaction_roles (message_id, emoji);
CREATE INDEX IF NOT EXISTS reaction_roles_guild_idx ON reaction_roles (guild_id);
CREATE INDEX IF NOT EXISTS reaction_roles_message_idx ON reaction_roles (message_id);

CREATE TABLE IF NOT EXISTS starboard (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  original_message_id varchar(20) NOT NULL,
  starboard_message_id varchar(20),
  channel_id varchar(20) NOT NULL,
  author_id varchar(20) NOT NULL,
  star_count integer DEFAULT 0,
  starred_at bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS starboard_guild_message_uq ON starboard (guild_id, original_message_id);
CREATE INDEX IF NOT EXISTS starboard_guild_star_idx ON starboard (guild_id, star_count);

CREATE TABLE IF NOT EXISTS suggestions (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  title varchar(200) NOT NULL,
  description text NOT NULL,
  status varchar(16) DEFAULT 'pending',
  message_id varchar(20),
  upvotes integer DEFAULT 0,
  downvotes integer DEFAULT 0,
  resolved_by varchar(20),
  resolution_note text,
  created_at bigint NOT NULL,
  resolved_at bigint
);
CREATE INDEX IF NOT EXISTS suggestions_guild_status_idx ON suggestions (guild_id, status);
CREATE INDEX IF NOT EXISTS suggestions_guild_user_idx ON suggestions (guild_id, user_id);

CREATE TABLE IF NOT EXISTS birthdays (
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  month integer NOT NULL,
  day integer NOT NULL,
  timezone varchar(64) DEFAULT 'UTC',
  last_celebrated bigint DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  channel_id varchar(20) NOT NULL,
  content text NOT NULL,
  scheduled_at bigint NOT NULL,
  sent boolean DEFAULT false,
  created_by varchar(20) NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS announcements_guild_sent_scheduled_idx ON announcements (guild_id, sent, scheduled_at);

CREATE TABLE IF NOT EXISTS counting (
  guild_id varchar(20) NOT NULL,
  channel_id varchar(20) NOT NULL,
  current_number integer DEFAULT 0,
  last_counter_id varchar(20),
  record integer DEFAULT 0,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS word_chain (
  guild_id varchar(20) NOT NULL,
  channel_id varchar(20) NOT NULL,
  last_word varchar(64),
  last_user_id varchar(20),
  chain_length integer DEFAULT 0,
  record integer DEFAULT 0,
  PRIMARY KEY (guild_id, channel_id)
);

-- 005_saas_and_ledger.js

CREATE TABLE IF NOT EXISTS economy_transactions (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  from_user varchar(32) NOT NULL,
  to_user varchar(32) NOT NULL,
  amount bigint NOT NULL,
  type varchar(32) NOT NULL,
  balance_before bigint NOT NULL,
  balance_after bigint NOT NULL,
  idempotency_key varchar(64) NOT NULL UNIQUE,
  metadata jsonb DEFAULT '{}',
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS economy_transactions_guild_created_idx ON economy_transactions (guild_id, created_at);
CREATE INDEX IF NOT EXISTS economy_transactions_from_idx ON economy_transactions (from_user);
CREATE INDEX IF NOT EXISTS economy_transactions_to_idx ON economy_transactions (to_user);
CREATE INDEX IF NOT EXISTS economy_transactions_type_idx ON economy_transactions (type);

CREATE TABLE IF NOT EXISTS security_decisions (
  id serial PRIMARY KEY,
  incident_id integer,
  guild_id varchar(20) NOT NULL,
  user_id varchar(20) NOT NULL,
  action varchar(32) NOT NULL,
  decision_reason text NOT NULL,
  confidence_score integer DEFAULT 100,
  factors jsonb DEFAULT '[]',
  rule_version varchar(16) DEFAULT '1.0.0',
  engine_version varchar(16) DEFAULT '2.0.0',
  timestamp bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS security_decisions_guild_ts_idx ON security_decisions (guild_id, timestamp);
CREATE INDEX IF NOT EXISTS security_decisions_user_idx ON security_decisions (user_id);

CREATE TABLE IF NOT EXISTS bot_allowlists (
  id serial PRIMARY KEY,
  guild_id varchar(20) NOT NULL,
  bot_id varchar(20) NOT NULL,
  bot_name varchar(64),
  status varchar(16) DEFAULT 'approved',
  approved_by varchar(20),
  max_permissions varchar(64) DEFAULT 'DEFAULT',
  policy_flags jsonb DEFAULT '{}',
  added_at bigint NOT NULL,
  updated_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS bot_allowlists_guild_bot_uq ON bot_allowlists (guild_id, bot_id);
CREATE INDEX IF NOT EXISTS bot_allowlists_guild_status_idx ON bot_allowlists (guild_id, status);

CREATE TABLE IF NOT EXISTS guild_subscriptions (
  guild_id varchar(20) PRIMARY KEY,
  plan varchar(32) DEFAULT 'FREE',
  status varchar(16) DEFAULT 'ACTIVE',
  features jsonb DEFAULT '{}',
  limits jsonb DEFAULT '{}',
  billing_cycle varchar(16) DEFAULT 'MONTHLY',
  expires_at bigint,
  created_at bigint NOT NULL,
  updated_at bigint DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS guild_subscriptions_plan_status_idx ON guild_subscriptions (plan, status);

-- End of all migrations
