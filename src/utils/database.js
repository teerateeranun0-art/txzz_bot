import knex from 'knex';
import { config } from '../config.js';
import { logger } from './logger.js';
import { withLock, withLocks } from './locks.js';
import { isSnowflake } from './sanitize.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default to the in-memory fallback so helper code works during dev/test startup
// before initDatabase() has a chance to establish PostgreSQL.
let db = null;

// In-memory fallback storage used when Postgres is unreachable (development only)
function createInMemoryDb() {
  const store = new Map();
  const idCounters = new Map();

  function ensureTable(table) {
    if (!store.has(table)) store.set(table, []);
    if (!idCounters.has(table)) idCounters.set(table, 1);
  }

  function copyRow(row) {
    return JSON.parse(JSON.stringify(row));
  }

    function buildQuery(table) {
      ensureTable(table);
      const rows = store.get(table);
    const q = {
      whereClauses: [],
      _order: null,
      _limit: null,
      _offset: 0,
      _toInsert: null,
      _insert(rowsToInsert) {
        const inserted = [];
        const array = Array.isArray(rowsToInsert) ? rowsToInsert : [rowsToInsert];
        for (const r of array) {
          const id = idCounters.get(table);
          const newRow = Object.assign({ id }, copyRow(r));
          idCounters.set(table, id + 1);
          rows.push(newRow);
          inserted.push(newRow);
        }
        return Promise.resolve(inserted.map((r) => ({ id: r.id })));
      },
      insert(obj) { this._toInsert = obj; return this; },
      returning() { return this; },
      onConflict() { return this; },
      merge() { return this; },
      ignore() { return this; },
      orderBy(field, dir = 'asc') { this._order = { field, dir }; return this; },
      limit(n) { this._limit = n; return this; },
      offset(n) { this._offset = n; return this; },
      count(alias = 'cnt') {
        let res = applyFilters(rows, this.whereClauses);
        return Promise.resolve([{ [alias]: res.length }]);
      },
      where(cond) {
        // support object equality
        this.whereClauses.push({ type: 'object', value: cond });
        return this;
      },
      andWhere(cond) { return this.where(cond); },
      whereRaw(raw, params) {
        // support details->>'sessionId' = ? pattern used in code
        this.whereClauses.push({ type: 'raw', raw, params });
        return this;
      },
      whereIn(col, arr) {
        this.whereClauses.push({ type: 'in', col, arr });
        return this;
      },
      orderByRaw() { return this; },
      update(upd) {
        const matched = applyFilters(rows, this.whereClauses);
        for (const r of matched) Object.assign(r, copyRow(upd));
        return Promise.resolve(matched.length);
      },
      delete() {
        const matched = applyFilters(rows, this.whereClauses);
        for (const m of matched) {
          const idx = rows.indexOf(m);
          if (idx !== -1) rows.splice(idx, 1);
        }
        return Promise.resolve();
      },
      first() {
        const res = applyFilters(rows, this.whereClauses);
        return Promise.resolve(res.length ? copyRow(res[0]) : null);
      },
      select() {
        const res = applyFilters(rows, this.whereClauses);
        let out = res.map(copyRow);
        if (this._order) {
          const { field, dir } = this._order;
          out.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0));
          if (dir && dir.toLowerCase() === 'desc') out.reverse();
        }
        if (this._offset) out = out.slice(this._offset);
        if (this._limit != null) out = out.slice(0, this._limit);
        return Promise.resolve(out);
      },
      then(onFulfilled, onRejected) {
        if (this._toInsert != null) {
          return this._insert(this._toInsert).then(onFulfilled, onRejected);
        }
        return this.select().then(onFulfilled, onRejected);
      },
    };
    return q;
  }

  function applyFilters(rows, clauses) {
    let result = rows.slice();
    for (const c of clauses) {
      if (c.type === 'object') {
        const whereObj = c.value;
        result = result.filter((r) => Object.entries(whereObj).every(([k, v]) => r[k] === v));
      } else if (c.type === 'in') {
        result = result.filter((r) => c.arr.includes(r[c.col]));
      } else if (c.type === 'raw') {
        // very limited support for pattern: details->>'sessionId' = ?
        if (/details->>'sessionId'\s*=\s*\?/.test(c.raw)) {
          const val = c.params?.[0];
          result = result.filter((r) => {
            try {
              const d = typeof r.details === 'string' ? JSON.parse(r.details) : r.details || {};
              return String(d.sessionId) === String(val);
            } catch { return false; }
          });
        }
      }
    }
    return result;
  }

  const api = function(table) {
    return buildQuery(table);
  };

  api.raw = async () => { return { rows: [{ '?column?': 1 }] }; };
  api.destroy = async () => {};
  api.transaction = async (fn) => {
    // simple transaction: call fn with a lightweight trx that maps to api
    const trx = (table) => buildQuery(table);
    return fn(trx);
  };

  return api;
}

// Initialize with the fallback immediately so direct db('table') calls never crash
// while the app is still booting or when PostgreSQL is unavailable.
db = createInMemoryDb();

/**
 * Initialize the PostgreSQL connection and run migrations.
 */
export async function initDatabase() {
  const dbConfig = config.database;

  const connection = dbConfig.url
    ? { connectionString: dbConfig.url }
    : {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.name,
        user: dbConfig.user,
        password: dbConfig.pass,
      };

  // Try to initialize real Postgres connection
  try {
    db = knex({ client: 'pg', connection, pool: dbConfig.pool });
    await db.raw('SELECT 1');
    logger.info('เชื่อมต่อ PostgreSQL สำเร็จ');
    // Run migrations
    await runMigrations();
    return db;
  } catch (err) {
    logger.warn('ไม่สามารถเชื่อมต่อ PostgreSQL — ตกกลับเป็น in-memory development DB: ' + (err?.message || err));
    // destroy knex if partly initialized
    try { if (db && db.destroy) await db.destroy(); } catch (_) {}
    // Use in-memory fallback so developer can run without a real DB
    db = createInMemoryDb();
    logger.info('เริ่มต้น in-memory fallback database (development mode)');
    return db;
  }
}

async function runMigrations() {
  if (!db) {
    logger.info('ข้ามการรัน migration: ไม่มีการเชื่อมต่อฐานข้อมูล');
    return;
  }
  const MIGRATION_LOCK_ID = 88992211;
  let lockAcquired = false;
  try {
    // Acquire PostgreSQL advisory lock
    const lockResult = await db.raw('SELECT pg_try_advisory_lock(?)', [MIGRATION_LOCK_ID]).catch(() => null);
    lockAcquired = lockResult?.rows?.[0]?.pg_try_advisory_lock ?? true;

    if (!lockAcquired) {
      logger.info('Migration: มีอีก Instance กำลังรัน migration อยู่ ข้ามเพื่อความปลอดภัย');
      return;
    }

    // Check if migrations table exists
    const hasTable = await db.schema.hasTable('_migrations');
    if (!hasTable) {
      await db.schema.createTable('_migrations', (t) => {
        t.increments('id').primary();
        t.string('name').notNullable();
        t.bigInteger('ran_at').defaultTo(Date.now());
      });
    }

    const ran = await db('_migrations').select('name');
    const ranNames = new Set(ran.map((r) => r.name));

    const { up } = await import(`../database/migrations/001_initial.js`);
    if (!ranNames.has('001_initial')) {
      logger.info('กำลังรัน migration 001_initial...');
      await up(db);
      await db('_migrations').insert({ name: '001_initial', ran_at: Date.now() });
      logger.info('Migration 001_initial สำเร็จ');
    }

    const { up: up2 } = await import(`../database/migrations/002_moderation.js`);
    if (!ranNames.has('002_moderation')) {
      logger.info('กำลังรัน migration 002_moderation...');
      await up2(db);
      await db('_migrations').insert({ name: '002_moderation', ran_at: Date.now() });
      logger.info('Migration 002_moderation สำเร็จ');
    }

    const { up: up3 } = await import(`../database/migrations/003_tickets.js`);
    if (!ranNames.has('003_tickets')) {
      logger.info('กำลังรัน migration 003_tickets...');
      await up3(db);
      await db('_migrations').insert({ name: '003_tickets', ran_at: Date.now() });
      logger.info('Migration 003_tickets สำเร็จ');
    }

    const { up: up4 } = await import(`../database/migrations/004_community.js`);
    if (!ranNames.has('004_community')) {
      logger.info('กำลังรัน migration 004_community...');
      await up4(db);
      await db('_migrations').insert({ name: '004_community', ran_at: Date.now() });
      logger.info('Migration 004_community สำเร็จ');
    }

    const { up: up5 } = await import(`../database/migrations/005_saas_and_ledger.js`);
    if (!ranNames.has('005_saas_and_ledger')) {
      logger.info('กำลังรัน migration 005_saas_and_ledger...');
      await up5(db);
      await db('_migrations').insert({ name: '005_saas_and_ledger', ran_at: Date.now() });
      logger.info('Migration 005_saas_and_ledger สำเร็จ');
    }
  } catch (err) {
    logger.error('Migration ล้มเหลว', err);
    throw err;
  } finally {
    if (lockAcquired) {
      await db.raw('SELECT pg_advisory_unlock(?)', [MIGRATION_LOCK_ID]).catch(() => {});
    }
  }
}

/**
 * Get the raw knex instance (for advanced queries).
 */
export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

/**
 * Gracefully close the database connection.
 */
export async function closeDatabase() {
  if (db) {
    await db.destroy();
    logger.info('ปิดการเชื่อมต่อ PostgreSQL แล้ว');
  }
}

/**
 * Health check ping.
 */
export async function healthCheck() {
  try {
    await db.raw('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Backward-compatible flush (no-op for PG, kept for API compat) ──
export async function flush() {
  // No-op: PostgreSQL writes are immediate
}

// ── Legacy load/save stubs (kept for API compat but unused) ──
export function load() {
  return {};
}
export function save() {}

// ═══════════════════════════════════════════════════
//  ECONOMY
// ═══════════════════════════════════════════════════

function defaultEconomy() {
  return {
    balance: config.economy.startBalance,
    bank: 0,
    lastDaily: 0,
    lastWork: 0,
    lastRob: 0,
  };
}

function clampMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(config.economy.maxBalance, Math.floor(n)));
}

export function getUserEconomy(guildId, userId) {
  // Synchronous fallback using cache for backward compat
  const key = `eco:${guildId}:${userId}`;
  if (economyCache.has(key)) return economyCache.get(key);
  const def = defaultEconomy();
  economyCache.set(key, def);
  // Trigger async load
  loadEconomy(guildId, userId).catch(() => {});
  return def;
}

const economyCache = new Map();

async function loadEconomy(guildId, userId) {
  const row = await db('economy').where({ guild_id: guildId, user_id: userId }).first();
  const key = `eco:${guildId}:${userId}`;
  if (row) {
    const data = {
      balance: Number(row.balance),
      bank: Number(row.bank),
      lastDaily: Number(row.last_daily),
      lastWork: Number(row.last_work),
      lastRob: Number(row.last_rob),
    };
    economyCache.set(key, data);
    return data;
  }
  const def = defaultEconomy();
  economyCache.set(key, def);
  return def;
}

export async function ensureEconomy(guildId, userId) {
  const key = `eco:${guildId}:${userId}`;
  if (economyCache.has(key)) return economyCache.get(key);
  return loadEconomy(guildId, userId);
}

export function updateUserEconomy(guildId, userId, updates) {
  const key = `eco:${guildId}:${userId}`;
  const current = getUserEconomy(guildId, userId);
  const merged = { ...current, ...updates };
  merged.balance = clampMoney(merged.balance);
  merged.bank = clampMoney(merged.bank);
  economyCache.set(key, merged);

  // Async persist
  db('economy')
    .insert({
      guild_id: guildId,
      user_id: userId,
      balance: merged.balance,
      bank: merged.bank,
      last_daily: merged.lastDaily,
      last_work: merged.lastWork,
      last_rob: merged.lastRob,
    })
    .onConflict(['guild_id', 'user_id'])
    .merge()
    .catch((err) => logger.error('updateUserEconomy persist', err));

  return merged;
}

export async function withEconomy(guildId, userIds, fn) {
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).filter(isSnowflake);
  const keys = ids.map((id) => `eco:${guildId}:${id}`);
  // Pre-load all economies into cache
  for (const id of ids) {
    await ensureEconomy(guildId, id);
  }
  return withLocks(keys, () => fn());
}

