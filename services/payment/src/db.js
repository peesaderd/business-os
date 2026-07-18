/**
 * Payment Module — Database Schema
 * Uses sql.js (pure JS SQLite via WebAssembly — no native compilation)
 */
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let SQL = null;
let db = null;
let initialized = false;

async function initDb() {
  if (initialized) return;

  SQL = await initSqlJs();

  const dbDir = path.dirname(config.db.path);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  if (fs.existsSync(config.db.path)) {
    const buffer = fs.readFileSync(config.db.path);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  saveDb();
  initialized = true;
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(config.db.path, Buffer.from(data));
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id              TEXT PRIMARY KEY,
      email           TEXT NOT NULL,
      name            TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan_id         TEXT NOT NULL DEFAULT 'solo',
      status          TEXT NOT NULL DEFAULT 'active',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id              TEXT PRIMARY KEY,
      customer_id     TEXT NOT NULL,
      plan_id         TEXT NOT NULL,
      stripe_subscription_id TEXT UNIQUE,
      status          TEXT NOT NULL DEFAULT 'incomplete',
      current_period_start TEXT,
      current_period_end   TEXT,
      cancel_at_period_end INTEGER DEFAULT 0,
      trial_end       TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id              TEXT PRIMARY KEY,
      customer_id     TEXT NOT NULL,
      subscription_id TEXT,
      stripe_invoice_id TEXT UNIQUE,
      stripe_payment_intent TEXT,
      amount          REAL NOT NULL,
      currency        TEXT NOT NULL DEFAULT 'usd',
      status          TEXT NOT NULL DEFAULT 'draft',
      invoice_url     TEXT,
      paid_at         TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id              TEXT PRIMARY KEY,
      customer_id     TEXT NOT NULL,
      stripe_pm_id    TEXT UNIQUE,
      type            TEXT NOT NULL,
      last4           TEXT,
      brand           TEXT,
      exp_month       INTEGER,
      exp_year        INTEGER,
      is_default      INTEGER DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id     TEXT NOT NULL,
      metric          TEXT NOT NULL,
      quantity        INTEGER NOT NULL DEFAULT 1,
      recorded_at     TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS qr_payments (
      id              TEXT PRIMARY KEY,
      customer_id     TEXT NOT NULL,
      customer_name   TEXT,
      amount          REAL NOT NULL,
      plan_id         TEXT,
      promptpay_number TEXT,
      payment_ref     TEXT,
      bank_ref        TEXT,
      callback_url    TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',
      paid_at         TEXT,
      expires_at      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Payment logs (for notifier)
    CREATE TABLE IF NOT EXISTS payment_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id     TEXT NOT NULL,
      level           TEXT NOT NULL DEFAULT 'info',
      message         TEXT,
      metadata        TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Internal helpers ──

function getRow(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function exec(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// ── Raw DB shim (better-sqlite3 compatible) ──
// Used internally by routes that access db.db directly
const rawDb = {
  prepare(sql) {
    return {
      get(...params) { return getRow(sql, params.length > 0 ? params : []); },
      all(...params) { return getAll(sql, params.length > 0 ? params : []); },
      run(...params) { exec(sql, params.length > 0 ? params : []); },
    };
  },
  exec(sql) { db.run(sql); saveDb(); },
};

// ── Export ──

module.exports = {
  init: initDb,
  db: rawDb,

  // ── Customers ──
  getCustomer(id) {
    return getRow('SELECT * FROM customers WHERE id = ?', [id]);
  },
  getCustomerByEmail(email) {
    return getRow('SELECT * FROM customers WHERE email = ?', [email]);
  },
  getCustomerByStripeId(stripeCustomerId) {
    return getRow('SELECT * FROM customers WHERE stripe_customer_id = ?', [stripeCustomerId]);
  },
  upsertCustomer({ id, email, name, stripeCustomerId, planId }) {
    const existing = getRow('SELECT * FROM customers WHERE id = ?', [id]);
    if (existing) {
      exec(
        `UPDATE customers SET email=?, name=?, stripe_customer_id=COALESCE(?,stripe_customer_id), plan_id=COALESCE(?,plan_id), updated_at=datetime('now') WHERE id=?`,
        [email, name || id, stripeCustomerId, planId, id]
      );
    } else {
      exec(
        'INSERT INTO customers (id, email, name, stripe_customer_id, plan_id) VALUES (?,?,?,?,?)',
        [id, email, name || id, stripeCustomerId, planId || 'solo']
      );
    }
    return this.getCustomer(id);
  },
  listCustomers() {
    return getAll("SELECT * FROM customers WHERE status = 'active'");
  },

  // ── Subscriptions ──
  getSubscription(id) {
    return getRow('SELECT * FROM subscriptions WHERE id = ?', [id]);
  },
  getSubscriptionByStripeId(stripeSubId) {
    return getRow('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?', [stripeSubId]);
  },
  getActiveSubscription(customerId) {
    return getRow(
      "SELECT * FROM subscriptions WHERE customer_id = ? AND status IN ('active','past_due') ORDER BY created_at DESC LIMIT 1",
      [customerId]
    );
  },
  upsertSubscription({ id, customerId, planId, stripeSubId, status, periodStart, periodEnd, cancelAtPeriodEnd }) {
    const existing = getRow('SELECT * FROM subscriptions WHERE id = ?', [id]);
    if (existing) {
      exec(
        `UPDATE subscriptions SET plan_id=?, status=?, current_period_start=?, current_period_end=?, cancel_at_period_end=?, updated_at=datetime('now') WHERE id=?`,
        [planId, status, periodStart, periodEnd, cancelAtPeriodEnd ? 1 : 0, id]
      );
    } else {
      exec(
        'INSERT INTO subscriptions (id, customer_id, plan_id, stripe_subscription_id, status, current_period_start, current_period_end) VALUES (?,?,?,?,?,?,?)',
        [id, customerId, planId, stripeSubId, status, periodStart, periodEnd]
      );
    }
    return this.getSubscription(id);
  },
  listSubscriptions(customerId) {
    if (customerId) {
      return getAll('SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC', [customerId]);
    }
    return getAll('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 100');
  },

  // ── Invoices ──
  upsertInvoice({ id, customerId, subscriptionId, stripeInvoiceId, stripePaymentIntent, amount, currency, status, invoiceUrl, paidAt }) {
    const existing = getRow('SELECT * FROM invoices WHERE id = ?', [id]);
    if (existing) {
      exec(
        `UPDATE invoices SET status=?, invoice_url=COALESCE(?,invoice_url), paid_at=?, stripe_payment_intent=COALESCE(?,stripe_payment_intent) WHERE id=?`,
        [status, invoiceUrl, paidAt, stripePaymentIntent, id]
      );
    } else {
      exec(
        'INSERT INTO invoices (id, customer_id, subscription_id, stripe_invoice_id, stripe_payment_intent, amount, currency, status, invoice_url, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, customerId, subscriptionId, stripeInvoiceId, stripePaymentIntent, amount, currency, status, invoiceUrl, paidAt]
      );
    }
    return getRow('SELECT * FROM invoices WHERE id = ?', [id]);
  },
  listInvoices(customerId, limit = 50) {
    if (customerId) {
      return getAll('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?', [customerId, limit]);
    }
    return getAll('SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?', [limit]);
  },

  // ── Usage ──
  recordUsage({ customerId, metric, quantity }) {
    exec('INSERT INTO usage_records (customer_id, metric, quantity) VALUES (?,?,?)', [customerId, metric, quantity]);
  },
  getUsage(customerId, metric, since) {
    if (metric) {
      return getRow(
        "SELECT SUM(quantity) as total FROM usage_records WHERE customer_id=? AND metric=? AND recorded_at >= ?",
        [customerId, metric, since]
      );
    }
    return getAll(
      "SELECT metric, SUM(quantity) as total FROM usage_records WHERE customer_id=? AND recorded_at >= ? GROUP BY metric",
      [customerId, since]
    );
  },
  getUsageThisMonth(customerId) {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    return this.getUsage(customerId, null, firstOfMonth.toISOString());
  },

  // ── Logs ──
  addLog({ customerId, level, message, metadata }) {
    exec('INSERT INTO payment_logs (customer_id, level, message, metadata) VALUES (?,?,?,?)',
      [customerId, level, message, JSON.stringify(metadata || {})]);
  },

  // ── Dashboard Stats ──
  getDashboardStats() {
    const totalCustomers = getRow("SELECT COUNT(*) as c FROM customers WHERE status='active'").c;
    const activeSubscriptions = getRow("SELECT COUNT(*) as c FROM subscriptions WHERE status='active'").c;
    const totalRevenue = getRow("SELECT COALESCE(SUM(amount),0) as total FROM invoices WHERE status='paid'").total;
    const invoicesThisMonth = getRow("SELECT COUNT(*) as c FROM invoices WHERE status='paid' AND created_at >= date('now','start of month')").c;
    return { totalCustomers, activeSubscriptions, totalRevenue, invoicesThisMonth };
  },
};
