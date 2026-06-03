'use strict';

/**
 * POS Engine
 *
 * Core point-of-sale business logic:
 * - Sale creation with multi-item support
 * - Tax calculation via ERP MCP tax rates
 * - Discount handling via validate_discount
 * - Multi-method payment recording (cash, card, promptpay)
 * - Refund processing
 * - Hold / unhold orders
 * - Inventory adjustment on sale
 */

const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const EventEmitter = require('events');

class PosEngine extends EventEmitter {
  /**
   * @param {{mcpUrl?: string, tenantId?: string}} options
   */
  constructor(options = {}) {
    super();

    this.mcpUrl = options.mcpUrl || process.env.ERP_MCP_URL || 'http://localhost:18789';
    this.tenantId = options.tenantId || process.env.DEFAULT_TENANT_ID || 'default';

    /** Held orders: { [holdId]: {items, customerId, payments, heldAt, note} } */
    this._holds = new Map();

    /** Completed sales lookup by saleId */
    this._sales = new Map();

    /** Pending sale (single active) */
    this._pendingSale = null;

    this._receiptCounter = 0; // in production this comes from a sequence / DB
  }

  // ── Health ──────────────────────────────────────────────────────

  async health() {
    try {
      const inv = await this._mcp('get_inventory', { lowStockOnly: false });
      return {
        status: 'ok',
        erpMcp: true,
        pendingCount: this._holds.size,
        salesCount: this._sales.size,
        serverTime: new Date().toISOString(),
      };
    } catch (err) {
      return {
        status: 'degraded',
        erpMcp: false,
        error: err.message,
        pendingCount: this._holds.size,
        salesCount: this._sales.size,
        serverTime: new Date().toISOString(),
      };
    }
  }

  // ── Product Lookup ──────────────────────────────────────────────

  /**
   * Search products by keyword / category.
   * @param {{search?: string, categoryId?: string}} filters
   * @returns {Promise<Array>}
   */
  async searchProducts(filters = {}) {
    const products = await this._mcp('list_products', {
      search: filters.search,
      categoryId: filters.categoryId,
    });
    return Array.isArray(products) ? products : (products.products || products.data || []);
  }

  /**
   * Lookup a product by barcode.
   * @param {string} barcode
   * @returns {Promise<object|null>}
   */
  async scanBarcode(barcode) {
    try {
      const product = await this._mcp('get_product_by_barcode', { barcode });
      return product;
    } catch {
      return null;
    }
  }

  // ── Customer Lookup ─────────────────────────────────────────────

  /**
   * Search customers by name or email.
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchCustomers(query) {
    const customers = await this._mcp('list_customers', { search: query });
    return Array.isArray(customers) ? customers : (customers.customers || customers.data || []);
  }

  // ── Discount ────────────────────────────────────────────────────

  /**
   * Validate and calculate a discount for an order amount.
   * @param {string} code
   * @param {number} orderAmount
   * @param {string} [customerId]
   * @returns {Promise<{valid: boolean, discountAmount: number, type: string|null, message: string}>}
   */
  async validateDiscount(code, orderAmount, customerId) {
    try {
      const result = await this._mcp('validate_discount', {
        code,
        orderAmount,
        customerId,
      });
      const discountAmount = result.discountAmount || result.amount || 0;
      return {
        valid: result.valid !== false,
        discountAmount,
        type: result.type || result.discountType || 'percentage',
        message: result.message || (result.valid !== false ? 'Discount applied' : 'Invalid or expired coupon'),
      };
    } catch (err) {
      return {
        valid: false,
        discountAmount: 0,
        type: null,
        message: err.message || 'Could not validate discount',
      };
    }
  }

  // ── Tax Calculation ─────────────────────────────────────────────

