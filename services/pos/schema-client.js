'use strict';

/**
 * Schema Engine Client for POS Service
 *
 * Connects POS to Schema Engine (port 8100) using Pattern A — Direct HTTP.
 * Pushes completed sales, refunds, and payments to Schema Engine asynchronously.
 *
 * Schema Engine POS order template: pos_order
 * Schema Engine Member template: member
 *
 * All pushes are fire-and-forget — errors are logged but never crash the POS.
 */

const axios = require('axios');

const SCHEMA_ENGINE_URL = process.env.SCHEMA_ENGINE_URL || 'http://localhost:8100';

/**
 * @class SchemaClient
 */
class SchemaClient {
  constructor() {
    this.baseUrl = SCHEMA_ENGINE_URL;
    this.healthy = false;
  }

  // ── Health ──────────────────────────────────────────────────────

  /**
   * Check if Schema Engine is reachable.
   * Called on startup and periodically.
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, { timeout: 3000 });
      this.healthy = res.data?.status === 'ok';
      return this.healthy;
    } catch {
      this.healthy = false;
      return false;
    }
  }

  // ── Sale ────────────────────────────────────────────────────────

  /**
   * Push a completed sale to Schema Engine pos_order.
   * Async + fire-and-forget — never blocks POS response.
   *
   * @param {object} sale  — sale object from PosEngine.createSale()
   * @returns {Promise<void>}
   */
  async pushSale(sale) {
    if (!sale || !sale.saleId) return;

    const paymentMethod = (sale.payments && sale.payments.length > 0)
      ? sale.payments[0].method
      : 'cash';

    try {
      await axios.post(`${this.baseUrl}/api/v1/data/pos_order`, {
        order_number: sale.receiptNumber,
        customer_name: sale.customerName || 'Walk-in Customer',
        customer_id: sale.customerId || undefined,
        phone: sale.customerPhone || '',
        items: (sale.items || []).map(i => ({
          productId: i.productId,
          name: i.name,
          qty: i.quantity,
          price: i.unitPrice,
        })),
        subtotal: sale.subtotal || 0,
        discount: sale.discountTotal || 0,
        tax: sale.taxTotal || 0,
        grand_total: sale.grandTotal || 0,
        payment_method: paymentMethod,
        payment_status: 'paid',
        status: sale.status || 'completed',
        erp_order_id: sale.erpOrderId || '',
        notes: sale.notes || '',
      }, { timeout: 5000 });

      console.log(`[SchemaClient] Sale ${sale.receiptNumber} pushed to Schema Engine`);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED') {
        console.warn(`[SchemaClient] Schema Engine not available, sale ${sale.receiptNumber} queued for retry`);
      } else {
        console.warn(`[SchemaClient] Failed to push sale ${sale.receiptNumber}: ${err.message}`);
      }
    }
  }

  /**
   * Push a refund to Schema Engine reward_ledger (negative transaction).
   * Async + fire-and-forget.
   *
   * @param {object} refund  — refund object from PosEngine.processRefund()
   * @returns {Promise<void>}
   */
  async pushRefund(refund) {
    if (!refund || !refund.refundId) return;

    try {
      await axios.post(`${this.baseUrl}/api/v1/data/reward_ledger`, {
        member_id: refund.customerId || undefined,
        type: 'redeem',
        points: -(refund.refundAmount || 0),
        balance_after: 0,
        reference_type: 'pos_order',
        reference_id: refund.saleId || '',
        description: `Refund: ${refund.reason || 'Customer return'}`,
      }, { timeout: 5000 });

      console.log(`[SchemaClient] Refund ${refund.refundId} pushed to Schema Engine`);
    } catch (err) {
      console.warn(`[SchemaClient] Failed to push refund ${refund.refundId}: ${err.message}`);
    }
  }

  // ── Member ──────────────────────────────────────────────────────

  /**
   * Upsert a customer/member to Schema Engine member schema.
   * Async + fire-and-forget.
   *
   * @param {object} customer  — customer from ERP (has id, name, phone, email, ...)
   * @returns {Promise<void>}
   */
  async upsertCustomer(customer) {
    if (!customer || !customer.id) return;

    try {
      // Check if member already exists by erp_id
      const existing = await axios.get(
        `${this.baseUrl}/api/v1/data/member`,
        { params: { erp_id: String(customer.id), limit: 1 }, timeout: 3000 }
      );

      if (existing.data?.data?.length > 0) {
        // Member exists — update fields from ERP
        const memberId = existing.data.data[0].id;
        await axios.put(
          `${this.baseUrl}/api/v1/data/member/${memberId}`,
          {
            full_name: customer.name || customer.full_name || '',
            phone: customer.phone || '',
            email: customer.email || '',
            points: customer.points || customer.rewardPoints || 0,
            tier: customer.tier || 'bronze',
            is_active: customer.is_active !== false,
          },
          { timeout: 5000 }
        );
      } else {
        // New member — create
        await axios.post(`${this.baseUrl}/api/v1/data/member`, {
          erp_id: String(customer.id),
          full_name: customer.name || customer.full_name || '',
          phone: customer.phone || '',
          email: customer.email || '',
          points: customer.points || customer.rewardPoints || 0,
          tier: customer.tier || 'bronze',
          is_active: customer.is_active !== false,
        }, { timeout: 5000 });
      }

      console.log(`[SchemaClient] Customer ${customer.id} synced to Schema Engine`);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED') {
        console.warn(`[SchemaClient] Schema Engine not available, customer ${customer.id} not synced`);
      } else {
        console.warn(`[SchemaClient] Failed to sync customer ${customer.id}: ${err.message}`);
      }
    }
  }
}

module.exports = SchemaClient;
