/**
 * WPilot Engine — Main Entry Point
 * Multi-tenant WordPress AI Auto-Pilot Engine
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const { startWorkers } = require('./workers');
const adminRoutes = require('./routes/admin');
const db = require('./db');

const app = express();

// ── Middleware ──
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// ── Health Check ──
app.get('/api/wpilot/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    customers: db.getCustomers().length,
    uptime: process.uptime(),
  });
});

// ── Admin API ──
app.use('/api/wpilot/admin', adminRoutes);

// ── Public: Job status by ID ──
app.get('/api/wpilot/jobs/:id', (req, res) => {
  const job = db.db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ── Start ──
async function main() {
  // Start Express
  app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║         WPilot Engine v1.0                  ║
║  Port: ${config.port}                               ║
║  Redis: ${config.redis.host}:${config.redis.port}                   ║
║  Customers: ${db.getCustomers().length}                            ║
╚══════════════════════════════════════════════╝
    `);
  });

  // Start Workers
  startWorkers();
}

main().catch(console.error);

// ── Graceful Shutdown ──
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});
