const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure data directory exists
const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.db.path);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');

// ── Schema ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    site_url    TEXT NOT NULL,
    wp_api_key  TEXT NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'solo',
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    type        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    payload     TEXT,
    result      TEXT,
    error       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    started_at  TEXT,
    completed_at TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,
    level       TEXT NOT NULL DEFAULT 'info',
    message     TEXT NOT NULL,
    metadata    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plans (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    price_monthly REAL NOT NULL,
    max_sites   INTEGER NOT NULL DEFAULT 1,
    ai_content_limit INTEGER NOT NULL DEFAULT 0,
    ai_image_limit  INTEGER NOT NULL DEFAULT 0,
    ai_video_limit  INTEGER NOT NULL DEFAULT 0,
    features    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Seed default plans ──────────────────────────────
const planCount = db.prepare('SELECT COUNT(*) as c FROM plans').get().c;
if (planCount === 0) {
  const insert = db.prepare(`INSERT INTO plans 
    (id, name, price_monthly, max_sites, ai_content_limit, ai_image_limit, ai_video_limit, features)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  insert.run('solo', 'Solo', 19, 1, 20, 50, 0, 
    JSON.stringify(['auto-update', 'dashboard']));
  insert.run('business', 'Business', 79, 5, 200, 500, 20,
    JSON.stringify(['auto-update', 'rollback', 'ai-content', 'ai-image', 'ai-video', 'erp-sync', 'priority-support']));
  insert.run('agency', 'Agency', 199, 25, 999999, 999999, 999999,
    JSON.stringify(['unlimited', 'white-label', 'api-access', 'webhook', 'multi-user', 'dedicated-support']));
}

// ── Seed demo customer ──────────────────────────────
const customerCount = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
if (customerCount === 0) {
  const cfg = config.defaultCustomer;
  db.prepare(`INSERT INTO customers (id, name, site_url, wp_api_key, plan)
    VALUES (?, ?, ?, ?, ?)`)
    .run('demo-001', 'Demo Site', cfg.siteUrl, cfg.apiKey, 'business');
}

// ── Exported helpers ────────────────────────────────
module.exports = {
  db,

  // Customers
  getCustomers() {
    return db.prepare('SELECT * FROM customers WHERE status = ?').all('active');
  },
  getCustomer(id) {
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  },
  addCustomer({ id, name, siteUrl, wpApiKey, plan }) {
    db.prepare(`INSERT INTO customers (id, name, site_url, wp_api_key, plan)
      VALUES (?, ?, ?, ?, ?)`).run(id, name, siteUrl, wpApiKey, plan);
  },
  updateCustomer(id, fields) {
    const keys = Object.keys(fields);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id);
    db.prepare(`UPDATE customers SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  },
  deleteCustomer(id) {
    db.prepare("UPDATE customers SET status = 'inactive' WHERE id = ?").run(id);
  },

  // Jobs
  createJob({ id, customerId, type, payload }) {
    db.prepare(`INSERT INTO jobs (id, customer_id, type, status, payload)
      VALUES (?, ?, ?, 'pending', ?)`).run(id, customerId, type, JSON.stringify(payload));
  },
  getJobs(customerId, limit = 50) {
    if (customerId) {
      return db.prepare('SELECT * FROM jobs WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?').all(customerId, limit);
    }
    return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit);
  },
  getPendingJobs() {
    return db.prepare("SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100").all();
  },
  updateJobStatus(id, status, result, error) {
    const fields = { status };
    if (result) fields.result = JSON.stringify(result);
    if (error) fields.error = error;
    if (status === 'running') fields.started_at = "datetime('now')";
    if (['completed', 'failed'].includes(status)) fields.completed_at = "datetime('now')";

    const sets = Object.keys(fields).map(k => `${k} = ${fields[k] === "datetime('now')" ? "datetime('now')" : '?'}`).join(', ');
    const values = Object.values(fields).filter(v => v !== "datetime('now')");

    // Simpler approach
    if (status === 'running') {
      db.prepare("UPDATE jobs SET status = ?, started_at = datetime('now') WHERE id = ?").run(status, id);
    } else if (status === 'completed') {
      db.prepare("UPDATE jobs SET status = ?, result = ?, completed_at = datetime('now') WHERE id = ?").run(status, JSON.stringify(result), id);
    } else if (status === 'failed') {
      db.prepare("UPDATE jobs SET status = ?, error = ?, completed_at = datetime('now') WHERE id = ?").run(status, error, id);
    }
  },
  getJobStats() {
    return db.prepare(`
      SELECT status, COUNT(*) as count FROM jobs GROUP BY status
    `).all();
  },

  // Logs
  addLog({ customerId, level, message, metadata }) {
    db.prepare(`INSERT INTO logs (customer_id, level, message, metadata)
      VALUES (?, ?, ?, ?)`).run(customerId, level, message, JSON.stringify(metadata || {}));
  },
  getLogs(customerId, limit = 50) {
    if (customerId) {
      return db.prepare('SELECT * FROM logs WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?').all(customerId, limit);
    }
    return db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?').all(limit);
  },
  getDashboardStats() {
    return {
      totalCustomers: db.prepare("SELECT COUNT(*) as c FROM customers WHERE status = 'active'").get().c,
      totalJobs: db.prepare("SELECT COUNT(*) as c FROM jobs").get().c,
      pendingJobs: db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'pending'").get().c,
      failedJobs: db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'failed'").get().c,
      recentLogs: db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT 10').all(),
    };
  },
};