  /**
   * Retrieve tax rates and compute tax on a given amount.
   * @param {number} amount  Pre-tax amount
   * @param {string} [category]  Optional product category
   * @returns {Promise<{rate: number, taxAmount: number, rates: Array}>}
   */
  async calculateTax(amount, category) {
    try {
      const taxRates = await this._mcp('get_tax_rates');
      const rates = Array.isArray(taxRates) ? taxRates : (taxRates.taxRates || taxRates.rates || []);
      // Pick the first applicable rate. In production, match by category.
      const applicable = rates.length > 0 ? rates[0] : { rate: 0.07, name: 'VAT 7%' };
      const rate = applicable.rate || 0;
      const taxAmount = Math.round(amount * rate * 100) / 100;
      return { rate, taxAmount, rates };
    } catch {
      // Default 7% VAT (Thailand) as fallback
      return { rate: 0.07, taxAmount: Math.round(amount * 0.07 * 100) / 100, rates: [] };
    }
  }

  // ── Sale Creation ───────────────────────────────────────────────

  /**
   * Create a complete sale — validate, calculate, pay, adjust inventory.
   *
   * @param {{items: Array, customerId?: string, customerName?: string,
   *         customerEmail?: string, payments?: Array, discountCode?: string,
   *         notes?: string, currency?: string}} saleData
   * @returns {Promise<object>} The completed sale
   */
  async createSale(saleData) {
    if (!saleData.items || saleData.items.length === 0) {
      throw new Error('Sale must have at least one item');
    }

    const saleId = uuidv4();
    const sale = {
      saleId,
      receiptNumber: await this._nextReceiptNumber(),
      storeName: saleData.storeName || 'Business OS POS',
      storeAddress: saleData.storeAddress || '',
      storeTaxId: saleData.storeTaxId || '',
      customerId: saleData.customerId || null,
      customerName: saleData.customerName || 'Walk-in Customer',
      customerEmail: saleData.customerEmail || '',
      currency: saleData.currency || 'THB',
      notes: saleData.notes || '',
      status: 'pending',
      createdAt: Date.now(),
      items: [],
      payments: [],
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      change: 0,
    };

    // ── 1. Resolve items ─────────────────────────────────────────
    const resolvedItems = [];
    for (const raw of saleData.items) {
      let product;
      if (raw.productId) {
        product = await this._mcp('get_product', { productId: raw.productId });
      } else if (raw.barcode) {
        product = await this.scanBarcode(raw.barcode);
      } else if (raw.sku) {
        const list = await this.searchProducts({ search: raw.sku });
        product = Array.isArray(list) && list.length > 0 ? list[0] : null;
      } else {
        throw new Error(`Item missing productId, barcode, or sku`);
      }

      if (!product || !product.id) {
        throw new Error(`Product not found for item: ${JSON.stringify(raw)}`);
      }

      const qty = raw.quantity || 1;
      const unitPrice = raw.unitPrice != null ? raw.unitPrice : (product.price || 0);

      // ── 2. Check stock ─────────────────────────────────────────
      const invData = await this._mcp('get_inventory', { lowStockOnly: false });
      const invItems = Array.isArray(invData) ? invData : (invData.inventory || invData.items || []);
      const invRec = invItems.find(i => i.productId === product.id || i.id === product.id);
      const available = invRec ? (invRec.quantity || invRec.stock || 0) : 9999;

      if (available < qty) {
        throw new Error(`Insufficient stock for ${product.name || product.id}: available ${available}, requested ${qty}`);
      }

      // ── 3. Build item ──────────────────────────────────────────
      resolvedItems.push({
        productId: product.id,
        sku: product.sku || raw.sku || '',
        name: raw.name || product.name || 'Product',
        quantity: qty,
        unitPrice,
        discount: 0,     // will be pro-rated later
        tax: 0,
        barcode: product.barcode || raw.barcode || '',
      });
    }

    sale.items = resolvedItems;
    sale.subtotal = resolvedItems.reduce((s, i) => s + (i.unitPrice * i.quantity), 0);

    // ── 4. Discount ──────────────────────────────────────────────
    if (saleData.discountCode) {
      const discResult = await this.validateDiscount(
        saleData.discountCode,
        sale.subtotal,
        saleData.customerId
      );
      if (discResult.valid) {
        sale.discountTotal = discResult.discountAmount;
        saleData._discountInfo = discResult;

        // Pro-rate discount across items proportional to line total
        if (sale.subtotal > 0 && sale.discountTotal > 0) {
          const ratio = sale.discountTotal / sale.subtotal;
          for (const item of sale.items) {
            const lineTotal = item.unitPrice * item.quantity;
            item.discount = Math.round(lineTotal * ratio * 100) / 100;
          }
        }
      }
    }

    // ── 5. Tax ───────────────────────────────────────────────────
    const afterDiscount = sale.subtotal - sale.discountTotal;
    const taxCalc = await this.calculateTax(afterDiscount);
    sale.taxTotal = taxCalc.taxAmount;

    // Pro-rate tax across items
    if (afterDiscount > 0 && sale.taxTotal > 0) {
      for (const item of sale.items) {
        const netAfterDisc = (item.unitPrice * item.quantity) - (item.discount || 0);
        item.tax = Math.round((netAfterDisc / afterDiscount) * sale.taxTotal * 100) / 100;
      }
    }

    // ── 6. Grand total ───────────────────────────────────────────
    sale.grandTotal = Math.round((afterDiscount + sale.taxTotal) * 100) / 100;

    // ── 7. Payments ──────────────────────────────────────────────
    const payments = saleData.payments || [{ method: 'cash', amount: sale.grandTotal }];
    let totalPaid = 0;

    for (const p of payments) {
      const paymentRecord = await this._recordPayment(sale.saleId, p.method, p.amount, p.reference);
      sale.payments.push(paymentRecord);
      totalPaid += p.amount;
    }
    sale.change = Math.max(0, Math.round((totalPaid - sale.grandTotal) * 100) / 100);
    sale.status = 'paid';

    // ── 8. Deduct inventory ──────────────────────────────────────
    for (const item of sale.items) {
      try {
        await this._mcp('adjust_inventory', {
          productId: item.productId,
          quantity: -item.quantity,
          reason: `POS sale ${sale.saleId}`,
        });
        this.emit('inventory_adjusted', { productId: item.productId, delta: -item.quantity, saleId: sale.saleId });
      } catch (err) {
        console.error(`[PosEngine] Failed to adjust inventory for ${item.productId}:`, err.message);
        // Non-fatal — sale is already recorded
      }
    }

    // ── 9. Create ERP order ──────────────────────────────────────
    try {
      const erpOrder = await this._mcp('create_order', {
        customerName: sale.customerName,
        customerEmail: sale.customerEmail,
        items: sale.items.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        channel: 'pos',
        notes: `POS Sale ${sale.saleId}`,
      });
      sale.erpOrderId = erpOrder.id || erpOrder.orderId || null;
    } catch (err) {
      console.error('[PosEngine] Failed to create ERP order:', err.message, 'saleId:', sale.saleId);
    }

    // ── 10. Create AR invoice ────────────────────────────────────
    if (sale.customerId) {
      try {
        const arInv = await this._mcp('create_ar_invoice', {
          customerId: sale.customerId,
          invoiceNumber: sale.receiptNumber,
          amount: sale.grandTotal,
          dueDate: Math.floor(Date.now() / 1000) + 86400, // due in 24h by default
          notes: `POS Sale ${sale.saleId}`,
        });
        sale.arInvoiceId = arInv.id || null;

        // Record payment against AR invoice
        await this._mcp('record_payment', {
          type: 'ar',
          invoiceId: sale.arInvoiceId,
          amount: sale.grandTotal,
        });
      } catch (err) {
        console.error('[PosEngine] Failed to create AR invoice:', err.message, 'saleId:', sale.saleId);
      }
    }

    // ── 11. Create finance transaction ───────────────────────────
    try {
      const tx = await this._mcp('create_transaction', {
        type: 'income',
        category: 'pos_sales',
        amount: sale.grandTotal,
        currency: sale.currency,
        description: `POS Sale ${sale.saleId} — ${sale.customerName}`,
        referenceType: 'sale',
        referenceId: sale.saleId,
        transactionDate: Math.floor(Date.now() / 1000),
      });
      sale.transactionId = tx.id || null;
    } catch (err) {
      console.error('[PosEngine] Failed to create finance transaction:', err.message, 'saleId:', sale.saleId);
    }

    this._sales.set(sale.saleId, sale);
    this.emit('sale_completed', sale);
    return sale;
  }

