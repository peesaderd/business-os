/**
 * Bank Callbacks — ตรวจรับ PromptPay จากธนาคารไทย
 * 
 * ✅ SCB (ธนาคารไทยพาณิชย์)
 * ✅ KBank (กสิกรไทย)
 * ✅ BBL (กรุงเทพ)
 * ✅ Generic (reference matching)
 * 
 * แต่ละธนาคารส่ง format callback ต่างกัน
 * เราต้อง match reference + amount เพื่อยืนยัน
 */
const db = require('../db');
const notifier = require('./notifier');
const { v4: uuidv4 } = require('uuid');

// ── Thai Bank Registry (key = bank slug) ──
const BANKS = {
  scb: {
    name: 'SCB',
    label: 'ไทยพาณิชย์',
    // sample: { amount: 100.00, transRef: 'WPT-XXXXXX-XXXX', accountNo: 'xxx-xxx-xxx', transDate: '2026-07-18T14:00:00Z' }
    normalize(body) {
      // SCB API, SCB EDC, SCB PromptPay callback
      let data = body.data || body;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { data = body; }
      }
      return {
        amount: parseFloat(data.amount || data.totalAmount || 0),
        transRef: data.transRef || data.ref || data.reference || data.transactionRef || '',
        senderAccount: data.senderAccount || data.fromAccount || '',
        senderName: data.senderName || data.fromName || '',
        bankRef: data.bankRef || data.transactionId || data.slipRef || '',
        transDate: data.transDate || data.dateTime || new Date().toISOString(),
      };
    },
  },
  kbank: {
    name: 'KBank',
    label: 'กสิกรไทย',
    // sample: { amount: 100.00, ref1: 'WPT-XXXX', ref2: 'USER', transId: 'KTB-xxx' }
    normalize(body) {
      let data = body;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { data = body; }
      }
      return {
        amount: parseFloat(data.amount || data.total || 0),
        transRef: data.ref1 || data.ref || data.reference || data.paymentRef || '',
        senderAccount: data.fromAccount || data.sender || '',
        senderName: data.fromName || data.senderName || '',
        bankRef: data.transId || data.transactionId || data.bankRef || '',
        transDate: data.transDate || data.dateTime || data.timestamp || new Date().toISOString(),
      };
    },
  },
  bbl: {
    name: 'BBL',
    label: 'กรุงเทพ',
    normalize(body) {
      let data = body;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { data = body; }
      }
      return {
        amount: parseFloat(data.amount || data.trnAmount || 0),
        transRef: data.remark || data.ref || data.reference || '',
        senderAccount: data.fromAccount || data.payer || '',
        senderName: data.payerName || '',
        bankRef: data.trnRef || data.transactionId || '',
        transDate: data.date || data.transactionDate || new Date().toISOString(),
      };
    },
  },
  default: {
    name: 'Generic',
    label: 'ทั่วไป',
    normalize(body) {
      let data = body;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { data = body; }
      }
      return {
        amount: parseFloat(data.amount || 0),
        transRef: (data.ref || data.reference || data.transRef || data.paymentRef || '').toString(),
        senderAccount: data.sender || data.from || data.fromAccount || '',
        senderName: data.senderName || data.name || data.payerName || '',
        bankRef: data.bankRef || data.transactionId || data.id || '',
        transDate: data.date || data.timestamp || data.createdAt || new Date().toISOString(),
      };
    },
  },
};

/**
 * รับ callback จากธนาคารและ auto-match กับ pending payment
 */
async function handleCallback(bankSlug, body) {
  const bank = BANKS[bankSlug] || BANKS.default;
  const normalized = bank.normalize(body);

  console.log(`[bank-callback] ${bank.name} | amount=${normalized.amount} ref=${normalized.transRef} bankRef=${normalized.bankRef}`);

  if (!normalized.amount || normalized.amount <= 0) {
    return { matched: false, error: 'Invalid amount' };
  }

  // ── Strategy 1: Match by payment_ref (ตรง) ──
  if (normalized.transRef) {
    const refClean = normalized.transRef.replace(/[^A-Za-z0-9-]/g, '');
    const exactMatch = db.db.prepare(`
      SELECT * FROM qr_payments WHERE payment_ref = ? AND status = 'pending'
      LIMIT 1
    `).get(refClean);

    if (exactMatch) {
      return await confirmPayment(exactMatch, normalized, bank);
    }

    // Partial match (reference ขึ้นต้นด้วย WPT-)
    const partialMatch = db.db.prepare(`
      SELECT * FROM qr_payments WHERE payment_ref LIKE ? AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${refClean}%`);

    if (partialMatch) {
      return await confirmPayment(partialMatch, normalized, bank);
    }
  }

  // ── Strategy 2: Match by amount + customer phone ──
  if (normalized.senderAccount) {
    const phoneMatch = db.db.prepare(`
      SELECT * FROM qr_payments 
      WHERE customer_phone LIKE ? AND amount = ? AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${normalized.senderAccount.slice(-6)}%`, normalized.amount);

    if (phoneMatch) {
      return await confirmPayment(phoneMatch, normalized, bank);
    }
  }

  // ── Strategy 3: Match by amount only (fallback, exact amount) ──
  const amountOnlyMatch = db.db.prepare(`
    SELECT * FROM qr_payments 
    WHERE amount = ? AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1
  `).get(normalized.amount);

  if (amountOnlyMatch) {
    return await confirmPayment(amountOnlyMatch, normalized, bank);
  }

  // ── No match found ──
  console.log(`[bank-callback] ❌ No matching payment for ref=${normalized.transRef} amount=${normalized.amount}`);
  return { matched: false, message: 'No matching pending payment found' };
}