/**
 * Strict ACID Transfer with row-level FOR UPDATE locks and Double-Entry Ledger insertion.
 */
export async function transferMoneyStrict(guildId, fromUserId, toUserId, amount, idempotencyKey = null) {
  if (amount <= 0 || fromUserId === toUserId) {
    throw new Error('Invalid transfer parameters');
  }

  const iKey = idempotencyKey || `tx_pay_${guildId}_${fromUserId}_${toUserId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return db.transaction(async (trx) => {
    // 1. Check idempotency
    const existing = await trx('economy_transactions').where({ idempotency_key: iKey }).first();
    if (existing) {
      return {
        senderBalance: Number(existing.balance_before) - Number(existing.amount),
        receiverBalance: Number(existing.balance_after),
        amount: Number(existing.amount),
        idempotentReplay: true,
      };
    }

    // Sort IDs to prevent database-level deadlocks
    const [firstId, secondId] = [fromUserId, toUserId].sort();
    
    // Ensure rows exist
    await trx('economy')
      .insert([
        { guild_id: guildId, user_id: fromUserId, balance: 500, bank: 0 },
        { guild_id: guildId, user_id: toUserId, balance: 500, bank: 0 },
      ])
      .onConflict(['guild_id', 'user_id'])
      .ignore();

    // Lock rows in deterministic order
    const sender = await trx('economy')
      .where({ guild_id: guildId, user_id: fromUserId })
      .forUpdate()
      .first();

    const receiver = await trx('economy')
      .where({ guild_id: guildId, user_id: toUserId })
      .forUpdate()
      .first();

    const senderBal = Number(sender.balance);
    if (senderBal < amount) {
      throw new Error(`ยอดเงินไม่เพียงพอ (มี ${senderBal.toLocaleString()} เหรียญ)`);
    }

    const newSenderBal = senderBal - amount;
    const newReceiverBal = Number(receiver.balance) + amount;

    await trx('economy')
      .where({ guild_id: guildId, user_id: fromUserId })
      .update({ balance: newSenderBal });

    await trx('economy')
      .where({ guild_id: guildId, user_id: toUserId })
      .update({ balance: newReceiverBal });

    // Insert immutable audit ledger
    await trx('economy_transactions').insert({
      guild_id: guildId,
      from_user: fromUserId,
      to_user: toUserId,
      amount,
      type: 'pay',
      balance_before: senderBal,
      balance_after: newSenderBal,
      idempotency_key: iKey,
      metadata: JSON.stringify({ to_user_balance_after: newReceiverBal }),
      created_at: Date.now(),
    });

    // Update local cache
    const senderKey = `eco:${guildId}:${fromUserId}`;
    const receiverKey = `eco:${guildId}:${toUserId}`;
    if (economyCache.has(senderKey)) economyCache.get(senderKey).balance = newSenderBal;
    if (economyCache.has(receiverKey)) economyCache.get(receiverKey).balance = newReceiverBal;

    return { senderBalance: newSenderBal, receiverBalance: newReceiverBal, amount, idempotencyKey: iKey };
  });
}

/**
 * Strict ACID Deposit (wallet -> bank) with Double-Entry Ledger
 */
export async function depositMoneyStrict(guildId, userId, amount, idempotencyKey = null) {
  if (amount <= 0) throw new Error('Invalid deposit amount');
  const iKey = idempotencyKey || `tx_dep_${guildId}_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return db.transaction(async (trx) => {
    const existing = await trx('economy_transactions').where({ idempotency_key: iKey }).first();
    if (existing) {
      return { balance: Number(existing.balance_after), bank: Number(existing.metadata?.bank_after || 0), amount: Number(existing.amount), idempotentReplay: true };
    }

    await trx('economy')
      .insert({ guild_id: guildId, user_id: userId, balance: 500, bank: 0 })
      .onConflict(['guild_id', 'user_id'])
      .ignore();

    const row = await trx('economy')
      .where({ guild_id: guildId, user_id: userId })
      .forUpdate()
      .first();

    const bal = Number(row.balance);
    if (bal < amount) {
      throw new Error(`ยอดเงินในกระเป๋าไม่พอ (มี ${bal.toLocaleString()} เหรียญ)`);
    }

    const newBal = bal - amount;
    const newBank = Number(row.bank) + amount;

    await trx('economy')
      .where({ guild_id: guildId, user_id: userId })
      .update({ balance: newBal, bank: newBank });

    await trx('economy_transactions').insert({
      guild_id: guildId,
      from_user: userId,
      to_user: 'BANK',
      amount,
      type: 'deposit',
      balance_before: bal,
      balance_after: newBal,
      idempotency_key: iKey,
      metadata: JSON.stringify({ bank_after: newBank }),
      created_at: Date.now(),
    });

    const key = `eco:${guildId}:${userId}`;
    if (economyCache.has(key)) {
      economyCache.get(key).balance = newBal;
      economyCache.get(key).bank = newBank;
    }

    return { balance: newBal, bank: newBank, amount, idempotencyKey: iKey };
  });
}

/**
 * Strict ACID Withdraw (bank -> wallet) with Double-Entry Ledger
 */
export async function withdrawMoneyStrict(guildId, userId, amount, idempotencyKey = null) {
  if (amount <= 0) throw new Error('Invalid withdraw amount');
  const iKey = idempotencyKey || `tx_wth_${guildId}_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return db.transaction(async (trx) => {
    const existing = await trx('economy_transactions').where({ idempotency_key: iKey }).first();
    if (existing) {
      return { balance: Number(existing.balance_after), bank: Number(existing.metadata?.bank_after || 0), amount: Number(existing.amount), idempotentReplay: true };
    }

    await trx('economy')
      .insert({ guild_id: guildId, user_id: userId, balance: 500, bank: 0 })
      .onConflict(['guild_id', 'user_id'])
      .ignore();

    const row = await trx('economy')
      .where({ guild_id: guildId, user_id: userId })
      .forUpdate()
      .first();

    const bankBal = Number(row.bank);
    if (bankBal < amount) {
      throw new Error(`ยอดเงินในธนาคารไม่พอ (มี ${bankBal.toLocaleString()} เหรียญ)`);
    }

    const newBank = bankBal - amount;
    const newBal = Number(row.balance) + amount;

    await trx('economy')
      .where({ guild_id: guildId, user_id: userId })
      .update({ balance: newBal, bank: newBank });

    await trx('economy_transactions').insert({
      guild_id: guildId,
      from_user: 'BANK',
      to_user: userId,
      amount,
      type: 'withdraw',
      balance_before: bankBal,
      balance_after: newBal,
      idempotency_key: iKey,
      metadata: JSON.stringify({ bank_after: newBank }),
      created_at: Date.now(),
    });

    const key = `eco:${guildId}:${userId}`;
    if (economyCache.has(key)) {
      economyCache.get(key).balance = newBal;
      economyCache.get(key).bank = newBank;
    }

    return { balance: newBal, bank: newBank, amount, idempotencyKey: iKey };
  });
}

/**
 * Strict ACID Gamble with Double-Entry Ledger
 */
export async function gambleMoneyStrict(guildId, userId, amount, isWin, multiplier = 1) {
  if (amount <= 0) throw new Error('Invalid gamble amount');
  const iKey = `tx_gam_${guildId}_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return db.transaction(async (trx) => {
    await trx('economy')
      .insert({ guild_id: guildId, user_id: userId, balance: 500, bank: 0 })
      .onConflict(['guild_id', 'user_id'])
      .ignore();

    const row = await trx('economy')
      .where({ guild_id: guildId, user_id: userId })
      .forUpdate()
      .first();

    const bal = Number(row.balance);
    if (bal < amount) {
      throw new Error(`ยอดเงินไม่พอสำหรับการเดิมพัน (มี ${bal.toLocaleString()} เหรียญ)`);
    }

    const delta = isWin ? Math.floor(amount * multiplier) : -amount;
    const newBal = clampMoney(bal + delta);

    await trx('economy')
      .where({ guild_id: guildId, user_id: userId })
      .update({ balance: newBal });

    await trx('economy_transactions').insert({
      guild_id: guildId,
      from_user: isWin ? 'CASINO_VAULT' : userId,
      to_user: isWin ? userId : 'CASINO_VAULT',
      amount: Math.abs(delta),
      type: 'gamble',
      balance_before: bal,
      balance_after: newBal,
      idempotency_key: iKey,
      metadata: JSON.stringify({ isWin, multiplier }),
      created_at: Date.now(),
    });

    const key = `eco:${guildId}:${userId}`;
    if (economyCache.has(key)) economyCache.get(key).balance = newBal;

    return { balance: newBal, delta, isWin, idempotencyKey: iKey };
  });
}

/**
 * Strict ACID Rob with Double-Entry Ledger
 */
