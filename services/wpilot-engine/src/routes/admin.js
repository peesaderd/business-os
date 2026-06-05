/**
 * Admin Routes — จัดการลูกค้า แผน ระบบ
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { addJob, getQueueStatus } = require('../queue');

const router = express.Router();

// Auth middleware (simple API key check)
router.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    // Allow if from localhost
    if (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1') {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ── Dashboard ──
router.get('/dashboard', async (req, res) => {
  const stats = db.getDashboardStats();
  const queueStats = await getQueueStatus().catch(() => ({}));
  res.json({ ...stats, queue: queueStats });
});

// ── Customers ──
router.get('/customers', (req, res) => {
  res.json(db.getCustomers());
});

router.get('/customers/:id', (req, res) => {
  const customer = db.getCustomer(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });
  res.json(customer);
});

router.post('/customers', (req, res) => {
  const { name, siteUrl, wpApiKey, plan } = req.body;
  if (!name || !siteUrl) return res.status(400).json({ error: 'name and siteUrl required' });

  const id = `cust-${uuidv4().slice(0, 8)}`;
  const apiKey = `wpi_${uuidv4().replace(/-/g, '').slice(0, 30)}`;
  db.addCustomer({ id, name, siteUrl, wpApiKey: wpApiKey || apiKey, plan: plan || 'solo' });
  res.json({ id, apiKey: wpApiKey || apiKey });
});

router.put('/customers/:id', (req, res) => {
  const { name, siteUrl, wpApiKey, plan } = req.body;
  const customer = db.getCustomer(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });

  const updates = {};
  if (name) updates.name = name;
  if (siteUrl) updates.site_url = siteUrl;
  if (wpApiKey) updates.wp_api_key = wpApiKey;
  if (plan) updates.plan = plan;

  if (Object.keys(updates).length > 0) {
    db.updateCustomer(req.params.id, updates);
  }
  res.json({ updated: true });
});

router.delete('/customers/:id', (req, res) => {
  db.deleteCustomer(req.params.id);
  res.json({ deleted: true });
});

// ── Jobs ──
router.get('/jobs', (req, res) => {
  const { customerId, limit } = req.query;
  res.json(db.getJobs(customerId, parseInt(limit) || 50));
});

router.post('/jobs', async (req, res) => {
  const { customerId, type, payload } = req.body;
  if (!customerId || !type) return res.status(400).json({ error: 'customerId and type required' });

  const customer = db.getCustomer(customerId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const id = `job-${uuidv4().slice(0, 8)}`;
  db.createJob({ id, customerId, type, payload: payload || {} });

  await addJob({ id, type, customerId, payload: { customerId, ...(payload || {}) } });
  res.json({ id, status: 'queued' });
});

// Trigger test job for demo customer
router.post('/jobs/test-auto-update', async (req, res) => {
  const customer = db.getCustomer('demo-001');
  if (!customer) return res.status(404).json({ error: 'Demo customer not found' });

  const id = `job-${uuidv4().slice(0, 8)}`;
  db.createJob({ id, customerId: 'demo-001', type: 'auto-update', payload: { type: 'core' } });
  await addJob({ id, type: 'auto-update', customerId: 'demo-001', payload: { customerId: 'demo-001', type: 'core' } });
  res.json({ id, status: 'queued', message: 'Auto-update test job queued' });
});

router.post('/jobs/test-content', async (req, res) => {
  const customer = db.getCustomer('demo-001');
  if (!customer) return res.status(404).json({ error: 'Demo customer not found' });

  const topic = req.body.topic || 'ประโยชน์ของ AI ในการทำธุรกิจออนไลน์';
  const id = `job-${uuidv4().slice(0, 8)}`;
  db.createJob({ id, customerId: 'demo-001', type: 'content-gen', payload: { topic, tone: 'professional', featuredImage: true } });
  await addJob({ id, type: 'content-gen', customerId: 'demo-001', payload: { customerId: 'demo-001', topic, tone: 'professional', featuredImage: true } });
  res.json({ id, status: 'queued', message: `Content generation queued: "${topic}"` });
});

// ── Logs ──
router.get('/logs', (req, res) => {
  const { customerId, limit } = req.query;
  res.json(db.getLogs(customerId, parseInt(limit) || 50));
});

// ── Plans ──
router.get('/plans', (req, res) => {
  res.json(db.db.prepare('SELECT * FROM plans').all());
});

// ── Stats ──
router.get('/stats', (req, res) => {
  res.json(db.db.prepare(`
    SELECT plan, COUNT(*) as count FROM customers WHERE status = 'active' GROUP BY plan
  `).all());
});

module.exports = router;
