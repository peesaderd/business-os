/**
 * Subscription Routes — จัดการ Subscriptions
 */
const express = require('express');
const stripeClient = require('../services/stripe-client');
const db = require('../db');
const config = require('../config');

const router = express.Router();

// ── GET: List plans ──
router.get('/plans', (req, res) => {
  res.json(config.plans);
});

// ── GET: My subscription ──
router.get('/:customerId', (req, res) => {
  const sub = db.getActiveSubscription(req.params.customerId);
  if (!sub) return res.json({ status: 'none' });
  res.json(sub);
});

// ── GET: All subscriptions ──
router.get('/', (req, res) => {
  const { customerId } = req.query;
  res.json(db.listSubscriptions(customerId));
});

// ── PUT: Change plan ──
router.put('/:customerId/change', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });

    const plan = config.plans.find(p => p.id === planId);
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    const customer = db.getCustomer(req.params.customerId);
    if (!customer?.stripe_customer_id) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const activeSub = db.getActiveSubscription(req.params.customerId);
    if (!activeSub?.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    // Update in Stripe
    const updated = await stripeClient.updateSubscription(activeSub.stripe_subscription_id, {
      priceId: plan.stripePriceId,
      metadata: { plan_id: planId },
    });

    // Update local DB
    db.upsertSubscription({
      ...activeSub,
      planId,
      status: 'active',
    });

    // Update WPilot
    const erpBridge = require('../services/erp-bridge');
    await erpBridge.updateWpilotPlan({ customerId: req.params.customerId, planId });

    res.json({ success: true, planId, nextBillingDate: new Date(updated.current_period_end * 1000) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST: Cancel subscription ──
router.post('/:customerId/cancel', async (req, res) => {
  try {
    const { atPeriodEnd } = req.body;
    const cancelAtEnd = atPeriodEnd !== false;

    const customer = db.getCustomer(req.params.customerId);
    if (!customer?.stripe_customer_id) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const activeSub = db.getActiveSubscription(req.params.customerId);
    if (!activeSub?.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    await stripeClient.cancelSubscription(activeSub.stripe_subscription_id, cancelAtEnd);

    if (cancelAtEnd) {
      db.upsertSubscription({ ...activeSub, cancelAtPeriodEnd: true });
    } else {
      db.upsertSubscription({ ...activeSub, status: 'canceled' });
      db.db.prepare("UPDATE customers SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(req.params.customerId);
    }

    res.json({ success: true, cancelAtPeriodEnd: cancelAtEnd });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
