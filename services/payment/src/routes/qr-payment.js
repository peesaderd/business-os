/**
 * QR Payment Routes — PromptPay QR Code
 * รองรับการจ่ายเงินผ่าน Thai QR Payment
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const promptpayQR = require('promptpay-qr');
const QRCode = require('qrcode');
const db = require('../db');
const config = require('../config');
const erpBridge = require('../services/erp-bridge');

const router = express.Router();

// ── Default PromptPay number (ใช้ของ Admin ก่อน) ──
const DEFAULT_PROMPTPAY = process.env.PROMPTPAY_NUMBER || '0912345678';

// ── Pending payments store (in-memory + DB fallback) ── 
const pendingPayments = new Map();

// ── POST: Generate QR Code ──
router.post('/generate', async (req, res) => {
  try {
    const { 
      customerId, 
      amount, 
      planId, 
      promptpayNumber, 
      description,
      returnUrl 
    } = req.body;

    if (!customerId || !amount) {
      return res.status(400).json({ error: 'customerId and amount required' });
    }

    if (amount < 1) {
      return res.status(400).json({ error: 'Amount must be at least 1 THB' });
    }

    const ppNumber = promptpayNumber || DEFAULT_PROMPTPAY;
    const paymentRef = `QR-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const refAmount = parseFloat(amount.toFixed(2));

    // สร้าง PromptPay QR payload
    const ppPayload = promptpayQR(ppNumber, {
      amount: refAmount,
      ref1: paymentRef.slice(-6),  // สั้นสุด 6 ตัว
      ref2: customerId.slice(-4),
      ref3: planId ? planId.slice(0, 3).toUpperCase() : 'WPT',
    });

    // Generate QR code image (base64 data URI)
    const qrDataUri = await QRCode.toDataURL(ppPayload, {
      width: 400,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // Store pending payment
    const paymentId = `pay-${uuidv4().slice(0, 8)}`;
    const payment = {
      id: paymentId,
      customerId,
      amount: refAmount,
      planId: planId || null,
      promptpayNumber: ppNumber,
      paymentRef,
      status: 'pending',
      description: description || `WPilot - ${planId || 'Subscription'} - ${refAmount} THB`,
      returnUrl: returnUrl || null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
    };

    pendingPayments.set(paymentId, payment);

    // Log pending payment to DB
    db.db.prepare(`
      INSERT INTO qr_payments (id, customer_id, amount, plan_id, payment_ref, status, expires_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(paymentId, customerId, refAmount, planId || null, paymentRef, payment.expiresAt);

    res.json({
      success: true,
      paymentId,
      paymentRef,
      amount: refAmount,
      qrCode: qrDataUri,   // base64 data URI — ใช้แสดงผลเลย
      qrPayload: ppPayload, // raw payload (debug)
      expiresAt: payment.expiresAt,
      instructions: `💰 โอน ${refAmount.toLocaleString()} บาท\n🏦 พร้อมเพย์ ${ppNumber}\n📌 อ้างอิง: ${paymentRef.slice(-6)}`,
    });
  } catch (e) {
    console.error('[qr] Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST: Verify Payment (Manual by admin or webhook) ──
router.post('/verify', async (req, res) => {
  try {
    const { paymentId, paymentRef, verifyBy } = req.body;

    if (!paymentId && !paymentRef) {
      return res.status(400).json({ error: 'paymentId or paymentRef required' });
    }

    // Find payment
    let payment = pendingPayments.get(paymentId);
    
    if (!payment && paymentRef) {
      // Search in DB
      payment = db.db.prepare('SELECT * FROM qr_payments WHERE payment_ref = ?').get(paymentRef);
    }

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update status
    payment.status = 'paid';
    payment.paidAt = new Date().toISOString();
    payment.verifiedBy = verifyBy || 'admin';
    
    if (pendingPayments.has(payment.id)) {
      pendingPayments.set(payment.id, payment);
    }

    // Update DB
    db.db.prepare("UPDATE qr_payments SET status='paid', paid_at=datetime('now') WHERE id=?")
      .run(payment.id);

    // ถ้ามี planId → activate subscription
    if (payment.planId) {
      // Ensure customer exists in payment DB
      let customer = db.getCustomer(payment.customerId);
      if (!customer) {
        db.upsertCustomer({
          id: payment.customerId,
          email: `${payment.customerId}@wpilot.qr`,
          stripeCustomerId: null,
          planId: payment.planId,
        });
        customer = db.getCustomer(payment.customerId);
      }
      
      // Create subscription (1 month)
      const subId = `sub-${uuidv4().slice(0, 8)}`;
      const periodStart = new Date();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      db.upsertSubscription({
        id: subId,
        customerId: payment.customerId,
        planId: payment.planId,
        stripeSubId: `qr_${payment.id}`,
        status: 'active',
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        cancelAtPeriodEnd: false,
      });

      // Update WPilot plan
      await erpBridge.updateWpilotPlan({
        customerId: payment.customerId,
        planId: payment.planId,
      });

      // Create invoice
      const invId = `inv-${uuidv4().slice(0, 8)}`;
      db.upsertInvoice({
        id: invId,
        customerId: payment.customerId,
        subscriptionId: subId,
        stripeInvoiceId: `qr_inv_${payment.id}`,
        stripePaymentIntent: `qr_pi_${payment.id}`,
        amount: payment.amount,
        currency: 'thb',
        status: 'paid',
        invoiceUrl: null,
        paidAt: new Date().toISOString(),
      });

      // Sync ERP
      await erpBridge.createArInvoice({
        customerName: customer?.name || payment.customerId,
        customerEmail: customer?.email || `${payment.customerId}@wpilot.ai`,
        amount: payment.amount,
        description: `WPilot ${payment.planId} — QR PromptPay — ${payment.paymentRef}`,
        metadata: { customerId: payment.customerId },
      });
    }

    res.json({
      success: true,
      message: '✅ Payment verified',
      payment: {
        id: payment.id,
        amount: payment.amount,
        planId: payment.planId || null,
        paidAt: payment.paidAt,
      },
    });
  } catch (e) {
    console.error('[qr] Verify error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET: Check payment status ──
router.get('/status/:paymentId', (req, res) => {
  const payment = pendingPayments.get(req.params.paymentId);
  if (payment) {
    return res.json({ 
      status: payment.status,
      amount: payment.amount,
      createdAt: payment.createdAt,
      expiresAt: payment.expiresAt,
    });
  }

  // Check DB
  const dbPayment = db.db.prepare('SELECT * FROM qr_payments WHERE id = ?').get(req.params.paymentId);
  if (dbPayment) {
    return res.json({
      status: dbPayment.status,
      amount: dbPayment.amount,
      createdAt: dbPayment.created_at,
      paidAt: dbPayment.paid_at,
    });
  }

  res.status(404).json({ error: 'Payment not found' });
});

// ── GET: List pending payments ──
router.get('/pending', (req, res) => {
  const { customerId } = req.query;
  const payments = db.db.prepare(`
    SELECT * FROM qr_payments WHERE status='pending' AND (? IS NULL OR customer_id = ?)
    ORDER BY created_at DESC LIMIT 20
  `).all(customerId || null, customerId || null);
  res.json(payments);
});

// ── POST: Manual confirm by admin ──
router.post('/admin-confirm', async (req, res) => {
  const { customerId, amount, planId, adminNote } = req.body;

  if (!customerId || !amount) {
    return res.status(400).json({ error: 'customerId and amount required' });
  }

  // Generate QR + auto-confirm สำหรับเคส Admin ยืนยันเอง
  const paymentId = `pay-${uuidv4().slice(0, 8)}`;
  const paymentRef = `ADM-${Date.now().toString(36).toUpperCase()}`;

  db.db.prepare(`
    INSERT INTO qr_payments (id, customer_id, amount, plan_id, payment_ref, status, paid_at)
    VALUES (?, ?, ?, ?, ?, 'paid', datetime('now'))
  `).run(paymentId, customerId, amount, planId || null, paymentRef);

  // Ensure customer exists
  let customer = db.getCustomer(customerId);
  if (!customer) {
    db.upsertCustomer({ id: customerId, email: `${customerId}@wpilot.admin`, stripeCustomerId: null, planId });
  }

  // Activate if plan specified
  if (planId) {
    const subId = `sub-${uuidv4().slice(0, 8)}`;
    db.upsertSubscription({
      id: subId, customerId, planId,
      stripeSubId: `adm_${paymentId}`,
      status: 'active',
      periodStart: new Date().toISOString(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
    });
    await erpBridge.updateWpilotPlan({ customerId, planId });
  }

  res.json({
    success: true,
    paymentId,
    message: `✅ Admin confirmed: ${amount} THB from ${customerId}`,
  });
});

module.exports = router;
