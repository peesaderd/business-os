'use strict';

/**
 * Business OS — POS (Point of Sale) Service
 *
 * Express server providing RESTful endpoints for retail POS operations,
 * heavily integrated with the ERP MCP for inventory, orders, customers,
 * finance, tax and discounts.
 *
 * Port: 8114
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

const PosEngine = require('./pos-engine');
const ReceiptGenerator = require('./receipt-generator');
const OfflineSync = require('./offline-sync');

// ── Config ─────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || 8114;
const MCP_URL = process.env.ERP_MCP_URL || 'http://localhost:18789';
const TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default';

// ── Init ────────────────────────────────────────────────────────────

const app = express();
const posEngine = new PosEngine({ mcpUrl: MCP_URL, tenantId: TENANT_ID });
const offlineSync = new OfflineSync({ mcpUrl: MCP_URL, tenantId: TENANT_ID });

// ── Middleware ──────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

// Injects tenantId into every request
app.use((req, _res, next) => {
  req.tenantId = req.headers['x-tenant-id'] || TENANT_ID;
  next();
});

// ── Routes ─────────────────────────────────────────────────────────

/**
 * GET /api/pos/v1/health
 * Health check — confirms server + ERP MCP connectivity.
 */
app.get('/api/pos/v1/health', async (_req, res) => {
  try {
    const status = await posEngine.health();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(503).json({ success: false, status: 'error', error: err.message });
  }
});

/**
 * POST /api/pos/v1/sale
 * Create a new sale with items, customer, discount, and payments.
 * Body: { items, customerId?, customerName?, customerEmail?, payments?,
 *         discountCode?, notes?, currency? }
 */