export async function robMoneyStrict(guildId, robberId, victimId, success, stolenAmount, fineAmount) {
  const iKey = `tx_rob_${guildId}_${robberId}_${victimId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return db.transaction(async (trx) => {
    const [firstId, secondId] = [robberId, victimId].sort();

    await trx('economy')
      .insert([
        { guild_id: guildId, user_id: robberId, balance: 500, bank: 0 },
        { guild_id: guildId, user_id: victimId, balance: 500, bank: 0 },
      ])
      .onConflict(['guild_id', 'user_id'])
      .ignore();

    const robber = await trx('economy').where({ guild_id: guildId, user_id: robberId }).forUpdate().first();
    const victim = await trx('economy').where({ guild_id: guildId, user_id: victimId }).forUpdate().first();

    let robberBal = Number(robber.balance);
    let victimBal = Number(victim.balance);

    if (success) {
      const actualStolen = Math.min(victimBal, stolenAmount);
      robberBal = clampMoney(robberBal + actualStolen);
      victimBal = clampMoney(victimBal - actualStolen);

      await trx('economy').where({ guild_id: guildId, user_id: robberId }).update({ balance: robberBal, last_rob: Date.now() });
      await trx('economy').where({ guild_id: guildId, user_id: victimId }).update({ balance: victimBal });

      await trx('economy_transactions').insert({
        guild_id: guildId,
        from_user: victimId,
        to_user: robberId,
        amount: actualStolen,
        type: 'rob',
        balance_before: victimBal + actualStolen,
        balance_after: robberBal,
        idempotency_key: iKey,
        metadata: JSON.stringify({ success: true }),
        created_at: Date.now(),
      });

      const rKey = `eco:${guildId}:${robberId}`;
      const vKey = `eco:${guildId}:${victimId}`;
      if (economyCache.has(rKey)) { economyCache.get(rKey).balance = robberBal; economyCache.get(rKey).lastRob = Date.now(); }
      if (economyCache.has(vKey)) { economyCache.get(vKey).balance = victimBal; }

      return { success: true, stolen: actualStolen, robberBalance: robberBal, victimBalance: victimBal, idempotencyKey: iKey };
    } else {
      robberBal = clampMoney(robberBal - fineAmount);
      await trx('economy').where({ guild_id: guildId, user_id: robberId }).update({ balance: robberBal, last_rob: Date.now() });

      await trx('economy_transactions').insert({
        guild_id: guildId,
        from_user: robberId,
        to_user: 'POLICE_FINE',
        amount: fineAmount,
        type: 'rob_fine',
        balance_before: robberBal + fineAmount,
        balance_after: robberBal,
        idempotency_key: iKey,
        metadata: JSON.stringify({ success: false, victimId }),
        created_at: Date.now(),
      });

      const rKey = `eco:${guildId}:${robberId}`;
      if (economyCache.has(rKey)) { economyCache.get(rKey).balance = robberBal; economyCache.get(rKey).lastRob = Date.now(); }

      return { success: false, fine: fineAmount, robberBalance: robberBal, idempotencyKey: iKey };
    }
  });
}

export async function getLedgerTransactions(guildId, { limit = 20, type = null, userId = null } = {}) {
  if (!db) return [];
  let query = db('economy_transactions').where({ guild_id: guildId }).orderBy('created_at', 'desc').limit(limit);
  if (type) query = query.where({ type });
  if (userId) query = query.where((q) => q.where('from_user', userId).orWhere('to_user', userId));

  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    guildId: r.guild_id,
    fromUser: r.from_user,
    toUser: r.to_user,
    amount: Number(r.amount),
    type: r.type,
    balanceBefore: Number(r.balance_before),
    balanceAfter: Number(r.balance_after),
    idempotencyKey: r.idempotency_key,
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    createdAt: Number(r.created_at),
  }));
}

// ═══════════════════════════════════════════════════
//  EXPLAINABLE SECURITY DECISIONS & BOT ALLOWLISTS
// ═══════════════════════════════════════════════════

export async function recordSecurityDecision(decisionData) {
  if (!db) return null;
  const [result] = await db('security_decisions')
    .insert({
      incident_id: decisionData.incidentId || null,
      guild_id: decisionData.guildId,
      user_id: decisionData.userId,
      action: decisionData.action,
      decision_reason: decisionData.reason,
      confidence_score: decisionData.confidenceScore ?? 100,
      factors: JSON.stringify(decisionData.factors || []),
      rule_version: decisionData.ruleVersion || '1.0.0',
      engine_version: decisionData.engineVersion || '2.0.0',
      timestamp: Date.now(),
    })
    .returning('id');

  return typeof result === 'object' ? result.id : result;
}

export async function getSecurityDecisions(guildId, { limit = 20, userId = null } = {}) {
  if (!db) return [];
  let query = db('security_decisions').where({ guild_id: guildId }).orderBy('timestamp', 'desc').limit(limit);
  if (userId) query = query.where({ user_id: userId });

  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    incidentId: r.incident_id,
    guildId: r.guild_id,
    userId: r.user_id,
    action: r.action,
    reason: r.decision_reason,
    confidenceScore: r.confidence_score,
    factors: typeof r.factors === 'string' ? JSON.parse(r.factors) : r.factors,
    ruleVersion: r.rule_version,
    engineVersion: r.engine_version,
    timestamp: Number(r.timestamp),
  }));
}

export async function getBotAllowlist(guildId) {
  if (!db) return [];
  return db('bot_allowlists').where({ guild_id: guildId });
}

export async function setBotAllowlist(guildId, botId, { botName, status = 'approved', approvedBy, policyFlags = {} }) {
  if (!db) return null;
  await db('bot_allowlists')
    .insert({
      guild_id: guildId,
      bot_id: botId,
      bot_name: botName || 'Unknown Bot',
      status,
      approved_by: approvedBy,
      policy_flags: JSON.stringify(policyFlags),
      added_at: Date.now(),
      updated_at: Date.now(),
    })
    .onConflict(['guild_id', 'bot_id'])
    .merge();
}

// ═══════════════════════════════════════════════════
//  MULTI-GUILD SAAS SUBSCRIPTIONS & ENTITLEMENTS
// ═══════════════════════════════════════════════════

const subscriptionCache = new Map();

export async function getGuildSubscription(guildId) {
  if (subscriptionCache.has(guildId)) return subscriptionCache.get(guildId);
  if (!db) {
    const fallback = { plan: 'FREE', status: 'ACTIVE', features: {}, limits: {} };
    subscriptionCache.set(guildId, fallback);
    return fallback;
  }

  const row = await db('guild_subscriptions').where({ guild_id: guildId }).first();
  if (row) {
    const sub = {
      guildId: row.guild_id,
      plan: row.plan,
      status: row.status,
      features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features,
      limits: typeof row.limits === 'string' ? JSON.parse(row.limits) : row.limits,
      billingCycle: row.billing_cycle,
      expiresAt: row.expires_at ? Number(row.expires_at) : null,
      createdAt: Number(row.created_at),
    };
    subscriptionCache.set(guildId, sub);
    return sub;
  }

  const def = {
    guildId,
    plan: 'FREE',
    status: 'ACTIVE',
    features: { basicSecurity: true, basicAutoMod: true, maxTickets: 15 },
    limits: { maxSnapshots: 20 },
    billingCycle: 'MONTHLY',
    expiresAt: null,
    createdAt: Date.now(),
  };
  subscriptionCache.set(guildId, def);
  return def;
}

export async function setGuildSubscription(guildId, { plan = 'FREE', status = 'ACTIVE', features = {}, limits = {}, expiresAt = null }) {
  if (db) {
    await db('guild_subscriptions')
      .insert({
        guild_id: guildId,
        plan,
        status,
        features: JSON.stringify(features),
        limits: JSON.stringify(limits),
        expires_at: expiresAt,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
      .onConflict('guild_id')
      .merge();
  }

  const updated = { guildId, plan, status, features, limits, expiresAt, createdAt: Date.now() };
  subscriptionCache.set(guildId, updated);
  return updated;
}

export async function hasEntitlement(guildId, featureName) {
  const sub = await getGuildSubscription(guildId);
  if (sub.plan === 'ENTERPRISE' || sub.plan === 'BUSINESS') return true;
  return Boolean(sub.features?.[featureName]);
}

// ═══════════════════════════════════════════════════
//  LEVELS
// ═══════════════════════════════════════════════════

const levelCache = new Map();

export function getUserLevel(guildId, userId) {
  const key = `lvl:${guildId}:${userId}`;
  if (levelCache.has(key)) return levelCache.get(key);
  const def = { xp: 0, level: 0, lastXp: 0 };
  levelCache.set(key, def);
  loadLevel(guildId, userId).catch(() => {});
  return def;
}

async function loadLevel(guildId, userId) {
  const row = await db('levels').where({ guild_id: guildId, user_id: userId }).first();
  const key = `lvl:${guildId}:${userId}`;
  if (row) {
    const data = { xp: row.xp, level: row.level, lastXp: Number(row.last_xp) };
    levelCache.set(key, data);
    return data;
  }
  const def = { xp: 0, level: 0, lastXp: 0 };
  levelCache.set(key, def);
  return def;
}

export async function ensureUserLevel(guildId, userId) {
  const key = `lvl:${guildId}:${userId}`;
  if (levelCache.has(key)) return levelCache.get(key);
  return loadLevel(guildId, userId);
}

export function updateUserLevel(guildId, userId, updates) {
  const key = `lvl:${guildId}:${userId}`;
  const current = getUserLevel(guildId, userId);
  const merged = { ...current, ...updates };
  merged.xp = Math.max(0, Math.floor(merged.xp || 0));
  merged.level = Math.max(0, Math.min(1000, Math.floor(merged.level || 0)));
  levelCache.set(key, merged);

  db('levels')
    .insert({
      guild_id: guildId,
      user_id: userId,
      xp: merged.xp,
      level: merged.level,
      last_xp: merged.lastXp,
    })
    .onConflict(['guild_id', 'user_id'])
    .merge()
    .catch((err) => logger.error('updateUserLevel persist', err));

  return merged;
}

export function xpForLevel(level) {
  return 5 * level ** 2 + 50 * level + 100;
}

// ═══════════════════════════════════════════════════
//  WARNINGS
// ═══════════════════════════════════════════════════

export async function addWarning(guildId, userId, modId, reason, options = {}) {
  const now = Date.now();
  const [result] = await db('warnings')
    .insert({
      guild_id: guildId,
      user_id: userId,
      mod_id: modId,
      reason: String(reason).slice(0, 400),
      date: now,
      points: options.points || 1,
      expires_at: options.expiresAt || null,
      case_id: options.caseId || null,
    })
    .returning('id');
  return { id: typeof result === 'object' ? result.id : result, modId, reason: String(reason).slice(0, 400), date: now, points: options.points || 1 };
}

export async function getWarnings(guildId, userId) {
  const rows = await db('warnings')
    .where({ guild_id: guildId, user_id: userId })
    .orderBy('id', 'asc');
  return rows.map((r) => ({
    id: r.id,
    modId: r.mod_id,
    reason: r.reason,
    date: Number(r.date),
    points: r.points || 1,
    expiresAt: r.expires_at ? Number(r.expires_at) : null,
    expired: r.expired || false,
    caseId: r.case_id || null,
  }));
}

export async function clearWarnings(guildId, userId) {
  await db('warnings').where({ guild_id: guildId, user_id: userId }).delete();
}

// ═══════════════════════════════════════════════════
//  GUILD CONFIG
// ═══════════════════════════════════════════════════

const guildConfigCache = new Map();

const GUILD_CONFIG_KEYS = {
  welcomeChannel: 'welcome_channel',
  welcomeMessage: 'welcome_message',
  autorole: 'autorole',
  modLogChannel: 'mod_log_channel',
  ticketStaffRole: 'ticket_staff_role',
};

async function loadGuildConfig(guildId) {
  const row = await db('guild_configs').where({ guild_id: guildId }).first();
  if (row) {
    const cfg = {
      welcomeChannel: row.welcome_channel,
      welcomeMessage: row.welcome_message,
      autorole: row.autorole,
      modLogChannel: row.mod_log_channel,
      ticketStaffRole: row.ticket_staff_role,
      securityConfig: row.security_config || {},
    };
    guildConfigCache.set(guildId, cfg);
    return cfg;
  }
  guildConfigCache.set(guildId, {});
  return {};
}

export async function ensureGuildConfig(guildId) {
  if (guildConfigCache.has(guildId)) return guildConfigCache.get(guildId);
  return loadGuildConfig(guildId);
}

export function getGuildConfig(guildId, key, defaultValue = null) {
  const cached = guildConfigCache.get(guildId);
  if (!cached) {
    loadGuildConfig(guildId).catch(() => {});
    return defaultValue;
  }
  return cached[key] ?? defaultValue;
}

export async function setGuildConfig(guildId, key, value) {
  const col = GUILD_CONFIG_KEYS[key];
  if (!col && key !== 'securityConfig') {
    throw new Error('invalid guild config key');
  }

  const cached = guildConfigCache.get(guildId) || {};
  cached[key] = value;
  guildConfigCache.set(guildId, cached);

  if (key === 'securityConfig') {
    await db('guild_configs')
      .insert({
        guild_id: guildId,
        security_config: JSON.stringify(value),
        updated_at: Date.now(),
      })
      .onConflict('guild_id')
      .merge({ security_config: JSON.stringify(value), updated_at: Date.now() });
  } else {
    const updateObj = { [col]: value, updated_at: Date.now() };
    await db('guild_configs')
      .insert({ guild_id: guildId, ...updateObj })
      .onConflict('guild_id')
      .merge(updateObj);
  }
}

export async function getSecurityConfig(guildId) {
  const cfg = guildConfigCache.get(guildId);
  if (cfg?.securityConfig) return cfg.securityConfig;
  const row = await db('guild_configs').where({ guild_id: guildId }).first();
  if (!row) return {};
  const sc = typeof row.security_config === 'string' ? JSON.parse(row.security_config) : (row.security_config || {});
  if (!guildConfigCache.has(guildId)) guildConfigCache.set(guildId, {});
  guildConfigCache.get(guildId).securityConfig = sc;
  return sc;
}

export async function setSecurityConfig(guildId, config) {
  return setGuildConfig(guildId, 'securityConfig', config);
}

// ═══════════════════════════════════════════════════
//  REMINDERS
// ═══════════════════════════════════════════════════

export async function addReminder(userId, channelId, message, time) {
  const count = await db('reminders').where({ user_id: userId }).count('id as cnt').first();
  if (Number(count?.cnt || 0) >= 10) throw new Error('user reminder limit');
  const total = await db('reminders').count('id as cnt').first();
  if (Number(total?.cnt || 0) >= 200) throw new Error('too many reminders');
  const [result] = await db('reminders')
    .insert({
      user_id: userId,
      channel_id: channelId,
      message: String(message).slice(0, 200),
      time,
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getReminders() {
  const rows = await db('reminders').select('*');
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    channelId: r.channel_id,
    message: r.message,
    time: Number(r.time),
  }));
}

export async function removeReminder(id) {
  await db('reminders').where({ id }).delete();
}

// ═══════════════════════════════════════════════════
//  AFK
// ═══════════════════════════════════════════════════

const afkCache = new Map();

export function setAfk(userId, reason) {
  const data = { reason: String(reason).slice(0, 100), since: Date.now() };
  afkCache.set(userId, data);
  db('afk')
    .insert({ user_id: userId, reason: data.reason, since: data.since })
    .onConflict('user_id')
    .merge()
    .catch((err) => logger.error('setAfk persist', err));
  return data;
}

export function getAfk(userId) {
  return afkCache.get(userId) || null;
}

export function clearAfk(userId) {
  afkCache.delete(userId);
  db('afk').where({ user_id: userId }).delete().catch((err) => logger.error('clearAfk persist', err));
}

// ═══════════════════════════════════════════════════
//  SECURITY: TRUSTED USERS / ROLES
// ═══════════════════════════════════════════════════

export async function addTrustedUser(guildId, userId, addedBy) {
  await db('trusted_users')
    .insert({ guild_id: guildId, user_id: userId, added_by: addedBy, added_at: Date.now() })
    .onConflict(['guild_id', 'user_id'])
    .merge();
}

export async function removeTrustedUser(guildId, userId) {
  await db('trusted_users').where({ guild_id: guildId, user_id: userId }).delete();
}

export async function getTrustedUsers(guildId) {
  const rows = await db('trusted_users').where({ guild_id: guildId });
  return rows.map((r) => r.user_id);
}

export async function isTrustedUser(guildId, userId) {
  if (!db) return false;
  const row = await db('trusted_users').where({ guild_id: guildId, user_id: userId }).first();
  return !!row;
}

export async function addTrustedRole(guildId, roleId, addedBy) {
  await db('trusted_roles')
    .insert({ guild_id: guildId, role_id: roleId, added_by: addedBy, added_at: Date.now() })
    .onConflict(['guild_id', 'role_id'])
    .merge();
}

export async function removeTrustedRole(guildId, roleId) {
  await db('trusted_roles').where({ guild_id: guildId, role_id: roleId }).delete();
}

export async function getTrustedRoles(guildId) {
  const rows = await db('trusted_roles').where({ guild_id: guildId });
  return rows.map((r) => r.role_id);
}

// ═══════════════════════════════════════════════════
//  SECURITY: PROTECTED RESOURCES
// ═══════════════════════════════════════════════════

export async function addProtectedResource(guildId, type, resourceId, addedBy) {
  const table = `protected_${type}`;
  const col = `${type === 'categories' ? 'category' : type.replace(/s$/, '')}_id`;
  await db(table)
    .insert({ guild_id: guildId, [col]: resourceId, added_by: addedBy, added_at: Date.now() })
    .onConflict(['guild_id', col])
    .merge();
}

export async function removeProtectedResource(guildId, type, resourceId) {
  const table = `protected_${type}`;
  const col = `${type === 'categories' ? 'category' : type.replace(/s$/, '')}_id`;
  await db(table).where({ guild_id: guildId, [col]: resourceId }).delete();
}

export async function getProtectedResources(guildId, type) {
  const table = `protected_${type}`;
  const col = `${type === 'categories' ? 'category' : type.replace(/s$/, '')}_id`;
  const rows = await db(table).where({ guild_id: guildId });
  return rows.map((r) => r[col]);
}

export async function isProtected(guildId, type, resourceId) {
  const table = `protected_${type}`;
  const col = `${type === 'categories' ? 'category' : type.replace(/s$/, '')}_id`;
  const row = await db(table).where({ guild_id: guildId, [col]: resourceId }).first();
  return !!row;
}

// ═══════════════════════════════════════════════════
//  SECURITY: INCIDENTS
// ═══════════════════════════════════════════════════

export async function createIncident(guildId, type, severity, executorId, details, actionTaken, incidentSessionId = null) {
  const sessionId = incidentSessionId || `INC-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const detailsObj = details || {};
  detailsObj.sessionId = sessionId;

  const [result] = await db('security_incidents')
    .insert({
      guild_id: guildId,
      type,
      severity: severity || 'warning',
      executor_id: executorId || null,
      details: JSON.stringify(detailsObj),
      action_taken: actionTaken || null,
      timestamp: Date.now(),
    })
    .returning('id');
  return { id: typeof result === 'object' ? result.id : result, sessionId };
}

