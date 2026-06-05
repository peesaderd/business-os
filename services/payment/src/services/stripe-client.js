/**
 * Stripe Client — Stripe API wrapper
 */
const Stripe = require('stripe');
const config = require('../config');

let stripe = null;
function getStripe() {
  if (!stripe) {
    stripe = new Stripe(config.stripe.secretKey);
  }
  return stripe;
}

module.exports = {
  // ── Customer ──
  async createCustomer({ email, name, metadata }) {
    return getStripe().customers.create({ email, name, metadata });
  },

  async getCustomer(stripeCustomerId) {
    return getStripe().customers.retrieve(stripeCustomerId);
  },

  // ── Checkout Session ──
  async createCheckoutSession({ customerId, stripeCustomerId, priceId, successUrl, cancelUrl, metadata }) {
    return getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl || 'https://wpilot.ai/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'https://wpilot.ai/billing',
      metadata: { ...metadata, customer_id: customerId },
      subscription_data: {
        metadata: { ...metadata, customer_id: customerId },
      },
    });
  },

  // ── Subscription ──
  async getSubscription(stripeSubId) {
    return getStripe().subscriptions.retrieve(stripeSubId);
  },

  async cancelSubscription(stripeSubId, atPeriodEnd = true) {
    return getStripe().subscriptions.update(stripeSubId, {
      cancel_at_period_end: atPeriodEnd,
    });
  },

  async updateSubscription(stripeSubId, { priceId, metadata }) {
    // Get current subscription items
    const sub = await getStripe().subscriptions.retrieve(stripeSubId);
    const item = sub.items.data[0];
    if (!item) throw new Error('No subscription items found');

    return getStripe().subscriptions.update(stripeSubId, {
      items: [{ id: item.id, price: priceId }],
      metadata: { ...sub.metadata, ...metadata },
    });
  },

  // ── Invoice ──
  async getInvoice(stripeInvoiceId) {
    return getStripe().invoices.retrieve(stripeInvoiceId);
  },

  async listInvoices(stripeCustomerId, limit = 20) {
    return getStripe().invoices.list({ customer: stripeCustomerId, limit });
  },

  // ── Customer Portal ──
  async createPortalSession(stripeCustomerId, returnUrl) {
    return getStripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl || 'https://wpilot.ai/billing',
    });
  },

  // ── Price IDs from config ──
  getPriceId(planId) {
    const plan = config.plans.find(p => p.id === planId);
    return plan ? plan.stripePriceId : null;
  },

  // ── Product Setup (run once) ──
  async setupProducts() {
    const results = [];
    for (const plan of config.plans) {
      try {
        // Check if product exists
        let product;
        try {
          product = await getStripe().products.retrieve(`wpilot_${plan.id}`);
        } catch (e) {
          product = await getStripe().products.create({
            id: `wpilot_${plan.id}`,
            name: `WPilot ${plan.name}`,
            description: plan.features.join(', '),
            metadata: { plan_id: plan.id },
          });
        }

        // Create/update price
        const price = await getStripe().prices.create({
          product: product.id,
          unit_amount: plan.price * 100, // cents
          currency: plan.currency,
          recurring: { interval: plan.interval },
          metadata: { plan_id: plan.id },
        });

        results.push({ plan: plan.id, productId: product.id, priceId: price.id });
      } catch (e) {
        results.push({ plan: plan.id, error: e.message });
      }
    }
    return results;
  },
};
