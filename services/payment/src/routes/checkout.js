/**
 * Checkout Routes — Stripe Checkout Session
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const stripeClient = require('../services/stripe-client');
const db = require('../db');
const config = require('../config');

const router = express.Router();

// ── GET: Stripe Publishable Key ──
router.get('/config', (req, res) => {
  res.json({
    publishableKey: config.stripe.publishableKey,
    plans: config.plans,
  });
});

// ── POST: Create Checkout Session ──
router.post('/create-session', async (req, res) => {
  try {
    const { customerId, customerEmail, planId, successUrl, cancelUrl } = req.body;

    if (!customerId || !customerEmail || !planId) {
      return res.status(400).json({ error: 'customerId, customerEmail, planId required' });
    }

    // Validate plan
    const plan = config.plans.find(p => p.id === planId);
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    // Get or create Stripe customer
    let customer = db.getCustomer(customerId);
    let stripeCustomerId = customer?.stripe_customer_id;

    if (!stripeCustomerId) {
      const stripeCustomer = await stripeClient.createCustomer({
        email: customerEmail,
        name: customerId,
        metadata: { wpilot_id: customerId },
      });
      stripeCustomerId = stripeCustomer.id;

      // Save customer
      db.upsertCustomer({
        id: customerId,
        email: customerEmail,
        stripeCustomerId,
        planId,
      });
    }

    // Create checkout session
    const session = await stripeClient.createCheckoutSession({
      customerId,
      stripeCustomerId,
      priceId: plan.stripePriceId,
      successUrl: successUrl || 'https://wpilot.ai/billing/success',
      cancelUrl: cancelUrl || 'https://wpilot.ai/billing',
      metadata: { customer_id: customerId, plan_id: planId },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    console.error('[payment] Checkout error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST: Create Portal Session ──
router.post('/portal', async (req, res) => {
  try {
    const { customerId, returnUrl } = req.body;
    if (!customerId) return res.status(400).json({ error: 'customerId required' });

    const customer = db.getCustomer(customerId);
    if (!customer?.stripe_customer_id) {
      return res.status(404).json({ error: 'Customer not found in Stripe' });
    }

    const session = await stripeClient.createPortalSession(
      customer.stripe_customer_id,
      returnUrl || 'https://wpilot.ai/billing'
    );

    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST: Setup Products in Stripe (admin) ──
router.post('/setup-products', async (req, res) => {
  try {
    const results = await stripeClient.setupProducts();
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