/**
 * Auto-confirm payment when matched
 */
async function confirmPayment(payment, normalized, bank) {
  const now = new Date().toISOString();

  // Mark as paid
  db.db.prepare("UPDATE qr_payments SET status='paid', paid_at=datetime('now'), bank_ref=? WHERE id=?")
    .run(normalized.bankRef || '', payment.id);

  // Activate subscription if plan exists
  if (payment.plan_id) {
    let customer = db.getCustomer(payment.customer_id);
    if (!customer) {
      db.upsertCustomer({
        id: payment.customer_id,
        email: `${payment.customer_id}@wpilot.qr`,
        name: normalized.senderName || payment.customer_name || payment.customer_id,
        stripeCustomerId: null,
        planId: payment.plan_id,
      });
      customer = db.getCustomer(payment.customer_id);
    }

    const subId = `sub-${uuidv4().slice(0, 8)}`;
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    db.upsertSubscription({
      id: subId,
      customerId: payment.customer_id,
      planId: payment.plan_id,
      stripeSubId: `bank_${payment.id}`,
      status: 'active',
      periodStart: now,
      periodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
    });

    // Sync to WPilot
    const erpBridge = require('./erp-bridge');
    await erpBridge.updateWpilotPlan({ customerId: payment.customer_id, planId: payment.plan_id });

    // Create invoice
    const invId = `inv-${uuidv4().slice(0, 8)}`;
    db.upsertInvoice({
      id: invId,
      customerId: payment.customer_id,
      subscriptionId: subId,
      stripeInvoiceId: `bank_${payment.id}`,
      stripePaymentIntent: `bank_pi_${payment.id}`,
      amount: payment.amount,
      currency: 'thb',
      status: 'paid',
      paidAt: now,
    });

    // Sync ERP AR invoice
    await erpBridge.createArInvoice({
      customerName: payment.customer_name || payment.customer_id,
      customerEmail: customer?.email || `${payment.customer_id}@wpilot.qr`,
      amount: payment.amount,
      description: `WPilot ${payment.plan_id} — PromptPay ${bank.name}`,
      metadata: { customerId: payment.customer_id },
    });
  }

  // ── Send notification ──
  await notifier.send({
    channel: 'all',
    title: '✅ รับเงิน PromptPay อัตโนมัติ',
    message: `💰 ${payment.amount.toLocaleString()} THB\n🏦 ${bank.label}\n📌 ${payment.payment_ref}\n👤 ${payment.customer_name || payment.customer_id}\n📋 ${payment.plan_id || '-'}`,
    metadata: { paymentId: payment.id, amount: payment.amount, bank: bank.name },
  });

  console.log(`[bank-callback] ✅ Auto confirmed: ${payment.id} | ${payment.amount} THB | via ${bank.name}`);

  return {
    matched: true,
    paymentId: payment.id,
    amount: payment.amount,
    customerId: payment.customer_id,
    planId: payment.plan_id,
    bank: bank.name,
    paidAt: now,
    notification: '✅ LINE / Telegram sent',
  };
}

/**
 * List unmatched recent notifications (for admin review)
 */
function listUnmatched() {
  // Returns pending payments that are older than 5 minutes
  // meaning the QR was generated but no money came in yet
  return db.db.prepare(`
    SELECT * FROM qr_payments 
    WHERE status = 'pending' 
      AND datetime('now', '-5 minutes') > created_at
    ORDER BY created_at DESC LIMIT 50
  `).all();
}

/**
 * Dashboard stats for admin panel
 */
function getVerificationStats() {
  const totalPending = db.db.prepare("SELECT COUNT(*) as c FROM qr_payments WHERE status='pending'").get().c;
  const paidToday = db.db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM qr_payments WHERE status='paid' AND date(paid_at) = date('now')").get();
  const paidThisMonth = db.db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM qr_payments WHERE status='paid' AND paid_at >= date('now','start of month')").get();
  
  return {
    pendingVerification: totalPending,
    today: { count: paidToday.c, total: paidToday.total },
    thisMonth: { count: paidThisMonth.c, total: paidThisMonth.total },
  };
}

module.exports = {
  BANKS,
  handleCallback,
  confirmPayment,
  listUnmatched,
  getVerificationStats,
};
