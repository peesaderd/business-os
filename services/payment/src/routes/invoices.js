/**
 * Invoice Routes — ดูใบแจ้งหนี้
 */
const express = require('express');
const stripeClient = require('../services/stripe-client');
const db = require('../db');

const router = express.Router();

// ── GET: Invoice list ──
router.get('/', (req, res) => {
  const { customerId, limit } = req.query;
  res.json(db.listInvoices(customerId, parseInt(limit) || 50));
});

// ── GET: Single invoice ──
router.get('/:id', (req, res) => {
  const invoice = db.db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});

// ── GET: Upcoming invoice (from Stripe) ──
router.get('/upcoming/:customerId', async (req, res) => {
  try {
    const customer = db.getCustomer(req.params.customerId);
    if (!customer?.stripe_customer_id) {
      return res.json({ amount: 0, status: 'no_customer' });
    }

    const stripe = require('stripe')(require('../config').stripe.secretKey);
    const upcoming = await stripe.invoices.retrieveUpcoming({
      customer: customer.stripe_customer_id,
    });

    res.json({
      amount: upcoming.total / 100,
      currency: upcoming.currency,
      date: new Date(upcoming.next_payment_attempt * 1000 || upcoming.created * 1000),
      lines: upcoming.lines.data.map(l => ({
        description: l.description,
        amount: l.amount / 100,
        period: { start: new Date(l.period.start * 1000), end: new Date(l.period.end * 1000) },
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
