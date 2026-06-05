/**
 * ERP Bridge — เชื่อมต่อกับ ERP MCP สำหรับสร้าง Invoice
 */
const http = require('http');
const https = require('https');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  /**
   * สร้าง AR Invoice ใน ERP MCP
   */
  async createArInvoice({ customerName, customerEmail, amount, description, metadata }) {
    try {
      // ERP MCP is at port 18789
      const postData = JSON.stringify({
        tenantId: 'default',
        customerId: metadata?.customerId || 'wpilot-' + uuidv4().slice(0, 8),
        invoiceNumber: `INV-WPILOT-${Date.now()}`,
        amount,
        dueDate: Math.floor(Date.now() / 1000) + 30 * 86400,
        notes: description || 'WPilot Subscription',
      });

      return new Promise((resolve, reject) => {
        const url = new URL(config.erpMcp.url);
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request({
          hostname: url.hostname,
          port: url.port || 18789,
          path: '/api/erp/ar-invoice',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 10000,
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { resolve({ raw: body }); }
          });
        });
        req.on('error', (e) => {
          // ERP MCP might not be available — mock it
          resolve({ mocked: true, invoiceNumber: `MOCK-${Date.now()}`, amount });
        });
        req.write(postData);
        req.end();
      });
    } catch (e) {
      return { mocked: true, invoiceNumber: `MOCK-${Date.now()}`, amount, error: e.message };
    }
  },

  /**
   * อัปเดต plan ใน WPilot Engine
   */
  async updateWpilotPlan({ customerId, planId }) {
    try {
      const fetch = global.fetch || require('node-fetch');
      const res = await fetch(`${config.wpilot.apiUrl}/admin/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      return res.ok ? await res.json() : { error: 'Failed' };
    } catch (e) {
      return { error: e.message };
    }
  },
};