export async function getIncidents(guildId, { limit = 20, type = null } = {}) {
  let query = db('security_incidents').where({ guild_id: guildId }).orderBy('timestamp', 'desc').limit(limit);
  if (type) query = query.where({ type });
  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    guildId: r.guild_id,
    type: r.type,
    severity: r.severity,
    executorId: r.executor_id,
    details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
    actionTaken: r.action_taken,
    timestamp: Number(r.timestamp),
  }));
}

export async function getIncidentById(guildId, id) {
  const row = await db('security_incidents').where({ guild_id: guildId, id }).first();
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    type: row.type,
    severity: row.severity,
    executorId: row.executor_id,
    details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
    actionTaken: row.action_taken,
    timestamp: Number(row.timestamp),
  };
}

export async function getIncidentTimeline(guildId, sessionId, limit = 50) {
  const rows = await db('security_incidents')
    .where({ guild_id: guildId })
    .whereRaw("details->>'sessionId' = ?", [sessionId])
    .orderBy('timestamp', 'asc')
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    guildId: r.guild_id,
    type: r.type,
    severity: r.severity,
    executorId: r.executor_id,
    details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
    actionTaken: r.action_taken,
    timestamp: Number(r.timestamp),
  }));
}

export async function isSimulationMode(guildId) {
  const cfg = await ensureGuildConfig(guildId);
  return Boolean(cfg.securityConfig?.simulationMode);
}

export async function setSimulationMode(guildId, enabled) {
  const cfg = await ensureGuildConfig(guildId);
  const sec = cfg.securityConfig || {};
  sec.simulationMode = Boolean(enabled);
  await setGuildConfig(guildId, 'securityConfig', sec);
  return sec.simulationMode;
}

export async function getGuildThresholds(guildId) {
  const cfg = await ensureGuildConfig(guildId);
  return cfg.securityConfig?.thresholds || null;
}

export async function setGuildThreshold(guildId, actionType, maxCount, windowSeconds) {
  const cfg = await ensureGuildConfig(guildId);
  const sec = cfg.securityConfig || {};
  const rawMax = typeof maxCount === 'object' ? (maxCount?.max ?? 0) : maxCount;
  const rawWindow = typeof windowSeconds === 'object'
    ? (windowSeconds?.windowMs ?? windowSeconds?.windowSeconds ?? 0)
    : windowSeconds;

  sec.thresholds = sec.thresholds || {};
  sec.thresholds[actionType] = {
    max: Number(rawMax),
    windowMs: Number(rawWindow) > 1000 ? Number(rawWindow) : Number(rawWindow) * 1000,
  };
  await setGuildConfig(guildId, 'securityConfig', sec);
  return sec.thresholds[actionType];
}

// ═══════════════════════════════════════════════════
//  SECURITY: SNAPSHOTS
// ═══════════════════════════════════════════════════

export async function createSnapshot(guildId, label, trigger, rolesData, channelsData, serverData) {
  const [result] = await db('security_snapshots')
    .insert({
      guild_id: guildId,
      label: label || '',
      trigger: trigger || 'manual',
      roles_data: JSON.stringify(rolesData || []),
      channels_data: JSON.stringify(channelsData || []),
      server_data: JSON.stringify(serverData || {}),
      timestamp: Date.now(),
    })
    .returning('id');

  // Enforce max snapshots per guild
  const maxSnaps = config.security.snapshot.maxSnapshots;
  const count = await db('security_snapshots').where({ guild_id: guildId }).count('id as cnt').first();
  if (Number(count?.cnt || 0) > maxSnaps) {
    const oldest = await db('security_snapshots')
      .where({ guild_id: guildId })
      .orderBy('timestamp', 'asc')
      .limit(Number(count.cnt) - maxSnaps)
      .select('id');
    if (oldest.length) {
      await db('security_snapshots').whereIn('id', oldest.map((r) => r.id)).delete();
    }
  }

  return typeof result === 'object' ? result.id : result;
}

