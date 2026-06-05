/**
 * Module Registry — Registers WordPress as a module in Business OS ERP
 *
 * Each service in Business OS registers itself so the ERP system
 * knows its capabilities, endpoints, and integration points.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MCP_URL = (process.env.ERP_MCP_URL || 'http://localhost:18789').replace(/\/+$/, '');
const TENANT_ID = process.env.ERP_TENANT_ID || 'default';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8088';
const REGISTRY_FILE = path.join(__dirname, 'data', 'modules', 'registration.json');

// ── Module Manifest ───────────────────────────────────────────────

function getManifest() {
  return {
    name: process.env.MODULE_NAME || 'wordpress',
    version: process.env.MODULE_VERSION || '0.1.0',
    type: 'content-management',
    description: 'AI-powered WordPress content management integrated with ERP, Image Gen, and Video Gen',
    publicUrl: process.env.PUBLIC_URL || 'http://89.167.82.205:8086',
    apiUrl: `http://localhost:${process.env.PORT || '8109'}/api/wordpress/v1`,
    gatewayUrl: `${GATEWAY_URL}/api/wordpress/v1`,
    status: 'active',
    registeredAt: new Date().toISOString(),
    tenantId: TENANT_ID,

    // Capabilities this module provides
    capabilities: [
      { name: 'content-management', description: 'WordPress content CRUD via REST API' },
      { name: 'ai-content-generation', description: 'AI-powered blog post and page creation' },
      { name: 'ai-rewrite', description: 'Rewrite existing content in different tones' },
      { name: 'ai-translate', description: 'Translate content to multiple languages' },
      { name: 'image-generation', description: 'Generate featured images via Image Gen service' },
      { name: 'product-image-generation', description: 'Generate product images from ERP data' },
      { name: 'video-generation', description: 'Generate product videos via Video Gen service' },
      { name: 'media-gallery', description: 'Generate complete product image galleries' },
      { name: 'erp-product-sync', description: 'Sync ERP products to WordPress as content' },
      { name: 'erp-dashboard', description: 'ERP dashboard data embedded in WordPress' },
      { name: 'content-templates', description: 'Predefined content templates for AI generation' },
      { name: 'batch-media', description: 'Batch generate images and videos' },
    ],

    // Dependencies on other services
    dependencies: [
      { service: 'image-gen', required: false, description: 'Image generation for featured images' },
      { service: 'video-gen', required: false, description: 'Video generation for content' },
      { service: 'erp-mcp', required: true, description: 'ERP data and operations' },
    ],

    // Registered endpoints
    endpoints: [
      { path: '/api/wordpress/v1/health', method: 'GET', description: 'Health check' },
      { path: '/api/wordpress/v1/posts', method: 'GET/POST', description: 'List/create posts' },
      { path: '/api/wordpress/v1/posts/:id', method: 'GET/PUT/DELETE', description: 'Post CRUD' },
      { path: '/api/wordpress/v1/pages', method: 'GET/POST', description: 'List/create pages' },
      { path: '/api/wordpress/v1/media', method: 'GET/POST', description: 'Media management' },
      { path: '/api/wordpress/v1/ai/generate-post', method: 'POST', description: 'AI-generated blog post' },
      { path: '/api/wordpress/v1/ai/generate-page', method: 'POST', description: 'AI-generated page' },
      { path: '/api/wordpress/v1/ai/rewrite', method: 'POST', description: 'Rewrite content with AI' },
      { path: '/api/wordpress/v1/ai/translate', method: 'POST', description: 'Translate content with AI' },
      { path: '/api/wordpress/v1/media/generate-image', method: 'POST', description: 'Generate featured image' },
      { path: '/api/wordpress/v1/media/generate-product-image', method: 'POST', description: 'Generate product image' },
      { path: '/api/wordpress/v1/media/generate-video', method: 'POST', description: 'Generate post video' },
      { path: '/api/wordpress/v1/erp/products', method: 'GET', description: 'Get ERP products' },
      { path: '/api/wordpress/v1/erp/sync-products', method: 'POST', description: 'Sync ERP products to WP' },
      { path: '/api/wordpress/v1/erp/dashboard', method: 'GET', description: 'Get ERP dashboard data' },
      { path: '/api/wordpress/v1/templates', method: 'GET/POST', description: 'Content templates' },
      { path: '/api/wordpress/v1/module', method: 'GET', description: 'Module registration info' },
    ],
  };
}

// ── Register with ERP ─────────────────────────────────────────────

async function register() {
  const manifest = getManifest();

  // Save locally
  fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(manifest, null, 2));

  // Try to register with ERP MCP
  try {
    const result = await apiCall('/api/modules/register', manifest);
    console.log(`[module-registry] ERP registration: ${result.status || 'ok'}`);
    return result;
  } catch (e) {
    // ERP module registration endpoint might not exist yet
    // Save locally for now
    console.log(`[module-registry] Local registration saved (ERP endpoint pending)`);
    return { status: 'local-only', manifest: manifest.name, file: REGISTRY_FILE };
  }
}

// ── HTTP helper ───────────────────────────────────────────────────

function apiCall(path, body) {
  return new Promise((resolve, reject) => {
    const url = `${MCP_URL}${path}`;
    const urlObj = new URL(url);
    const data = JSON.stringify(body);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 18789,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json',
        'X-API-Key': process.env.ERP_INTERNAL_KEY || 'bos-internal-dev-key-2026',
      },
      timeout: 10000,
    };

    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let result = '';
      res.on('data', (chunk) => result += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(result)); }
        catch (e) { resolve({ status: 'sent' }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Get Registration Info ─────────────────────────────────────────

function getRegistration() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
    }
  } catch (e) {}
  return getManifest();
}

module.exports = { register, getManifest, getRegistration };
