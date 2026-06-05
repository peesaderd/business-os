/**
 * Stripe Webhook Routes — รับ event จาก Stripe
 */
const express = require('express');
const Stripe = require('stripe');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const config = require('../config');
const erpBridge = require('../services/erp-bridge');

const router = express.Router();

// Webhook needs raw body — use express.raw() middleware
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const stripe = new Stripe(config.stripe.secretKey);
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (e) {
    console.error('[webhook] Signature verification failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  console.log(`[webhook] Received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.metadata?.customer_id;
        const planId = session.metadata?.plan_id;
        const stripeCustomerId = session.customer;
        const stripeSubId = session.subscription;
        const email = session.customer_details?.email;

        // Get subscription details from Stripe
        const stripe = new Stripe(config.stripe.secretKey);
        const subDetails = await stripe.subscriptions.retrieve(stripeSubId);

        // Upsert customer
        db.upsertCustomer({ id: customerId, email, stripeCustomerId, planId });

        // Create subscription
        const subId = `sub-${uuidv4().slice(0, 8)}`;
        db.upsertSubscription({
          id: subId,
          customerId,
          planId: planId || 'solo',
          stripeSubId,
          status: 'active',
          periodStart: new Date(subDetails.current_period_start * 1000).toISOString(),
          periodEnd: new Date(subDetails.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: false,
        });

        // Update WPilot Engine
        await erpBridge.updateWpilotPlan({ customerId, planId: planId || 'solo' });

        console.log(`[webhook] ✅ Subscription active: ${customerId} -> ${planId}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const stripeCustomerId = invoice.customer;
        const stripeSubId = invoice.subscription;
        const stripeInvoiceId = invoice.id;
        const amount = invoice.amount_paid / 100;
        const currency = invoice.currency;

        const customer = db.getCustomerByStripeId(stripeCustomerId);
        if (!customer) break;

        const invId = `inv-${uuidv4().slice(0, 8)}`;
        db.upsertInvoice({
          id: invId,
          customerId: customer.id,
          subscriptionId: db.getSubscriptionByStripeId(stripeSubId)?.id,
          stripeInvoiceId,
          stripePaymentIntent: invoice.payment_intent,
          amount,
          currency,
          status: 'paid',
          invoiceUrl: invoice.hosted_invoice_url,
          paidAt: new Date().toISOString(),
        });

        // Sync to ERP
        await erpBridge.createArInvoice({
          customerName: customer.name || customer.id,
          customerEmail: customer.email,
          amount,
          description: `WPilot ${customer.plan_id || 'Solo'} — ${new Date().toLocaleDateString('th-TH')}`,
          metadata: { customerId: customer.id },
        });

        console.log(`[webhook] ✅ Invoice paid: $${amount} for ${customer.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const failedInvoice = event.data.object;
        const failedCustomer = db.getCustomerByStripeId(failedInvoice.customer);
        if (failedCustomer) {
          const sub = db.getActiveSubscription(failedCustomer.id);
          if (sub) {
            db.upsertSubscription({ ...sub, status: 'past_due' });
          }
          console.log(`[webhook] ⚠️ Payment failed: ${failedCustomer.id}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subUpdate = event.data.object;
        const subCustomer = db.getCustomerByStripeId(subUpdate.customer);
        if (!subCustomer) break;

        const existingSub = db.getSubscriptionByStripeId(subUpdate.id);
        if (existingSub) {
          db.upsertSubscription({
            ...existingSub,
            status: subUpdate.status,
            periodStart: new Date(subUpdate.current_period_start * 1000).toISOString(),
            periodEnd: new Date(subUpdate.current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: subUpdate.cancel_at_period_end,
          });

          // Update customer status
          if (subUpdate.status === 'canceled' || subUpdate.status === 'unpaid') {
            db.db.prepare("UPDATE customers SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(subCustomer.id);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subDeleted = event.data.object;
        const delCustomer = db.getCustomerByStripeId(subDeleted.customer);
        if (delCustomer) {
          db.db.prepare("UPDATE customers SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(delCustomer.id);
        }
        break;
      }
    }
  } catch (e) {
    console.error('[webhook] Error processing:', e.message);
  }

  res.json({ received: true });
});

module.exports = router;