app.post('/api/pos/v1/sale', async (req, res) => {
  try {
    const saleData = req.body;

    if (!saleData.items || !Array.isArray(saleData.items) || saleData.items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one item is required' });
    }

    const sale = await posEngine.createSale(saleData);

    // Generate receipt outputs
    const receiptData = ReceiptGenerator.buildReceiptData(sale);
    const receiptHtml = ReceiptGenerator.toHtml(receiptData);
    const receiptText = ReceiptGenerator.toPlainText(receiptData);
    const receiptEscPos = ReceiptGenerator.toEscPos(receiptData);

    res.status(201).json({
      success: true,
      sale: {
        saleId: sale.saleId,
        receiptNumber: sale.receiptNumber,
        status: sale.status,
        items: sale.items,
        subtotal: sale.subtotal,
        discountTotal: sale.discountTotal,
        taxTotal: sale.taxTotal,
        grandTotal: sale.grandTotal,
        currency: sale.currency,
        payments: sale.payments,
        change: sale.change,
        createdAt: sale.createdAt,
        customerName: sale.customerName,
        erpOrderId: sale.erpOrderId,
        arInvoiceId: sale.arInvoiceId,
        transactionId: sale.transactionId,
      },
      receipt: {
        html: receiptHtml,
        text: receiptText,
        escPos: receiptEscPos.toString('base64'),
        data: receiptData,
      },
    });
  } catch (err) {
    console.error('[POST /sale]', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/pos/v1/refund
 * Process a refund against a completed sale.
 * Body: { saleId, items?: [{productId, quantity}], reason?, refundAmount? }
 */
app.post('/api/pos/v1/refund', async (req, res) => {
  try {
    const { saleId, items, reason } = req.body;
    if (!saleId) {
      return res.status(400).json({ success: false, error: 'saleId is required' });
    }

    const refund = await posEngine.processRefund({ saleId, items, reason });
    res.json({ success: true, refund });
  } catch (err) {
    console.error('[POST /refund]', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pos/v1/products
 * Search products by name / SKU / category.
 * Query: ?search=...&categoryId=...
 */
app.get('/api/pos/v1/products', async (req, res) => {
  try {
    const products = await posEngine.searchProducts({
      search: req.query.search,
      categoryId: req.query.categoryId,
    });
    res.json({ success: true, products });
  } catch (err) {
    console.error('[GET /products]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pos/v1/product/:barcode
 * Lookup a product by barcode (scan).
 */
app.get('/api/pos/v1/product/:barcode', async (req, res) => {
  try {
    const product = await posEngine.scanBarcode(req.params.barcode);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, product });
  } catch (err) {
    console.error('[GET /product/:barcode]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/pos/v1/hold
 * Hold the current order for later retrieval.
 * Body: { items, customerId?, customerName?, payments?, note? }
 */
app.post('/api/pos/v1/hold', (req, res) => {
  try {
    const held = posEngine.holdOrder(req.body);
    res.status(201).json({ success: true, hold: held });
  } catch (err) {
    console.error('[POST /hold]', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pos/v1/holds
 * Retrieve all held orders.
 * Query: ?holdId=...  (to retrieve + unhold a specific order)
 */
app.get('/api/pos/v1/holds', (req, res) => {
  try {
    const { holdId } = req.query;
    if (holdId) {
      const order = posEngine.unholdOrder(holdId, true);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Held order not found' });
      }
      return res.json({ success: true, order });
    }
    const holds = posEngine.listHeldOrders();
    res.json({ success: true, holds });
  } catch (err) {
    console.error('[GET /holds]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/pos/v1/payment
 * Process a payment (multi-method).
 * Body: { amount, method, reference?, saleId? }
 */
app.post('/api/pos/v1/payment', async (req, res) => {
  try {
    const { amount, method, reference, saleId } = req.body;
    if (amount == null) {
      return res.status(400).json({ success: false, error: 'amount is required' });
    }
    const payment = await posEngine.processPayment({ amount, method, reference, saleId });
    res.status(201).json({ success: true, payment });
  } catch (err) {
    console.error('[POST /payment]', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pos/v1/receipt/:saleId
 * Generate receipt data and optionally output formats.
 * Query: ?format=html|text|escpos|json  (default: json)
 */
app.get('/api/pos/v1/receipt/:saleId', (req, res) => {
  try {
    const receiptData = posEngine.getReceiptData(req.params.saleId);
    if (!receiptData) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    const format = (req.query.format || 'json').toLowerCase();

    switch (format) {
      case 'html':
        res.set('Content-Type', 'text/html');
        return res.send(ReceiptGenerator.toHtml(receiptData));
      case 'text':
        res.set('Content-Type', 'text/plain');
        return res.send(ReceiptGenerator.toPlainText(receiptData));
      case 'escpos':
        res.set('Content-Type', 'application/octet-stream');
        return res.send(ReceiptGenerator.toEscPos(receiptData));
      case 'json':
      default:
        return res.json({
          success: true,
          receipt: receiptData,
          html: ReceiptGenerator.toHtml(receiptData),
          text: ReceiptGenerator.toPlainText(receiptData),
          escPos: ReceiptGenerator.toEscPos(receiptData).toString('base64'),
        });
    }
  } catch (err) {
    console.error('[GET /receipt/:saleId]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pos/v1/customers
 * Search customers by name or email.
 * Query: ?search=...
 */
app.get('/api/pos/v1/customers', async (req, res) => {
  try {
    const query = req.query.search || '';
    const customers = await posEngine.searchCustomers(query);
    res.json({ success: true, customers });
  } catch (err) {
    console.error('[GET /customers]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/pos/v1/discount
 * Validate a discount code and return the calculated discount.
 * Body: { code, orderAmount, customerId? }
 */
app.post('/api/pos/v1/discount', async (req, res) => {
  try {
    const { code, orderAmount, customerId } = req.body;
    if (!code || orderAmount == null) {
      return res.status(400).json({ success: false, error: 'code and orderAmount are required' });
    }
    const result = await posEngine.validateDiscount(code, orderAmount, customerId);
    res.json({ success: result.valid, discount: result });
  } catch (err) {
    console.error('[POST /discount]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Offline Sync Endpoints ─────────────────────────────────────────

/**
 * POST /api/pos/v1/offline/push
 * Push pending offline transactions to the server for sync.
 * Body: { operations: [{type, payload}] }
 */
app.post('/api/pos/v1/offline/push', (req, res) => {
  try {
    const { operations } = req.body;
    if (!Array.isArray(operations)) {
      return res.status(400).json({ success: false, error: 'operations array is required' });
    }
    const ids = operations.map(op => offlineSync.enqueue(op.type, op.payload));
    res.json({ success: true, queuedIds: ids });
  } catch (err) {
    console.error('[POST /offline/push]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/pos/v1/offline/pending
 * Return the list of pending offline operations.
 */
app.get('/api/pos/v1/offline/pending', (_req, res) => {
  res.json({ success: true, pending: offlineSync.getPending(), count: offlineSync.pendingCount });
});

/**
 * POST /api/pos/v1/offline/flush
 * Force a sync flush of pending operations.
 */
app.post('/api/pos/v1/offline/flush', async (_req, res) => {
  try {
    await offlineSync.flush();
    res.json({ success: true, message: 'Flush completed', remaining: offlineSync.pendingCount });
  } catch (err) {
    console.error('[POST /offline/flush]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/pos/v1/offline/status
 * Toggle the offline sync online/offline state.
 * Body: { online: boolean }
 */
app.post('/api/pos/v1/offline/status', (req, res) => {
  const { online } = req.body;
  if (online == null) {
    return res.status(400).json({ success: false, error: 'online boolean is required' });
  }
  offlineSync.setOnline(online);
  res.json({ success: true, online: offlineSync.isOnline, pending: offlineSync.pendingCount });
});

// ── Chart of Accounts (Accounting Integration) ──────────────────────

/**
 * GET /api/pos/v1/accounts
 * Retrieve chart of accounts from the ERP.
 */
app.get('/api/pos/v1/accounts', async (_req, res) => {
  try {
    const accounts = await posEngine.getChartOfAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    console.error('[GET /accounts]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Error Handler ──────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('[POS Server] Unhandled error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[POS] Server running on port ${PORT}`);
  console.log(`[POS] ERP MCP URL: ${MCP_URL}`);
  console.log(`[POS] Default tenant: ${TENANT_ID}`);
  console.log(`[POS] Health check: http://localhost:${PORT}/api/pos/v1/health`);
});

module.exports = app;
