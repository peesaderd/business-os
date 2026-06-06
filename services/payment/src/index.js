/**
 * Business OS — Payment Module
 * Stripe subscription + invoice management
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const db = require('./db');

const app = express();

// CORS + logging
app.use(cors());
app.use(morgan('dev'));

// JSON parser (except for webhook raw body)
app.use((req, res, next) => {
  if (req.path === '/api/payment/webhook/stripe') return next();
  express.json({ limit: '10mb' })(req, res, next);
});

// ── Routes ──
app.use('/api/payment/checkout', require('./routes/checkout'));
app.use('/api/payment/webhook', require('./routes/webhook'));
app.use('/api/payment/subscriptions', require('./routes/subscriptions'));
app.use('/api/payment/invoices', require('./routes/invoices'));
app.use('/api/payment/qr', require('./routes/qr-payment'));

// ── Health ──
app.get('/api/payment/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    mode: config.stripe.secretKey.startsWith('sk_test') ? 'test' : 'live',
    customers: db.listCustomers().length,
  });
});

// ── Admin Dashboard ──
app.get('/api/payment/admin/stats', (req, res) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== config.adminApiKey) {
    // allow localhost
    if (req.ip !== '127.0.0.1' && req.ip !== '::1' && !req.ip?.startsWith('::ffff:127.0.0.1')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  res.json(db.getDashboardStats());
});

// ── Start ──
app.listen(config.port, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║    Business OS — Payment Module v1.0        ║
║  Port: ${config.port}                               ║
║  Mode: ${config.stripe.secretKey.startsWith('sk_test') ? 'TEST' : 'LIVE'}                                ║
║  Plans: ${config.plans.length} (${config.plans.map(p => p.id).join(', ')})             ║
║  Customers: ${db.listCustomers().length}                            ║
╚══════════════════════════════════════════════╝
  `);
});