export async function getSnapshots(guildId, limit = 10) {
  const rows = await db('security_snapshots')
    .where({ guild_id: guildId })
    .orderBy('timestamp', 'desc')
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    trigger: r.trigger,
    rolesData: typeof r.roles_data === 'string' ? JSON.parse(r.roles_data) : r.roles_data,
    channelsData: typeof r.channels_data === 'string' ? JSON.parse(r.channels_data) : r.channels_data,
    serverData: typeof r.server_data === 'string' ? JSON.parse(r.server_data) : r.server_data,
    timestamp: Number(r.timestamp),
  }));
}

export async function getSnapshotById(guildId, id) {
  const row = await db('security_snapshots').where({ guild_id: guildId, id }).first();
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    trigger: row.trigger,
    rolesData: typeof row.roles_data === 'string' ? JSON.parse(row.roles_data) : row.roles_data,
    channelsData: typeof row.channels_data === 'string' ? JSON.parse(row.channels_data) : row.channels_data,
    serverData: typeof row.server_data === 'string' ? JSON.parse(row.server_data) : row.server_data,
    timestamp: Number(row.timestamp),
  };
}

// ═══════════════════════════════════════════════════
//  SECURITY: USER SCORES
// ═══════════════════════════════════════════════════

const scoreCache = new Map();

export function getUserScores(guildId, userId) {
  const key = `score:${guildId}:${userId}`;
  if (scoreCache.has(key)) return scoreCache.get(key);
  const def = { raidScore: 0, riskScore: 0, trustScore: 50 };
  scoreCache.set(key, def);
  return def;
}

export function updateUserScores(guildId, userId, updates) {
  const key = `score:${guildId}:${userId}`;
  const current = getUserScores(guildId, userId);
  const merged = {
    raidScore: clampScore(updates.raidScore ?? current.raidScore),
    riskScore: clampScore(updates.riskScore ?? current.riskScore),
    trustScore: clampScore(updates.trustScore ?? current.trustScore),
  };
  scoreCache.set(key, merged);

  if (db) {
    db('user_scores')
      .insert({
        guild_id: guildId,
        user_id: userId,
        raid_score: merged.raidScore,
        risk_score: merged.riskScore,
        trust_score: merged.trustScore,
        updated_at: Date.now(),
      })
      .onConflict(['guild_id', 'user_id'])
      .merge()
      .catch((err) => logger.error('updateUserScores persist', err));
  }

  return merged;
}

function clampScore(v) {
  return Math.max(0, Math.min(100, Math.floor(Number(v) || 0)));
}

// ═══════════════════════════════════════════════════
//  SECURITY: QUARANTINE
// ═══════════════════════════════════════════════════

export async function quarantineUser(guildId, userId, reason, quarantinedBy, previousRoles, expiresAt) {
  await db('quarantine')
    .insert({
      guild_id: guildId,
      user_id: userId,
      reason: reason || '',
      quarantined_by: quarantinedBy || null,
      previous_roles: JSON.stringify(previousRoles || []),
      quarantined_at: Date.now(),
      expires_at: expiresAt || null,
    })
    .onConflict(['guild_id', 'user_id'])
    .merge();
}

export async function unquarantineUser(guildId, userId) {
  const row = await db('quarantine').where({ guild_id: guildId, user_id: userId }).first();
  if (!row) return null;
  const previousRoles = typeof row.previous_roles === 'string' ? JSON.parse(row.previous_roles) : row.previous_roles;
  await db('quarantine').where({ guild_id: guildId, user_id: userId }).delete();
  return { reason: row.reason, previousRoles, quarantinedAt: Number(row.quarantined_at) };
}

export async function getQuarantinedUsers(guildId) {
  const rows = await db('quarantine').where({ guild_id: guildId });
  return rows.map((r) => ({
    userId: r.user_id,
    reason: r.reason,
    quarantinedBy: r.quarantined_by,
    previousRoles: typeof r.previous_roles === 'string' ? JSON.parse(r.previous_roles) : r.previous_roles,
    quarantinedAt: Number(r.quarantined_at),
    expiresAt: r.expires_at ? Number(r.expires_at) : null,
  }));
}

export async function isQuarantined(guildId, userId) {
  const row = await db('quarantine').where({ guild_id: guildId, user_id: userId }).first();
  return !!row;
}

// ═══════════════════════════════════════════════════
//  SECURITY: LOCKDOWN STATE
// ═══════════════════════════════════════════════════

export async function getLockdownState(guildId) {
  const row = await db('lockdown_state').where({ guild_id: guildId }).first();
  if (!row) return { state: 'normal', reason: '', activatedBy: null, activatedAt: null, expiresAt: null, previousOverwrites: {} };
  return {
    state: row.state,
    reason: row.reason,
    activatedBy: row.activated_by,
    activatedAt: row.activated_at ? Number(row.activated_at) : null,
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
    previousOverwrites: typeof row.previous_overwrites === 'string' ? JSON.parse(row.previous_overwrites) : row.previous_overwrites,
  };
}

export async function setLockdownState(guildId, state, reason, activatedBy, expiresAt, previousOverwrites) {
  await db('lockdown_state')
    .insert({
      guild_id: guildId,
      state,
      reason: reason || '',
      activated_by: activatedBy || null,
      activated_at: Date.now(),
      expires_at: expiresAt || null,
      previous_overwrites: JSON.stringify(previousOverwrites || {}),
    })
    .onConflict('guild_id')
    .merge();
}

// ═══════════════════════════════════════════════════
//  SECURITY: ACTION LOG
// ═══════════════════════════════════════════════════

export async function logAction(guildId, staffId, action, targetId, reason, extra) {
  await db('action_log').insert({
    guild_id: guildId,
    staff_id: staffId,
    action,
    target_id: targetId || null,
    reason: reason || '',
    extra: JSON.stringify(extra || {}),
    timestamp: Date.now(),
  });
}

export async function getActionLog(guildId, { limit = 20, staffId = null } = {}) {
  let query = db('action_log').where({ guild_id: guildId }).orderBy('timestamp', 'desc').limit(limit);
  if (staffId) query = query.where({ staff_id: staffId });
  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    action: r.action,
    targetId: r.target_id,
    reason: r.reason,
    extra: typeof r.extra === 'string' ? JSON.parse(r.extra) : r.extra,
    timestamp: Number(r.timestamp),
  }));
}

// ═══════════════════════════════════════════════════
//  LEADERBOARD HELPERS
// ═══════════════════════════════════════════════════

export async function getEconomyLeaderboard(guildId, limit = 10) {
  const rows = await db('economy')
    .where({ guild_id: guildId })
    .orderByRaw('(balance + bank) DESC')
    .limit(limit);
  return rows.map((r) => ({
    userId: r.user_id,
    balance: Number(r.balance),
    bank: Number(r.bank),
    total: Number(r.balance) + Number(r.bank),
  }));
}

export async function getLevelLeaderboard(guildId, limit = 10) {
  const rows = await db('levels')
    .where({ guild_id: guildId })
    .orderBy('level', 'desc')
    .orderBy('xp', 'desc')
    .limit(limit);
  return rows.map((r) => ({
    userId: r.user_id,
    level: r.level,
    xp: r.xp,
  }));
}

// ═══════════════════════════════════════════════════
//  MODERATION: CASES
// ═══════════════════════════════════════════════════

export async function createCase(guildId, { type, targetId, moderatorId, reason, extra }) {
  const [result] = await db('cases')
    .insert({
      guild_id: guildId,
      type,
      target_id: targetId,
      moderator_id: moderatorId,
      reason: (reason || '').slice(0, 400),
      extra: JSON.stringify(extra || {}),
      created_at: Date.now(),
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getCase(guildId, caseId) {
  const row = await db('cases').where({ guild_id: guildId, id: caseId }).first();
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    type: row.type,
    targetId: row.target_id,
    moderatorId: row.moderator_id,
    reason: row.reason,
    extra: typeof row.extra === 'string' ? JSON.parse(row.extra) : row.extra,
    createdAt: Number(row.created_at),
    updatedAt: row.updated_at ? Number(row.updated_at) : null,
    updatedBy: row.updated_by,
    active: row.active,
  };
}

export async function updateCase(guildId, caseId, updates, updatedBy) {
  const dbUpdate = { updated_at: Date.now(), updated_by: updatedBy };
  if (updates.reason !== undefined) dbUpdate.reason = updates.reason.slice(0, 400);
  if (updates.active !== undefined) dbUpdate.active = updates.active;
  if (updates.extra !== undefined) dbUpdate.extra = JSON.stringify(updates.extra);
  await db('cases').where({ guild_id: guildId, id: caseId }).update(dbUpdate);
}

export async function getCasesByUser(guildId, userId, { limit = 20, type = null } = {}) {
  let query = db('cases').where({ guild_id: guildId, target_id: userId }).orderBy('created_at', 'desc').limit(limit);
  if (type) query = query.where({ type });
  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    moderatorId: r.moderator_id,
    reason: r.reason,
    extra: typeof r.extra === 'string' ? JSON.parse(r.extra) : r.extra,
    createdAt: Number(r.created_at),
    active: r.active,
  }));
}

export async function searchCases(guildId, { type, limit = 20, offset = 0, activeOnly = false } = {}) {
  let query = db('cases').where({ guild_id: guildId }).orderBy('created_at', 'desc').limit(limit).offset(offset);
  if (type) query = query.where({ type });
  if (activeOnly) query = query.where({ active: true });
  const rows = await query;
  const [{ count }] = await db('cases')
    .where({ guild_id: guildId })
    .where(type ? { type } : {})
    .count('id as count');
  return {
    cases: rows.map((r) => ({
      id: r.id,
      type: r.type,
      targetId: r.target_id,
      moderatorId: r.moderator_id,
      reason: r.reason,
      extra: typeof r.extra === 'string' ? JSON.parse(r.extra) : r.extra,
      createdAt: Number(r.created_at),
      active: r.active,
    })),
    total: Number(count),
  };
}

// ═══════════════════════════════════════════════════
//  MODERATION: MOD NOTES
// ═══════════════════════════════════════════════════

export async function addModNote(guildId, userId, authorId, content, category = 'general') {
  const [result] = await db('mod_notes')
    .insert({
      guild_id: guildId,
      user_id: userId,
      author_id: authorId,
      content: content.slice(0, 2000),
      category,
      created_at: Date.now(),
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getModNotes(guildId, userId, { limit = 20 } = {}) {
  const rows = await db('mod_notes')
    .where({ guild_id: guildId, user_id: userId })
    .orderBy('created_at', 'desc')
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    content: r.content,
    category: r.category,
    createdAt: Number(r.created_at),
  }));
}

export async function deleteModNote(guildId, noteId) {
  return db('mod_notes').where({ guild_id: guildId, id: noteId }).delete();
}

export async function updateModNote(guildId, noteId, content) {
  return db('mod_notes')
    .where({ guild_id: guildId, id: noteId })
    .update({ content: content.slice(0, 2000), updated_at: Date.now() });
}

// ═══════════════════════════════════════════════════
//  MODERATION: AUTOMOD FILTERS
// ═══════════════════════════════════════════════════

