'use strict';

/**
 * ERP Core MCP Client
 *
 * Talks to ERP Core MCP (localhost:18789) to read members, products,
 * rewards, and other core business data. Used by Template loaders
 * (e.g. Member template) to validate/seed data from ERP.
 *
 * Falls back gracefully when ERP is offline.
 */

const axios = require('axios');

const MCP_URL = process.env.ERP_MCP_URL || 'http://localhost:18789';
const TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default';
const REQUEST_TIMEOUT = parseInt(process.env.ERP_MCP_TIMEOUT, 10) || 8000;

/**
 * Call an MCP tool on the ERP Core server.
 * @param {string} method  Tool name
 * @param {object} params  Tool parameters
 * @returns {Promise<object|null>}  Response data or null on failure
 */
async function callMcp(method, params = {}) {
  try {
    const url = `${MCP_URL}/api/mcp/${method}`;
    const res = await axios.post(url, { tenantId: TENANT_ID, ...params }, {
      timeout: REQUEST_TIMEOUT,
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      console.warn(`[ERP] MCP ${method} returned ${res.status}:`, res.data?.error || res.statusText);
      return null;
    }
    return res.data;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED') {
      console.warn(`[ERP] MCP not available (${err.code})`);
      return null;
    }
    console.warn(`[ERP] MCP ${method} error:`, err.message);
    return null;
  }
}

/**
 * Search members by phone, name, or email
 * @param {string} query
 * @returns {Promise<Array>}
 */
async function searchMembers(query) {
  const data = await callMcp('list_customers', { search: query });
  if (!data) return [];
  return Array.isArray(data) ? data : (data.customers || data.data || []);
}

/**
 * Get member by ERP customer ID
 * @param {string} customerId
 * @returns {Promise<object|null>}
 */
async function getMemberById(customerId) {
  if (!customerId) return null;
  const data = await callMcp('get_customer', { customerId });
  return data || null;
}

/**
 * Get member rewards/points
 * @param {string} customerId
 * @returns {Promise<Array>}
 */
async function getMemberRewards(customerId) {
  if (!customerId) return [];
  const data = await callMcp('get_customer_rewards', { customerId });
  if (!data) return [];
  return Array.isArray(data) ? data : (data.rewards || data.data || []);
}

/**
 * Create a new member in ERP Core
 * @param {object} memberData  { name, phone, email, ... }
 * @returns {Promise<object|null>}
 */
async function createMember(memberData) {
  const data = await callMcp('create_customer', memberData);
  return data || null;
}

/**
 * Check if ERP MCP is reachable
 * @returns {Promise<boolean>}
 */
async function health() {
  try {
    const data = await callMcp('get_inventory', { lowStockOnly: false });
    return data !== null;
  } catch {
    return false;
  }
}

module.exports = {
  callMcp,
  searchMembers,
  getMemberById,
  getMemberRewards,
  createMember,
  health,
};
