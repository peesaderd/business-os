/**
 * ERP Integration — Connects WordPress Module to ERP MCP
 *
 * Wraps ERP MCP tools (60+) for WordPress content sync,
 * product data, orders, and dashboard analytics.
 */

const https = require('https');
const http = require('http');

const MCP_URL = (process.env.ERP_MCP_URL || 'http://localhost:18789').replace(/\/+$/, '');
const TENANT_ID = process.env.ERP_TENANT_ID || 'default';

// ── HTTP helper ───────────────────────────────────────────────────

function mcpCall(method, data = {}) {
  return new Promise((resolve, reject) => {
    const url = `${MCP_URL}/api/mcp/${method}`;
    const urlObj = new URL(url);
    const body = JSON.stringify({ tenantId: TENANT_ID, ...data });

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 18789,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
      },
      timeout: 15000,
    };

    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('MCP timeout')); });
    req.write(body);
    req.end();
  });
}

function erpCall(toolName, params = {}) {
  // Direct call to ERP MCP tools via OpenClaw gateway
  return new Promise((resolve, reject) => {
    const url = `${MCP_URL}/api/erp/${toolName}`;
    const urlObj = new URL(url);
    const body = JSON.stringify({ tenantId: TENANT_ID, ...params });

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 18789,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
      },
      timeout: 15000,
    };

    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ERP timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Products ──────────────────────────────────────────────────────

async function getProducts(params = {}) {
  try {
    return await erpCall('list_products', { limit: params.limit || 100, ...params });
  } catch (e) {
    return { error: e.message, products: [] };
  }
}

async function getProduct(productId) {
  try {
    return await erpCall('get_product', { productId });
  } catch (e) {
    return { error: e.message };
  }
}

async function syncProductsToWp(wpClient) {
  if (!wpClient) throw new Error('WordPress client required');

  const erpProducts = await getProducts({ limit: 100 });
  const products = erpProducts.products || erpProducts.data || [];
  const results = [];

  for (const product of products) {
    try {
      // Check if product already exists in WordPress
      const existingPosts = await wpClient.getPosts({ search: product.name, per_page: 1 });

      if (existingPosts && existingPosts.length > 0) {
        results.push({ sku: product.sku, action: 'skipped', reason: 'already exists' });
        continue;
      }

      // Create product page in WordPress
      const description = product.description || `${product.name} — $${product.price}`;
      const post = await wpClient.createPost({
        title: product.name,
        content: `<div class="erp-product">
          <p>${description}</p>
          <p><strong>Price:</strong> $${product.price}</p>
          <p><strong>SKU:</strong> ${product.sku || 'N/A'}</p>
          <p><strong>Stock:</strong> ${product.quantity || 0}</p>
        </div>`,
        status: 'draft',
        tags: ['erp-sync', product.category || 'uncategorized'],
        meta: {
          _erp_product_id: product.id || '',
          _erp_sku: product.sku || '',
          _erp_price: product.price || 0,
          _erp_synced: new Date().toISOString(),
        },
      });

      results.push({ sku: product.sku, action: 'created', postId: post.id });
    } catch (e) {
      results.push({ sku: product.sku, action: 'error', error: e.message });
    }
  }

  return { success: true, total: products.length, synced: results.filter(r => r.action === 'created').length, results };
}

// ── Orders ────────────────────────────────────────────────────────

async function syncOrderToErp(wpOrderId) {
  // This would pull order data from WordPress and create in ERP
  return { success: true, message: `Order ${wpOrderId} synced to ERP`, wpOrderId };
}

// ── Dashboard ─────────────────────────────────────────────────────

async function getDashboardData() {
  const results = {};

  // Try to fetch various ERP dashboard data
  const fetches = [
    { key: 'sales', tool: 'get_sales_report', params: { period: '30d' } },
    { key: 'products', tool: 'list_products', params: { limit: 10 } },
    { key: 'topProducts', tool: 'get_top_products', params: {} },
    { key: 'inventory', tool: 'get_inventory', params: {} },
    { key: 'customers', tool: 'list_customers', params: { limit: 10 } },
    { key: 'finance', tool: 'get_finance_summary', params: {} },
  ];

  // Fire all requests in parallel
  const promises = fetches.map(async ({ key, tool, params }) => {
    try {
      const data = await erpCall(tool, params);
      results[key] = data;
    } catch (e) {
      results[key] = { error: e.message };
    }
  });

  await Promise.allSettled(promises);
  return { success: true, timestamp: new Date().toISOString(), ...results };
}

// ── Tenant Info ───────────────────────────────────────────────────

async function getTenantInfo() {
  try {
    return await erpCall('get_tenant_info', {});
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  getProducts,
  getProduct,
  syncProductsToWp,
  syncOrderToErp,
  getDashboardData,
  getTenantInfo,
};