export async function addAutomodFilter(guildId, type, pattern, { addedBy, action = 'delete', caseSensitive = false } = {}) {
  const [result] = await db('automod_filters')
    .insert({
      guild_id: guildId,
      type,
      pattern: pattern.slice(0, 500),
      added_by: addedBy || null,
      action,
      case_sensitive: caseSensitive,
      created_at: Date.now(),
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function removeAutomodFilter(guildId, filterId) {
  return db('automod_filters').where({ guild_id: guildId, id: filterId }).delete();
}

export async function getAutomodFilters(guildId, type = null) {
  let query = db('automod_filters').where({ guild_id: guildId }).orderBy('created_at', 'asc');
  if (type) query = query.where({ type });
  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    pattern: r.pattern,
    addedBy: r.added_by,
    action: r.action,
    caseSensitive: r.case_sensitive,
    createdAt: Number(r.created_at),
  }));
}

// ═══════════════════════════════════════════════════
//  MODERATION: PUNISHMENT RULES
// ═══════════════════════════════════════════════════

export async function addPunishmentRule(guildId, pointsThreshold, action, { duration, actionOrder = 0, createdBy } = {}) {
  const [result] = await db('punishment_rules')
    .insert({
      guild_id: guildId,
      points_threshold: pointsThreshold,
      action,
      duration: duration || null,
      action_order: actionOrder,
      created_at: Date.now(),
      created_by: createdBy || null,
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getPunishmentRules(guildId) {
  const rows = await db('punishment_rules')
    .where({ guild_id: guildId })
    .orderBy('action_order', 'asc')
    .orderBy('points_threshold', 'asc');
  return rows.map((r) => ({
    id: r.id,
    pointsThreshold: r.points_threshold,
    action: r.action,
    duration: r.duration,
    actionOrder: r.action_order,
  }));
}

export async function deletePunishmentRule(guildId, ruleId) {
  return db('punishment_rules').where({ guild_id: guildId, id: ruleId }).delete();
}

// ═══════════════════════════════════════════════════
//  MODERATION: TEMP BANS
// ═══════════════════════════════════════════════════

export async function addTempBan(guildId, userId, bannedBy, reason, expiresAt, caseId) {
  await db('temp_bans')
    .insert({
      guild_id: guildId,
      user_id: userId,
      banned_by: bannedBy,
      reason: (reason || '').slice(0, 400),
      banned_at: Date.now(),
      expires_at: expiresAt,
      case_id: caseId || null,
    })
    .onConflict(['guild_id', 'user_id'])
    .merge();
}

export async function getTempBans(guildId) {
  const rows = await db('temp_bans').where({ guild_id: guildId, resolved: false });
  return rows.map((r) => ({
    userId: r.user_id,
    bannedBy: r.banned_by,
    reason: r.reason,
    bannedAt: Number(r.banned_at),
    expiresAt: Number(r.expires_at),
    caseId: r.case_id,
  }));
}

export async function resolveTempBan(guildId, userId) {
  await db('temp_bans').where({ guild_id: guildId, user_id: userId }).update({ resolved: true });
}

export async function getExpiredTempBans() {
  const now = Date.now();
  const rows = await db('temp_bans').where('expires_at', '<=', now).where({ resolved: false });
  return rows.map((r) => ({
    guildId: r.guild_id,
    userId: r.user_id,
    reason: r.reason,
  }));
}

// ═══════════════════════════════════════════════════
//  MODERATION: TEMP ROLES
// ═══════════════════════════════════════════════════

export async function addTempRole(guildId, userId, roleId, givenBy, expiresAt) {
  const [result] = await db('temp_roles')
    .insert({
      guild_id: guildId,
      user_id: userId,
      role_id: roleId,
      given_by: givenBy,
      given_at: Date.now(),
      expires_at: expiresAt,
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getTempRoles(guildId, userId) {
  const rows = await db('temp_roles').where({ guild_id: guildId, user_id: userId, resolved: false });
  return rows.map((r) => ({
    id: r.id,
    roleId: r.role_id,
    givenBy: r.given_by,
    givenAt: Number(r.given_at),
    expiresAt: Number(r.expires_at),
  }));
}

export async function resolveTempRole(id) {
  await db('temp_roles').where({ id }).update({ resolved: true });
}

export async function getExpiredTempRoles() {
  const now = Date.now();
  const rows = await db('temp_roles').where('expires_at', '<=', now).where({ resolved: false });
  return rows.map((r) => ({
    id: r.id,
    guildId: r.guild_id,
    userId: r.user_id,
    roleId: r.role_id,
  }));
}

// ═══════════════════════════════════════════════════
//  MODERATION: BAN APPEALS
// ═══════════════════════════════════════════════════

export async function createBanAppeal(guildId, userId, reason, caseId) {
  const [result] = await db('ban_appeals')
    .insert({
      guild_id: guildId,
      user_id: userId,
      case_id: caseId || null,
      reason: reason.slice(0, 2000),
      created_at: Date.now(),
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getBanAppeals(guildId, { status = null, limit = 20 } = {}) {
  let query = db('ban_appeals').where({ guild_id: guildId }).orderBy('created_at', 'desc').limit(limit);
  if (status) query = query.where({ status });
  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    caseId: r.case_id,
    reason: r.reason,
    status: r.status,
    reviewedBy: r.reviewed_by,
    reviewNote: r.review_note,
    createdAt: Number(r.created_at),
    reviewedAt: r.reviewed_at ? Number(r.reviewed_at) : null,
  }));
}

export async function reviewBanAppeal(guildId, appealId, status, reviewedBy, reviewNote) {
  await db('ban_appeals')
    .where({ guild_id: guildId, id: appealId })
    .update({
      status,
      reviewed_by: reviewedBy,
      review_note: (reviewNote || '').slice(0, 2000),
      reviewed_at: Date.now(),
    });
}

// ═══════════════════════════════════════════════════
//  MODERATION: MOD QUEUE
// ═══════════════════════════════════════════════════

export async function addToModQueue(guildId, type, { targetId, reporterId, details } = {}) {
  const [result] = await db('mod_queue')
    .insert({
      guild_id: guildId,
      type,
      target_id: targetId || null,
      reporter_id: reporterId || null,
      details: JSON.stringify(details || {}),
      created_at: Date.now(),
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getModQueue(guildId, { status = 'pending', limit = 20 } = {}) {
  let query = db('mod_queue').where({ guild_id: guildId }).orderBy('created_at', 'desc').limit(limit);
  if (status) query = query.where({ status });
  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    targetId: r.target_id,
    reporterId: r.reporter_id,
    details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
    status: r.status,
    resolvedBy: r.resolved_by,
    resolutionNote: r.resolution_note,
    createdAt: Number(r.created_at),
  }));
}

export async function resolveModQueueItem(guildId, itemId, status, resolvedBy, resolutionNote) {
  await db('mod_queue')
    .where({ guild_id: guildId, id: itemId })
    .update({
      status,
      resolved_by: resolvedBy,
      resolution_note: (resolutionNote || '').slice(0, 2000),
      resolved_at: Date.now(),
    });
}

// ═══════════════════════════════════════════════════
//  MODERATION: JAIL
// ═══════════════════════════════════════════════════

export async function jailUser(guildId, userId, reason, jailedBy, previousRoles, caseId, channelId, expiresAt) {
  await db('jail')
    .insert({
      guild_id: guildId,
      user_id: userId,
      reason: (reason || '').slice(0, 400),
      jailed_by: jailedBy || null,
      previous_roles: JSON.stringify(previousRoles || []),
      jailed_at: Date.now(),
      case_id: caseId || null,
      channel_id: channelId || null,
      expires_at: expiresAt || null,
    })
    .onConflict(['guild_id', 'user_id'])
    .merge();
}

export async function unjailUser(guildId, userId) {
  const row = await db('jail').where({ guild_id: guildId, user_id: userId }).first();
  if (!row) return null;
  const previousRoles = typeof row.previous_roles === 'string' ? JSON.parse(row.previous_roles) : row.previous_roles;
  const channelId = row.channel_id;
  await db('jail').where({ guild_id: guildId, user_id: userId }).delete();
  return { reason: row.reason, previousRoles, channelId: channelId ? String(channelId) : null, jailedAt: Number(row.jailed_at) };
}

export async function getJailedUsers(guildId) {
  const rows = await db('jail').where({ guild_id: guildId });
  return rows.map((r) => ({
    userId: r.user_id,
    reason: r.reason,
    jailedBy: r.jailed_by,
    previousRoles: typeof r.previous_roles === 'string' ? JSON.parse(r.previous_roles) : r.previous_roles,
    jailedAt: Number(r.jailed_at),
    expiresAt: r.expires_at ? Number(r.expires_at) : null,
    channelId: r.channel_id ? String(r.channel_id) : null,
  }));
}

export async function isJailed(guildId, userId) {
  const row = await db('jail').where({ guild_id: guildId, user_id: userId }).first();
  return !!row;
}

// ═══════════════════════════════════════════════════
//  MODERATION: COMPREHENSIVE MOD LOGS
// ═══════════════════════════════════════════════════

export async function logModEvent(guildId, category, action, { userId, targetId, details } = {}) {
  await db('mod_logs').insert({
    guild_id: guildId,
    category,
    action,
    user_id: userId || null,
    target_id: targetId || null,
    details: JSON.stringify(details || {}),
    timestamp: Date.now(),
  });
}

export async function getModLogs(guildId, { category, userId, limit = 20 } = {}) {
  let query = db('mod_logs').where({ guild_id: guildId }).orderBy('timestamp', 'desc').limit(limit);
  if (category) query = query.where({ category });
  if (userId) query = query.where({ user_id: userId });
  const rows = await query;
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    action: r.action,
    userId: r.user_id,
    targetId: r.target_id,
    details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
    timestamp: Number(r.timestamp),
  }));
}

export async function getModLogStats(guildId) {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const [totalAll] = await db('mod_logs').where({ guild_id: guildId }).count('id as count');
  const [total24h] = await db('mod_logs').where({ guild_id: guildId }).where('timestamp', '>=', dayAgo).count('id as count');
  const [total7d] = await db('mod_logs').where({ guild_id: guildId }).where('timestamp', '>=', weekAgo).count('id as count');

  const byCategory = await db('mod_logs')
    .where({ guild_id: guildId })
    .where('timestamp', '>=', weekAgo)
    .groupBy('category')
    .select('category')
    .count('id as count');

  return {
    total: Number(totalAll.count),
    last24h: Number(total24h.count),
    last7d: Number(total7d.count),
    byCategory: byCategory.reduce((acc, r) => { acc[r.category] = Number(r.count); return acc; }, {}),
  };
}

// ═══════════════════════════════════════════════════
//  MODERATION: ENHANCED WARNINGS
// ═══════════════════════════════════════════════════

export async function addWarningEnhanced(guildId, userId, modId, reason, { points = 1, expiresAt, caseId } = {}) {
  const now = Date.now();
  const [result] = await db('warnings')
    .insert({
      guild_id: guildId,
      user_id: userId,
      mod_id: modId,
      reason: String(reason).slice(0, 400),
      date: now,
      points,
      expires_at: expiresAt || null,
      case_id: caseId || null,
    })
    .returning('id');
  return { id: typeof result === 'object' ? result.id : result, modId, reason: String(reason).slice(0, 400), date: now, points };
}

export async function getActiveWarningPoints(guildId, userId) {
  const now = Date.now();
  const rows = await db('warnings')
    .where({ guild_id: guildId, user_id: userId, expired: false })
    .where((qb) => {
      qb.whereNull('expires_at').orWhere('expires_at', '>', now);
    });
  return rows.reduce((sum, r) => sum + (r.points || 1), 0);
}

export async function expireWarnings(guildId) {
  const now = Date.now();
  await db('warnings')
    .where({ guild_id: guildId, expired: false })
    .whereNotNull('expires_at')
    .where('expires_at', '<=', now)
    .update({ expired: true });
}

// ═══════════════════════════════════════════════════
//  TICKETS: CORE
// ═══════════════════════════════════════════════════

export async function createTicket(guildId, ownerId, channelId, category, subject) {
  const now = Date.now();
  const [result] = await db('tickets')
    .insert({
      guild_id: guildId,
      channel_id: channelId,
      owner_id: ownerId,
      category: category || 'general',
      subject: (subject || '').slice(0, 200),
      status: 'open',
      created_at: now,
      last_activity: now,
      participants: JSON.stringify([ownerId]),
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getTicketByChannel(channelId) {
  const row = await db('tickets').where({ channel_id: channelId }).first();
  if (!row) return null;
  return formatTicket(row);
}

export async function getTicketById(ticketId) {
  const row = await db('tickets').where({ id: ticketId }).first();
  if (!row) return null;
  return formatTicket(row);
}

export async function getOpenTicketsByUser(guildId, userId) {
  const rows = await db('tickets')
    .where({ guild_id: guildId, owner_id: userId })
    .whereIn('status', ['open', 'claimed'])
    .orderBy('created_at', 'desc');
  return rows.map(formatTicket);
}

export async function getOpenTickets(guildId) {
  const rows = await db('tickets')
    .where({ guild_id: guildId })
    .whereIn('status', ['open', 'claimed'])
    .orderBy('created_at', 'asc');
  return rows.map(formatTicket);
}

export async function getClosedTickets(guildId, { limit = 20 } = {}) {
  const rows = await db('tickets')
    .where({ guild_id: guildId, status: 'closed' })
    .orderBy('closed_at', 'desc')
    .limit(limit);
  return rows.map(formatTicket);
}

export async function claimTicket(ticketId, staffId) {
  await db('tickets').where({ id: ticketId }).update({
    claimed_by: staffId,
    status: 'claimed',
    claimed_at: Date.now(),
  });
}

export async function transferTicket(ticketId, newStaffId) {
  await db('tickets').where({ id: ticketId }).update({
    claimed_by: newStaffId,
    status: 'claimed',
    claimed_at: Date.now(),
  });
}

export async function closeTicket(ticketId, closedBy, reason) {
  await db('tickets').where({ id: ticketId }).update({
    status: 'closed',
    close_reason: (reason || '').slice(0, 400),
    closed_by: closedBy,
    closed_at: Date.now(),
  });
}

export async function updateTicketActivity(ticketId) {
  await db('tickets').where({ id: ticketId }).update({ last_activity: Date.now() });
}

export async function addTicketParticipant(ticketId, userId) {
  const row = await db('tickets').where({ id: ticketId }).first();
  if (!row) return;
  const participants = typeof row.participants === 'string' ? JSON.parse(row.participants) : (row.participants || []);
  if (!participants.includes(userId)) {
    participants.push(userId);
    await db('tickets').where({ id: ticketId }).update({ participants: JSON.stringify(participants) });
  }
}

export async function updateTicketChannel(ticketId, newChannelId) {
  await db('tickets').where({ id: ticketId }).update({ channel_id: newChannelId });
}

export async function getInactiveTickets(guildId, inactiveMs) {
  const cutoff = Date.now() - inactiveMs;
  const rows = await db('tickets')
    .where({ guild_id: guildId })
    .whereIn('status', ['open', 'claimed'])
    .where('last_activity', '<', cutoff);
  return rows.map(formatTicket);
}

function formatTicket(r) {
  return {
    id: r.id,
    guildId: r.guild_id,
    channelId: r.channel_id,
    ownerId: r.owner_id,
    claimedBy: r.claimed_by,
    category: r.category,
    subject: r.subject,
    status: r.status,
    closeReason: r.close_reason,
    closedBy: r.closed_by,
    createdAt: Number(r.created_at),
    claimedAt: r.claimed_at ? Number(r.claimed_at) : null,
    closedAt: r.closed_at ? Number(r.closed_at) : null,
    lastActivity: Number(r.last_activity),
    participants: typeof r.participants === 'string' ? JSON.parse(r.participants) : (r.participants || []),
  };
}

// ═══════════════════════════════════════════════════
//  TICKETS: MESSAGES (TRANSCRIPT)
// ═══════════════════════════════════════════════════

export async function saveTicketMessage(ticketId, userId, username, content, attachments, isBot) {
  await db('ticket_messages').insert({
    ticket_id: ticketId,
    user_id: userId,
    username: (username || 'Unknown').slice(0, 64),
    content: (content || '').slice(0, 4000),
    attachments: JSON.stringify(attachments || []),
    sent_at: Date.now(),
    is_bot: !!isBot,
  });
}

export async function getTicketMessages(ticketId) {
  const rows = await db('ticket_messages')
    .where({ ticket_id: ticketId })
    .orderBy('sent_at', 'asc');
  return rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    content: r.content,
    attachments: typeof r.attachments === 'string' ? JSON.parse(r.attachments) : (r.attachments || []),
    sentAt: Number(r.sent_at),
    isBot: r.is_bot,
  }));
}

// ═══════════════════════════════════════════════════
//  TICKETS: NOTES
// ═══════════════════════════════════════════════════

export async function addTicketNote(ticketId, authorId, content) {
  const [result] = await db('ticket_notes')
    .insert({
      ticket_id: ticketId,
      author_id: authorId,
      content: content.slice(0, 2000),
      created_at: Date.now(),
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getTicketNotes(ticketId) {
  const rows = await db('ticket_notes')
    .where({ ticket_id: ticketId })
    .orderBy('created_at', 'asc');
  return rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    content: r.content,
    createdAt: Number(r.created_at),
  }));
}

// ═══════════════════════════════════════════════════
//  TICKETS: PANELS
// ═══════════════════════════════════════════════════

export async function createTicketPanel(guildId, channelId, options) {
  const [result] = await db('ticket_panels')
    .insert({
      guild_id: guildId,
      channel_id: channelId,
      title: (options.title || 'Contact Support').slice(0, 100),
      description: (options.description || '').slice(0, 2000),
      categories: JSON.stringify(options.categories || []),
      parent_category: options.parentCategory || null,
      transcript_channel: options.transcriptChannel || null,
      max_open: options.maxOpen || 5,
      created_at: Date.now(),
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getTicketPanel(messageId) {
  const row = await db('ticket_panels').where({ message_id: messageId }).first();
  if (!row) return null;
  return formatPanel(row);
}

export async function updatePanelMessageId(panelId, messageId) {
  await db('ticket_panels').where({ id: panelId }).update({ message_id: messageId });
}

export async function getGuildPanels(guildId) {
  const rows = await db('ticket_panels').where({ guild_id: guildId });
  return rows.map(formatPanel);
}

export async function deleteTicketPanel(panelId) {
  await db('ticket_panels').where({ id: panelId }).delete();
}

function formatPanel(r) {
  return {
    id: r.id,
    guildId: r.guild_id,
    channelId: r.channel_id,
    messageId: r.message_id,
    title: r.title,
    description: r.description,
    categories: typeof r.categories === 'string' ? JSON.parse(r.categories) : (r.categories || []),
    parentCategory: r.parent_category,
    transcriptChannel: r.transcript_channel,
    maxOpen: r.max_open,
  };
}

// ═══════════════════════════════════════════════════
//  TICKETS: FEEDBACK
// ═══════════════════════════════════════════════════

export async function addTicketFeedback(ticketId, guildId, userId, rating, comment, claimedBy) {
  const [result] = await db('ticket_feedback')
    .insert({
      ticket_id: ticketId,
      guild_id: guildId,
      user_id: userId,
      rating,
      comment: (comment || '').slice(0, 1000),
      claimed_by: claimedBy || null,
      created_at: Date.now(),
    })
    .returning('id');
  return typeof result === 'object' ? result.id : result;
}

export async function getTicketFeedback(ticketId) {
  const row = await db('ticket_feedback').where({ ticket_id: ticketId }).first();
  if (!row) return null;
  return { rating: row.rating, comment: row.comment, claimedBy: row.claimed_by };
}

export async function getStaffFeedbackStats(guildId, staffId) {
  const rows = await db('ticket_feedback').where({ guild_id: guildId, claimed_by: staffId });
  if (!rows.length) return null;
  const avg = rows.reduce((sum, r) => sum + r.rating, 0) / rows.length;
  return { count: rows.length, avgRating: Math.round(avg * 10) / 10 };
}

// ═══════════════════════════════════════════════════
//  TICKETS: STAFF STATS
// ═══════════════════════════════════════════════════

export async function incrementStaffClaimed(guildId, staffId) {
  await db('ticket_staff_stats')
    .insert({ guild_id: guildId, staff_id: staffId, tickets_claimed: 1, updated_at: Date.now() })
    .onConflict(['guild_id', 'staff_id'])
    .merge({ tickets_claimed: db.raw('tickets_claimed + 1'), updated_at: Date.now() });
}

export async function incrementStaffClosed(guildId, staffId) {
  await db('ticket_staff_stats')
    .insert({ guild_id: guildId, staff_id: staffId, tickets_closed: 1, updated_at: Date.now() })
    .onConflict(['guild_id', 'staff_id'])
    .merge({ tickets_closed: db.raw('tickets_closed + 1'), updated_at: Date.now() });
}

export async function recordStaffResponseTime(guildId, staffId, responseMs) {
  await db('ticket_staff_stats')
    .insert({
      guild_id: guildId,
      staff_id: staffId,
      total_response_ms: responseMs,
      response_count: 1,
      updated_at: Date.now(),
    })
    .onConflict(['guild_id', 'staff_id'])
    .merge({
      total_response_ms: db.raw(`total_response_ms + ${responseMs}`),
      response_count: db.raw('response_count + 1'),
      updated_at: Date.now(),
    });
}

export async function getStaffStats(guildId) {
  const rows = await db('ticket_staff_stats').where({ guild_id: guildId });
  return rows.map((r) => ({
    staffId: r.staff_id,
    ticketsClaimed: r.tickets_claimed,
    ticketsClosed: r.tickets_closed,
    avgResponseMs: r.response_count > 0 ? Math.round(Number(r.total_response_ms) / r.response_count) : null,
  }));
}

export async function getStaffStatsForUser(guildId, staffId) {
  const row = await db('ticket_staff_stats').where({ guild_id: guildId, staff_id: staffId }).first();
  if (!row) return null;
  return {
    ticketsClaimed: row.tickets_claimed,
    ticketsClosed: row.tickets_closed,
    avgResponseMs: row.response_count > 0 ? Math.round(Number(row.total_response_ms) / row.response_count) : null,
  };
}

export { withLock };

// ═══════════════════════════════════════════════════
//  COMMUNITY — Giveaways
// ═══════════════════════════════════════════════════

export async function createGiveaway(guildId, channelId, hostId, prize, winnersCount, endsAt, requirements = {}) {
  const [row] = await db('giveaways')
    .insert({
      guild_id: guildId,
      channel_id: channelId,
      host_id: hostId,
      prize,
      winners_count: winnersCount,
      ends_at: endsAt,
      requirements: JSON.stringify(requirements),
      created_at: Date.now(),
    })
    .returning('*');
  return row.id;
}

export async function getGiveaway(id) {
  const row = await db('giveaways').where({ id }).first();
  if (!row) return null;
  return { ...row, winners: row.winners || [], entries: row.entries || [], requirements: row.requirements || {} };
}

export async function getGiveawayByMessage(messageId) {
  const row = await db('giveaways').where({ message_id: messageId }).first();
  if (!row) return null;
  return { ...row, winners: row.winners || [], entries: row.entries || [], requirements: row.requirements || {} };
}

export async function getActiveGiveaways(guildId) {
  const rows = await db('giveaways').where({ guild_id: guildId, ended: false }).orderBy('ends_at');
  return rows.map((r) => ({ ...r, winners: r.winners || [], entries: r.entries || [], requirements: r.requirements || {} }));
}

export async function getExpiredGiveaways() {
  const now = Date.now();
  const rows = await db('giveaways').where('ended', false).andWhere('ends_at', '<=', now);
  return rows.map((r) => ({ ...r, winners: r.winners || [], entries: r.entries || [], requirements: r.requirements || {} }));
}

export async function updateGiveawayMessage(id, messageId) {
  await db('giveaways').where({ id }).update({ message_id: messageId });
}

export async function addGiveawayEntry(id, userId) {
  const gw = await getGiveaway(id);
  if (!gw) return;
  const entries = gw.entries || [];
  if (entries.includes(userId)) return;
  entries.push(userId);
  await db('giveaways').where({ id }).update({ entries: JSON.stringify(entries) });
}

export async function removeGiveawayEntry(id, userId) {
  const gw = await getGiveaway(id);
  if (!gw) return;
  const entries = (gw.entries || []).filter((e) => e !== userId);
  await db('giveaways').where({ id }).update({ entries: JSON.stringify(entries) });
}

export async function endGiveaway(id, winners) {
  await db('giveaways').where({ id }).update({ ended: true, winners: JSON.stringify(winners) });
}

export async function updateGiveaway(id, updates) {
  const allowed = {};
  if (updates.prize !== undefined) allowed.prize = updates.prize;
  if (updates.winnersCount !== undefined) allowed.winners_count = updates.winnersCount;
  if (updates.endsAt !== undefined) allowed.ends_at = updates.endsAt;
  if (updates.requirements !== undefined) allowed.requirements = JSON.stringify(updates.requirements);
  if (Object.keys(allowed).length) {
    await db('giveaways').where({ id }).update(allowed);
  }
}

// ═══════════════════════════════════════════════════
//  COMMUNITY — Reaction Roles
// ═══════════════════════════════════════════════════

export async function addReactionRole(guildId, channelId, messageId, emoji, roleId, addedBy) {
  await db('reaction_roles')
    .insert({
      guild_id: guildId,
      channel_id: channelId,
      message_id: messageId,
      emoji,
      role_id: roleId,
      added_by: addedBy,
      created_at: Date.now(),
    })
    .onConflict(['message_id', 'emoji'])
    .merge();
}

export async function removeReactionRole(messageId, emoji) {
  await db('reaction_roles').where({ message_id: messageId, emoji }).del();
}

export async function getReactionRolesForMessage(messageId) {
  return db('reaction_roles').where({ message_id: messageId });
}

export async function getReactionRolesForGuild(guildId) {
  return db('reaction_roles').where({ guild_id: guildId });
}

// ═══════════════════════════════════════════════════
//  COMMUNITY — Starboard
// ═══════════════════════════════════════════════════

export async function getStarboardEntry(guildId, originalMessageId) {
  return db('starboard').where({ guild_id: guildId, original_message_id: originalMessageId }).first();
}

export async function upsertStarboardEntry(guildId, originalMessageId, channelId, authorId, starCount) {
  const existing = await getStarboardEntry(guildId, originalMessageId);
  if (existing) {
    await db('starboard').where({ id: existing.id }).update({ star_count: starCount });
    return existing;
  }
  const [row] = await db('starboard')
    .insert({
      guild_id: guildId,
      original_message_id: originalMessageId,
      channel_id: channelId,
      author_id: authorId,
      star_count: starCount,
      starred_at: Date.now(),
    })
    .returning('*');
  return row;
}

export async function updateStarboardMessageId(id, starboardMessageId) {
  await db('starboard').where({ id }).update({ starboard_message_id: starboardMessageId });
}

export async function updateStarCount(id, starCount) {
  await db('starboard').where({ id }).update({ star_count: starCount });
}

export async function getTopStarred(guildId, limit = 10) {
  return db('starboard').where({ guild_id: guildId }).orderBy('star_count', 'desc').limit(limit);
}

// ═══════════════════════════════════════════════════
//  COMMUNITY — Suggestions
// ═══════════════════════════════════════════════════

export async function createSuggestion(guildId, userId, title, description) {
  const [row] = await db('suggestions')
    .insert({ guild_id: guildId, user_id: userId, title, description, created_at: Date.now() })
    .returning('*');
  return row.id;
}

export async function getSuggestion(id) {
  return db('suggestions').where({ id }).first();
}

export async function updateSuggestionMessage(id, messageId) {
  await db('suggestions').where({ id }).update({ message_id: messageId });
}

export async function updateSuggestionVotes(id, upvotes, downvotes) {
  await db('suggestions').where({ id }).update({ upvotes, downvotes });
}

export async function updateSuggestionStatus(id, status, resolvedBy, note) {
  await db('suggestions').where({ id }).update({
    status,
    resolved_by: resolvedBy,
    resolution_note: note || null,
    resolved_at: Date.now(),
  });
}

export async function getGuildSuggestions(guildId, status, limit = 20) {
  const query = db('suggestions').where({ guild_id: guildId });
  if (status) query.andWhere({ status });
  return query.orderBy('created_at', 'desc').limit(limit);
}

// ═══════════════════════════════════════════════════
//  COMMUNITY — Birthdays
// ═══════════════════════════════════════════════════

export async function setBirthday(guildId, userId, month, day, timezone = 'UTC') {
  await db('birthdays')
    .insert({ guild_id: guildId, user_id: userId, month, day, timezone })
    .onConflict(['guild_id', 'user_id'])
    .merge();
}

export async function getBirthday(guildId, userId) {
  return db('birthdays').where({ guild_id: guildId, user_id: userId }).first();
}

export async function getTodayBirthdays(guildId) {
  const now = new Date();
  return db('birthdays').where({ guild_id: guildId, month: now.getMonth() + 1, day: now.getDate() });
}

export async function getUpcomingBirthdays(guildId, days = 30) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return db('birthdays')
    .where({ guild_id: guildId })
    .andWhereRaw(
      `CASE
        WHEN month > ? OR (month = ? AND day >= ?) THEN (month - ?) * 31 + (day - ?)
        ELSE (12 - ? + month) * 31 + (day - ?)
      END <= ?`,
      [month, month, day, month, day, month, day, days],
    )
    .orderBy('month')
    .orderBy('day')
    .limit(50);
}

export async function markBirthdayCelebrated(guildId, userId) {
  await db('birthdays').where({ guild_id: guildId, user_id: userId }).update({ last_celebrated: Date.now() });
}

// ═══════════════════════════════════════════════════
//  COMMUNITY — Announcements
// ═══════════════════════════════════════════════════

export async function createAnnouncement(guildId, channelId, content, scheduledAt, createdBy) {
  const [row] = await db('announcements')
    .insert({
      guild_id: guildId,
      channel_id: channelId,
      content,
      scheduled_at: scheduledAt,
      created_by: createdBy,
      created_at: Date.now(),
    })
    .returning('*');
  return row.id;
}

export async function getPendingAnnouncements() {
  const now = Date.now();
  return db('announcements').where('sent', false).andWhere('scheduled_at', '<=', now);
}

export async function markAnnouncementSent(id) {
  await db('announcements').where({ id }).update({ sent: true });
}

export async function getGuildAnnouncements(guildId, limit = 10) {
  return db('announcements').where({ guild_id: guildId }).orderBy('scheduled_at', 'desc').limit(limit);
}

// ═══════════════════════════════════════════════════
//  COMMUNITY — Counting Game
// ═══════════════════════════════════════════════════

export async function getCountingState(guildId, channelId) {
  return db('counting').where({ guild_id: guildId, channel_id: channelId }).first();
}

export async function setupCounting(guildId, channelId) {
  await db('counting')
    .insert({ guild_id: guildId, channel_id: channelId, current_number: 0, record: 0 })
    .onConflict(['guild_id', 'channel_id'])
    .merge({ current_number: 0, last_counter_id: null, record: 0 });
}

export async function updateCountingState(guildId, channelId, currentNumber, lastCounterId) {
  const record = currentNumber;
  await db('counting')
    .where({ guild_id: guildId, channel_id: channelId })
    .update({
      current_number: currentNumber,
      last_counter_id: lastCounterId,
      record: db.raw('CASE WHEN ? > record THEN ? ELSE record END', [record, record]),
    });
}

export async function resetCounting(guildId, channelId) {
  await db('counting').where({ guild_id: guildId, channel_id: channelId }).update({ current_number: 0, last_counter_id: null });
}

export async function getCountingLeaderboard(guildId) {
  return db('counting').where({ guild_id: guildId }).orderBy('record', 'desc');
}

// ═══════════════════════════════════════════════════
//  COMMUNITY — Word Chain Game
// ═══════════════════════════════════════════════════

export async function getWordChainState(guildId, channelId) {
  return db('word_chain').where({ guild_id: guildId, channel_id: channelId }).first();
}

export async function setupWordChain(guildId, channelId) {
  await db('word_chain')
    .insert({ guild_id: guildId, channel_id: channelId, chain_length: 0, record: 0 })
    .onConflict(['guild_id', 'channel_id'])
    .merge({ last_word: null, last_user_id: null, chain_length: 0, record: 0 });
}

export async function updateWordChainState(guildId, channelId, lastWord, lastUserId, chainLength) {
  await db('word_chain')
    .where({ guild_id: guildId, channel_id: channelId })
    .update({
      last_word: lastWord,
      last_user_id: lastUserId,
      chain_length: chainLength,
      record: db.raw('CASE WHEN ? > record THEN ? ELSE record END', [chainLength, chainLength]),
    });
}

export async function resetWordChain(guildId, channelId) {
  await db('word_chain')
    .where({ guild_id: guildId, channel_id: channelId })
    .update({ last_word: null, last_user_id: null, chain_length: 0 });
}

export async function getWordChainLeaderboard(guildId) {
  return db('word_chain').where({ guild_id: guildId }).orderBy('record', 'desc');
}
