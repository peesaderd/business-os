/**
 * Payment Module — Database Schema
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.db.path);
db.pragma('journal_mode = WAL');

db.exec(`
  -- Customers linked to Stripe
  CREATE TABLE IF NOT EXISTS customers (
    id              TEXT PRIMARY KEY,          -- wpilot customer id
    email           TEXT NOT NULL,
    name            TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan_id         TEXT NOT NULL DEFAULT 'solo',
    status          TEXT NOT NULL DEFAULT 'active',  -- active, inactive, past_due, cancelled
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Subscriptions
  CREATE TABLE IF NOT EXISTS subscriptions (
    id              TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL,
    plan_id         TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE,
    status          TEXT NOT NULL DEFAULT 'incomplete',  -- incomplete, active, past_due, canceled, unpaid
    current_period_start TEXT,
    current_period_end   TEXT,
    cancel_at_period_end INTEGER DEFAULT 0,
    trial_end       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  -- Invoices
  CREATE TABLE IF NOT EXISTS invoices (
    id              TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL,
    subscription_id TEXT,
    stripe_invoice_id TEXT UNIQUE,
    stripe_payment_intent TEXT,
    amount          REAL NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'usd',
    status          TEXT NOT NULL DEFAULT 'draft',  -- draft, open, paid, void, uncollectible
    invoice_url     TEXT,
    paid_at         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  -- Payment Methods
  CREATE TABLE IF NOT EXISTS payment_methods (
    id              TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL,
    stripe_pm_id    TEXT UNIQUE,
    type            TEXT NOT NULL,  -- card, promptpay, etc.
    last4           TEXT,
    brand           TEXT,
    exp_month       INTEGER,
    exp_year        INTEGER,
    is_default      INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  -- Usage Records (metered billing)
  CREATE TABLE IF NOT EXISTS usage_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     TEXT NOT NULL,
    metric          TEXT NOT NULL,  -- ai_content, ai_image, ai_video, api_call
    quantity        INTEGER NOT NULL DEFAULT 1,
    recorded_at     TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );
`);

// ── Helpers ──

module.exports = {
  // Customers
  getCustomer(id) {
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  },
  getCustomerByEmail(email) {
    return db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
  },
  getCustomerByStripeId(stripeCustomerId) {
    return db.prepare('SELECT * FROM customers WHERE stripe_customer_id = ?').get(stripeCustomerId);
  },
  upsertCustomer({ id, email, name, stripeCustomerId, planId }) {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (existing) {
      db.prepare(`UPDATE customers SET email=?, name=?, stripe_customer_id=COALESCE(?,stripe_customer_id), plan_id=COALESCE(?,plan_id), updated_at=datetime('now') WHERE id=?`)
        .run(email, name || id, stripeCustomerId, planId, id);
    } else {
      db.prepare('INSERT INTO customers (id, email, name, stripe_customer_id, plan_id) VALUES (?,?,?,?,?)')
        .run(id, email, name || id, stripeCustomerId, planId || 'solo');
    }
    return this.getCustomer(id);
  },
  listCustomers() {
    return db.prepare("SELECT * FROM customers WHERE status = 'active'").all();
  },

  // Subscriptions
  getSubscription(id) {
    return db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
  },
  getSubscriptionByStripeId(stripeSubId) {
    return db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSubId);
  },
  getActiveSubscription(customerId) {
    return db.prepare("SELECT * FROM subscriptions WHERE customer_id = ? AND status IN ('active','past_due') ORDER BY created_at DESC LIMIT 1").get(customerId);
  },
  upsertSubscription({ id, customerId, planId, stripeSubId, status, periodStart, periodEnd, cancelAtPeriodEnd }) {
    const existing = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
    if (existing) {
      db.prepare(`UPDATE subscriptions SET plan_id=?, status=?, current_period_start=?, current_period_end=?, cancel_at_period_end=?, updated_at=datetime('now') WHERE id=?`)
        .run(planId, status, periodStart, periodEnd, cancelAtPeriodEnd ? 1 : 0, id);
    } else {
      db.prepare('INSERT INTO subscriptions (id, customer_id, plan_id, stripe_subscription_id, status, current_period_start, current_period_end) VALUES (?,?,?,?,?,?,?)')
        .run(id, customerId, planId, stripeSubId, status, periodStart, periodEnd);
    }
    return this.getSubscription(id);
  },
  listSubscriptions(customerId) {
    if (customerId) return db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
    return db.prepare('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 100').all();
  },

  // Invoices
  upsertInvoice({ id, customerId, subscriptionId, stripeInvoiceId, stripePaymentIntent, amount, currency, status, invoiceUrl, paidAt }) {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (existing) {
      db.prepare(`UPDATE invoices SET status=?, invoice_url=COALESCE(?,invoice_url), paid_at=?, stripe_payment_intent=COALESCE(?,stripe_payment_intent) WHERE id=?`)
        .run(status, invoiceUrl, paidAt, stripePaymentIntent, id);
    } else {
      db.prepare('INSERT INTO invoices (id, customer_id, subscription_id, stripe_invoice_id, stripe_payment_intent, amount, currency, status, invoice_url, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, customerId, subscriptionId, stripeInvoiceId, stripePaymentIntent, amount, currency, status, invoiceUrl, paidAt);
    }
    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  },
  listInvoices(customerId, limit = 50) {
    if (customerId) return db.prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?').all(customerId, limit);
    return db.prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?').all(limit);
  },

  // Usage
  recordUsage({ customerId, metric, quantity }) {
    db.prepare('INSERT INTO usage_records (customer_id, metric, quantity) VALUES (?,?,?)').run(customerId, metric, quantity);
  },
  getUsage(customerId, metric, since) {
    if (metric) {
      return db.prepare("SELECT SUM(quantity) as total FROM usage_records WHERE customer_id=? AND metric=? AND recorded_at >= ?").get(customerId, metric, since);
    }
    return db.prepare("SELECT metric, SUM(quantity) as total FROM usage_records WHERE customer_id=? AND recorded_at >= ? GROUP BY metric").all(customerId, since);
  },
  getUsageThisMonth(customerId) {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    return this.getUsage(customerId, null, firstOfMonth.toISOString());
  },

  // Dashboard Stats
  getDashboardStats() {
    return {
      totalCustomers: db.prepare("SELECT COUNT(*) as c FROM customers WHERE status='active'").get().c,
      activeSubscriptions: db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status='active'").get().c,
      totalRevenue: db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoices WHERE status='paid'").get().total,
      invoicesThisMonth: db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status='paid' AND created_at >= date('now','start of month')").get().c,
    };
  },

  db,
};
