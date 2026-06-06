/**
 * QR Payment Routes — Dynamic PromptPay QR
 * ✅ รองรับ PromptPay หลายเบอร์ (Dynamic per customer)
 * ✅ สร้าง QR แบบมีจำนวนเงิน + reference
 * ✅ แจ้งเตือนเมื่อเงินเข้า (LINE / Webhook / In-app)
 * ✅ รับ callback จากธนาคาร (auto-detect)
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const promptpayQR = require('promptpay-qr');
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const erpBridge = require('../services/erp-bridge');
const notifier = require('../services/notifier');

const router = express.Router();

// ── Default PromptPay (Admin) ──
const DEFAULT_PROMPTPAY = '0993946144';

// ── In-memory pending payments ──
const pendingPayments = new Map();

// ── POST: Generate QR Code (Dynamic PromptPay) ──
router.post('/generate', async (req, res) => {
  try {
    const { 
      customerId, 
      amount, 
      planId, 
      promptpayNumber,  // ✅ Dynamic: รับมา หรือใช้ค่าเริ่มต้น
      description,
      callbackUrl,      // ✅ Webhook เมื่อจ่ายเงินสำเร็จ
      returnUrl,
      customerName,
      customerPhone,
    } = req.body;

    if (!customerId || !amount) {
      return res.status(400).json({ error: 'customerId and amount required' });
    }

    if (amount < 1) {
      return res.status(400).json({ error: 'Amount must be at least 1 THB' });
    }

    // ✅ ใช้ PromptPay ของลูกค้าถ้ามี, ไม่ก็ใช้ของ Admin
    const ppNumber = (promptpayNumber || DEFAULT_PROMPTPAY).replace(/[-\s]/g, '');
    if (!/^0\d{9}$/.test(ppNumber)) {
      return res.status(400).json({ error: 'Invalid PromptPay number. Must be 10 digits starting with 0' });
    }

    // สร้าง reference
    const refId = uuidv4().slice(0, 6).toUpperCase();
    const paymentRef = `WPT-${Date.now().toString(36).toUpperCase()}-${refId}`;
    const refAmount = parseFloat(amount.toFixed(2));

    // ✅ Dynamic PromptPay QR — สร้าง payload ตามเบอร์ที่รับมา
    const ppPayload = promptpayQR(ppNumber, {
      amount: refAmount,
      ref1: refId,
      ref2: customerId.slice(-4).toUpperCase(),
    });

    // ✅ Generate QR image (base64 PNG)
    const qrDataUri = await QRCode.toDataURL(ppPayload, {
      width: 500,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    // ✅ Store pending payment
    const paymentId = `qr-${uuidv4().slice(0, 8)}`;
    const payment = {
      id: paymentId,
      customerId,
      customerName: customerName || customerId,
      customerPhone: customerPhone || null,
      amount: refAmount,
      planId: planId || null,
      promptpayNumber: ppNumber,
      paymentRef,
      status: 'pending',
      description: description || `WPilot - ${planId || 'Payment'} - ${refAmount.toLocaleString()} THB`,
      callbackUrl: callbackUrl || null,
      returnUrl: returnUrl || null,
      qrPayload: ppPayload,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    pendingPayments.set(paymentId, payment);

    // Save to DB
    db.db.prepare(`
      INSERT OR IGNORE INTO qr_payments 
        (id, customer_id, customer_name, amount, plan_id, promptpay_number, payment_ref, status, expires_at, callback_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(paymentId, customerId, payment.customerName, refAmount, planId || null, ppNumber, paymentRef, 
           payment.expiresAt, callbackUrl || null);

    res.json({
      success: true,
      paymentId,
      paymentRef,
      amount: refAmount,
      currency: 'THB',
      promptpayNumber: ppNumber,
      promptpayFormatted: `${ppNumber.slice(0, 3)}-${ppNumber.slice(3, 6)}-${ppNumber.slice(6)}`,
      qrCode: qrDataUri,
      expiresAt: payment.expiresAt,
      instructions: [
        `💰 โอน ${refAmount.toLocaleString()} บาท`,
        `🏦 พร้อมเพย์ ${ppNumber.slice(0, 3)}-${ppNumber.slice(3, 6)}-${ppNumber.slice(6)}`,
        `📌 อ้างอิง: ${refId}`,
        `⏰ หมดอายุใน 30 นาที`,
      ],
    });
  } catch (e) {
    console.error('[qr] Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST: Verify Payment (Manual / Bank Callback) ──
router.post('/verify', async (req, res) => {
  try {
    const { paymentId, paymentRef, verifyBy, bankRef, force } = req.body;

    if (!paymentId && !paymentRef) {
      return res.status(400).json({ error: 'paymentId or paymentRef required' });
    }

    // Find payment
    let payment = pendingPayments.get(paymentId);
    if (!payment && paymentRef) {
      payment = db.db.prepare('SELECT * FROM qr_payments WHERE payment_ref = ?').get(paymentRef);
    }
    if (!payment) {
      payment = db.db.prepare('SELECT * FROM qr_payments WHERE id = ?').get(paymentId);
    }
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // ป้องกัน verify ซ้ำ
    if (payment.status === 'paid' && !force) {
      return res.json({ success: true, message: '✅ Payment already verified', payment: { id: payment.id, status: 'paid' } });
    }

    const paymentIdStr = payment.id || paymentId;

    // Update status
    payment.status = 'paid';
    payment.paidAt = new Date().toISOString();
    payment.verifiedBy = verifyBy || 'bank_callback';
    
    if (pendingPayments.has(paymentIdStr)) {
      pendingPayments.set(paymentIdStr, payment);
    }

    // Update DB
    db.db.prepare("UPDATE qr_payments SET status='paid', paid_at=datetime('now'), bank_ref=? WHERE id=?")
      .run(bankRef || null, paymentIdStr);

    // ✅ Activate subscription ถ้ามี planId
    if (payment.planId) {
      let customer = db.getCustomer(payment.customerId);
      if (!customer) {
        db.upsertCustomer({
          id: payment.customerId,
          email: payment.customerPhone ? `${payment.customerPhone}@wpilot.qr` : `${payment.customerId}@wpilot.qr`,
          name: payment.customerName || payment.customerId,
          stripeCustomerId: null,
          planId: payment.planId,
        });
        customer = db.getCustomer(payment.customerId);
      }

      // สร้าง subscription 1 เดือน
      const subId = `sub-${uuidv4().slice(0, 8)}`;
      const periodStart = new Date();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      db.upsertSubscription({
        id: subId, customerId: payment.customerId, planId: payment.planId,
        stripeSubId: `qr_${paymentIdStr}`,
        status: 'active',
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        cancelAtPeriodEnd: false,
      });

      // อัปเดต WPilot Plan
      await erpBridge.updateWpilotPlan({ customerId: payment.customerId, planId: payment.planId });

      // สร้าง Invoice
      const invId = `inv-${uuidv4().slice(0, 8)}`;
      db.upsertInvoice({
        id: invId, customerId: payment.customerId, subscriptionId: subId,
        stripeInvoiceId: `qr_inv_${paymentIdStr}`,
        stripePaymentIntent: `qr_pi_${paymentIdStr}`,
        amount: payment.amount,
        currency: 'thb',
        status: 'paid',
        paidAt: new Date().toISOString(),
      });

      // Sync ERP
      await erpBridge.createArInvoice({
        customerName: payment.customerName || payment.customerId,
        customerEmail: customer?.email || `${payment.customerId}@wpilot.qr`,
        amount: payment.amount,
        description: `WPilot ${payment.planId} — QR PromptPay — ${payment.paymentRef}`,
        metadata: { customerId: payment.customerId },
      });
    }

    // ✅ แจ้งเตือน
    await notifier.send({
      channel: 'all',
      title: '✅ รับเงินสำเร็จ',
      message: `💰 รับเงิน ${payment.amount.toLocaleString()} THB\nจาก: ${payment.customerName || payment.customerId}\nแผน: ${payment.planId || '-'}\nวิธี: PromptPay ${payment.promptpayNumber}`,
      metadata: { paymentId: paymentIdStr, amount: payment.amount, customerId: payment.customerId },
    });

    // ✅ Callback webhook ถ้ามี
    if (payment.callbackUrl) {
      try {
        const fetch = global.fetch || require('http');
        const url = new URL(payment.callbackUrl);
        const lib = url.protocol === 'https:' ? require('https') : require('http');
        const postData = JSON.stringify({
          event: 'payment.completed',
          paymentId: paymentIdStr,
          amount: payment.amount,
          currency: 'THB',
          customerId: payment.customerId,
          planId: payment.planId,
          paidAt: payment.paidAt,
          paymentRef: payment.paymentRef,
        });
        const req = lib.request({
          hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
          timeout: 5000,
        }, (res) => {});
        req.write(postData);
        req.end();
      } catch (e) {
        console.warn('[qr] Callback failed:', e.message);
      }
    }

    res.json({
      success: true,
      message: '✅ Payment verified and notification sent',
      payment: {
        id: paymentIdStr,
        amount: payment.amount,
        planId: payment.planId || null,
        paidAt: payment.paidAt,
        promptpayNumber: payment.promptpayNumber,
      },
    });
  } catch (e) {
    console.error('[qr] Verify error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST: Bank Webhook Callback (auto-detect เงินเข้า) ──
// ธนาคารหรือ service ที่ detect เงินเข้าสามารถ POST มาได้
router.post('/bank-callback', async (req, res) => {
  try {
    const body = req.body;
    
    // รับข้อมูลจาก bank API
    const { 
      amount,           // จำนวนเงิน
      senderRef,        // reference ที่ bank ส่งมา
      bankRef,          // transaction ref จาก bank
      senderName,
      senderAccount,
      receivedAt,
    } = body;

    if (!amount || !senderRef) {
      return res.status(400).json({ error: 'amount and senderRef required' });
    }

    // ค้นหา pending payment ที่ reference ตรงกัน
    const payment = db.db.prepare(`
      SELECT * FROM qr_payments WHERE payment_ref LIKE ? AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${senderRef}%`);

    if (!payment) {
      console.log(`[qr-callback] No matching payment for ref: ${senderRef}`);
      return res.json({ matched: false, message: 'No matching payment found' });
    }

    // ✅ Automatically verify
    // Forward to verify handler
    const verifyRes = await new Promise((resolve) => {
      req.body = { paymentId: payment.id, verifyBy: 'bank_callback', bankRef };
      // สร้าง mock request สำหรับ verify
      const mockReq = { body: { paymentId: payment.id, verifyBy: 'bank_callback', bankRef } };
      const mockRes = { json: resolve, status: () => ({ json: resolve }) };
      
      // เรียก verify โดยตรง
      const verify = (req, res) => {
        const { paymentId, paymentRef, verifyBy, bankRef } = req.body;
        // simplified verify
        try {
          const dbPayment = db.db.prepare('SELECT * FROM qr_payments WHERE id = ?').get(paymentId);
          if (!dbPayment) return res.json({ error: 'Not found' });
          db.db.prepare("UPDATE qr_payments SET status='paid', paid_at=datetime('now'), bank_ref=? WHERE id=?").run(bankRef || null, paymentId);
          notifier.send({ channel: 'all', title: '✅ รับเงินเข้า', message: `💰 ${dbPayment.amount} THB` });
          res.json({ success: true, matched: true });
        } catch(e) { res.json({ error: e.message }); }
      };
      verify(mockReq, mockRes);
    });

    res.json({ matched: true, paymentId: payment.id, amount: payment.amount });
  } catch (e) {
    console.error('[qr] Bank callback error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET: Check payment status ──
router.get('/status/:paymentId', (req, res) => {
  // Check in-memory first
  const memPayment = pendingPayments.get(req.params.paymentId);
  if (memPayment) {
    return res.json({
      status: memPayment.status,
      amount: memPayment.amount,
      promptpayNumber: memPayment.promptpayNumber,
      paymentRef: memPayment.paymentRef,
      createdAt: memPayment.createdAt,
      expiresAt: memPayment.expiresAt,
      paidAt: memPayment.paidAt || null,
    });
  }

  // Check DB
  const payment = db.db.prepare('SELECT * FROM qr_payments WHERE id = ?').get(req.params.paymentId);
  if (payment) {
    return res.json({
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      promptpayNumber: payment.promptpay_number,
      paymentRef: payment.payment_ref,
      createdAt: payment.created_at,
      paidAt: payment.paid_at,
      planId: payment.plan_id,
    });
  }

  res.status(404).json({ error: 'Payment not found' });
});

// ── GET: List payments ──
router.get('/list', (req, res) => {
  const { customerId, status, limit } = req.query;
  let query = 'SELECT * FROM qr_payments WHERE 1=1';
  const params = [];
  if (customerId) { query += ' AND customer_id = ?'; params.push(customerId); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit) || 50);

  const payments = db.db.prepare(query).all(...params);
  res.json(payments);
});

// ── POST: Admin Confirm (Manual) ──
router.post('/admin-confirm', async (req, res) => {
  const { customerId, customerName, amount, planId, promptpayNumber, adminNote } = req.body;

  if (!customerId || !amount) {
    return res.status(400).json({ error: 'customerId and amount required' });
  }

  const paymentId = `qr-${uuidv4().slice(0, 8)}`;
  const paymentRef = `ADM-${Date.now().toString(36).toUpperCase()}`;
  const ppNumber = (promptpayNumber || DEFAULT_PROMPTPAY).replace(/[-\s]/g, '');

  // Insert as paid
  db.db.prepare(`
    INSERT INTO qr_payments (id, customer_id, customer_name, amount, plan_id, promptpay_number, payment_ref, status, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', datetime('now'))
  `).run(paymentId, customerId, customerName || customerId, amount, planId || null, ppNumber, paymentRef);

  // Activate subscription
  if (planId) {
    let customer = db.getCustomer(customerId);
    if (!customer) {
      db.upsertCustomer({ id: customerId, email: `${customerId}@wpilot.admin`, name: customerName || customerId, stripeCustomerId: null, planId });
    }
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

  // แจ้งเตือน
  await notifier.send({
    channel: 'all',
    title: '✅ Admin ยืนยันรับเงิน',
    message: `💰 ${amount.toLocaleString()} THB\nจาก: ${customerName || customerId}\nแผน: ${planId || '-'}\nหมายเหตุ: ${adminNote || '-'}`,
    metadata: { paymentId, amount, customerId },
  });

  res.json({ success: true, paymentId, paymentRef, message: `✅ Admin confirmed: ${amount} THB from ${customerName || customerId}` });
});

module.exports = router;