  // ── Payment ─────────────────────────────────────────────────────

  /**
   * Record a single payment (cash / card / promptpay / other).
   * @param {string} saleId
   * @param {string} method
   * @param {number} amount
   * @param {string} [reference]
   * @returns {Promise<{method: string, amount: number, reference: string, status: string}>}
   * @private
   */
  async _recordPayment(saleId, method, amount, reference) {
    const payment = {
      method: method || 'cash',
      amount: Math.round(amount * 100) / 100,
      reference: reference || '',
      status: 'completed',
      timestamp: Date.now(),
    };

    // Record finance transaction for the payment
    try {
      await this._mcp('create_transaction', {
        type: 'income',
        category: `pos_payment_${payment.method}`,
        amount: payment.amount,
        description: `POS payment ${payment.method} for sale ${saleId}`,
        referenceType: 'sale',
        referenceId: saleId,
        transactionDate: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.error('[PosEngine] Payment tx error:', err.message);
    }

    return payment;
  }

  /**
   * Process a standalone payment (e.g. from the /payment route).
   * @param {{amount: number, method: string, reference?: string, saleId?: string}} params
   * @returns {Promise<object>}
   */
  async processPayment(params) {
    const { amount, method, reference, saleId } = params;
    return this._recordPayment(saleId || 'standalone', method || 'cash', amount, reference);
  }

  // ── Refund ─────────────────────────────────────────────────────

  /**
   * Process a refund for a completed sale.
   * @param {{saleId: string, items?: Array<{productId: string, quantity: number}>,
   *         reason?: string, refundAmount?: number}} refundData
   * @returns {Promise<object>}
   */
  async processRefund(refundData) {
    const { saleId, items, reason } = refundData;
    const sale = this._sales.get(saleId);
    if (!sale) {
      throw new Error(`Sale ${saleId} not found. Refund requires an in-memory sale record.`);
    }
    if (sale.status === 'refunded') {
      throw new Error(`Sale ${saleId} has already been refunded`);
    }

    const refundId = uuidv4();
    let totalRefund = 0;
    const refundItems = [];

    const itemsToRefund = items && items.length > 0
      ? items
      : sale.items.map(i => ({ productId: i.productId, quantity: i.quantity }));

    for (const refItem of itemsToRefund) {
      const origItem = sale.items.find(i => i.productId === refItem.productId);
      if (!origItem) {
        throw new Error(`Item ${refItem.productId} not found in sale ${saleId}`);
      }

      const refundQty = Math.min(refItem.quantity, origItem.quantity);
      const refundLine = (origItem.unitPrice * refundQty) - (origItem.discount * (refundQty / origItem.quantity));
      totalRefund += refundLine;

      refundItems.push({
        productId: origItem.productId,
        name: origItem.name,
        quantity: refundQty,
        unitPrice: origItem.unitPrice,
        refundAmount: Math.round(refundLine * 100) / 100,
      });

      // Restore inventory
      try {
        await this._mcp('adjust_inventory', {
          productId: origItem.productId,
          quantity: refundQty,
          reason: `POS refund ${refundId} for sale ${saleId}`,
        });
      } catch (err) {
        console.error('[PosEngine] Failed to restore inventory on refund:', err.message);
      }
    }

    const refundAmount = refundData.refundAmount || Math.round(totalRefund * 100) / 100;

    // Record finance transaction for refund (negative income)
    try {
      await this._mcp('create_transaction', {
        type: 'expense',
        category: 'refunds',
        amount: refundAmount,
        description: `POS Refund ${refundId} — Sale ${saleId} — ${reason || 'Customer return'}`,
        referenceType: 'refund',
        referenceId: refundId,
        transactionDate: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.error('[PosEngine] Refund tx error:', err.message);
    }

    sale.status = 'refunded';
    this.emit('refund_processed', { saleId, refundId, refundAmount, items: refundItems });

    return {
      refundId,
      saleId,
      refundAmount,
      items: refundItems,
      reason: reason || 'Customer return',
      processedAt: new Date().toISOString(),
    };
  }

  // ── Hold / Unhold Orders ───────────────────────────────────────

  /**
   * Hold a pending order for later retrieval.
   * @param {{items: Array, customerId?: string, customerName?: string,
   *         payments?: Array, note?: string}} orderData
   * @returns {{holdId: string, heldAt: number}}
   */
  holdOrder(orderData) {
    const holdId = uuidv4();
    const held = {
      holdId,
      items: orderData.items || [],
      customerId: orderData.customerId || null,
      customerName: orderData.customerName || null,
      payments: orderData.payments || [],
      note: orderData.note || '',
      heldAt: Date.now(),
    };
    this._holds.set(holdId, held);
    this.emit('order_held', held);
    return { holdId, heldAt: held.heldAt };
  }

  /**
   * Retrieve all held orders.
   * @returns {Array}
   */
  listHeldOrders() {
    return Array.from(this._holds.values()).map(h => ({
      holdId: h.holdId,
      customerName: h.customerName,
      itemCount: h.items.length,
      total: h.items.reduce((s, i) => s + (i.unitPrice || 0) * (i.quantity || 1), 0),
      note: h.note,
      heldAt: h.heldAt,
    }));
  }

  /**
   * Retrieve a specific held order by ID (and optionally remove it).
   * @param {string} holdId
   * @param {boolean} [remove=true]
   * @returns {object|null}
   */
  unholdOrder(holdId, remove = true) {
    const held = this._holds.get(holdId);
    if (!held) return null;
    if (remove) this._holds.delete(holdId);
    this.emit('order_unheld', held);
    return held;
  }

  // ── Receipt ────────────────────────────────────────────────────

  /**
   * Retrieve receipt data for a completed sale.
   * @param {string} saleId
   * @returns {object|null}
   */
  getReceiptData(saleId) {
    const sale = this._sales.get(saleId);
    if (!sale) return null;
    const ReceiptGenerator = require('./receipt-generator');
    return ReceiptGenerator.buildReceiptData(sale);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  /** @private */
  async _mcp(method, params) {
    // The ERP MCP tools are available via the MCP server — the server.js
    // route handler runs them directly via the tools. This internal method
    // provides a fallback HTTP path if needed (for direct testing / standalone mode).
    const url = `${this.mcpUrl}/api/mcp/${method}`;
    try {
      const res = await axios.post(url, { tenantId: this.tenantId, ...params }, {
        timeout: 10000,
        validateStatus: () => true,
      });
      if (res.status >= 400) {
        throw new Error(`ERP MCP ${method} returned ${res.status}: ${JSON.stringify(res.data)}`);
      }
      return res.data;
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED') {
        throw new Error(`ERP MCP not available (${err.code})`);
      }
      throw err;
    }
  }

  /** @private */
  async _nextReceiptNumber() {
    this._receiptCounter += 1;
    const now = new Date();
    const y = now.getFullYear().toString().slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const seq = String(this._receiptCounter).padStart(5, '0');
    return `POS-${y}${m}${d}-${seq}`;
  }

  /**
   * Get chart of accounts (for POS accounting integration).
   * @returns {Promise<Array>}
   */
  async getChartOfAccounts() {
    const coa = await this._mcp('get_chart_of_accounts', {});
    return Array.isArray(coa) ? coa : (coa.accounts || coa.data || []);
  }
}

module.exports = PosEngine;
