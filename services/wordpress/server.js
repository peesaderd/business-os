/**
 * Business OS — WordPress Module Bridge Service
 *
 * Express server (port 8109) that connects WordPress as a microservice
 * in the Business OS ecosystem with full ERP, Image Gen, Video Gen,
 * and AI integration.
 *
 * Gateway route: /api/wordpress/* → localhost:8109
 * WordPress:  http://localhost:8086
 *
 * Port: 8109
 * Base path: /api/wordpress/v1
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const wpBridge = require('./wordpress-bridge');
const contentGen = require('./content-generator');
const mediaInt = require('./media-integration');
const erpInt = require('./erp-integration');
const templateMgr = require('./template-manager');
const moduleReg = require('./module-registry');

// ─── Setup ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '8109', 10);
const WP_API_URL = process.env.WP_API_URL || 'http://localhost:8086/wp-json/wp/v2';
const WP_ADMIN_USER = process.env.WP_ADMIN_USER || 'admin';
const WP_ADMIN_PASS = process.env.WP_ADMIN_PASS || 'Admin@2026';

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));

// Serve static files
app.use('/storage', express.static(path.join(__dirname, 'data')));

// ─── Initialize Modules ────────────────────────────────────────────

let wpClient = null;

async function init() {
  wpClient = wpBridge.createClient(WP_API_URL, WP_ADMIN_USER, WP_ADMIN_PASS);

  // Auth with WordPress
  try {
    const token = await wpClient.authenticate();
    console.log(`[wordpress] Authenticated — token acquired`);
  } catch (err) {
    console.warn(`[wordpress] Auth failed (will retry): ${err.message}`);
  }

  // Register ERP module
  try {
    await moduleReg.register();
    console.log(`[wordpress] Module registered in ERP`);
  } catch (err) {
    console.warn(`[wordpress] Module registration: ${err.message}`);
  }
}

// ─── Health ─────────────────────────────────────────────────────────

app.get('/api/wordpress/v1/health', async (req, res) => {
  const wpStatus = wpClient ? await wpClient.health().catch(e => ({ error: e.message })) : { status: 'disconnected' };
  res.json({
    status: 'ok',
    service: 'business-os-wordpress-module',
    version: process.env.MODULE_VERSION || '0.1.0',
    uptime: process.uptime(),
    timestamp: Date.now(),
    wordpress: wpStatus,
  });
});

// ─── WordPress CRUD ────────────────────────────────────────────────

// Posts
app.get('/api/wordpress/v1/posts', async (req, res) => {
  try {
    const posts = await wpClient.getPosts(req.query);
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/wordpress/v1/posts/:id', async (req, res) => {
  try {
    const post = await wpClient.getPost(req.params.id);
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/posts', async (req, res) => {
  try {
    const post = await wpClient.createPost(req.body);
    res.status(201).json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/wordpress/v1/posts/:id', async (req, res) => {
  try {
    const post = await wpClient.updatePost(req.params.id, req.body);
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/wordpress/v1/posts/:id', async (req, res) => {
  try {
    await wpClient.deletePost(req.params.id);
    res.status(204).end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pages (same pattern)
app.get('/api/wordpress/v1/pages', async (req, res) => {
  try { res.json(await wpClient.getPages(req.query)); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/wordpress/v1/pages/:id', async (req, res) => {
  try { res.json(await wpClient.getPage(req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/pages', async (req, res) => {
  try { const page = await wpClient.createPage(req.body); res.status(201).json(page); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/wordpress/v1/pages/:id', async (req, res) => {
  try { res.json(await wpClient.updatePage(req.params.id, req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/wordpress/v1/pages/:id', async (req, res) => {
  try { await wpClient.deletePage(req.params.id); res.status(204).end(); } catch (err) { res.status(500).json({ error: err.message }); }
});

// Media
app.get('/api/wordpress/v1/media', async (req, res) => {
  try { res.json(await wpClient.getMedia(req.query)); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/media', async (req, res) => {
  try {
    const { url, title, alt } = req.body;
    const result = await wpClient.importMediaFromUrl(url, title, alt);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Categories / Tags
app.get('/api/wordpress/v1/categories', async (req, res) => {
  try { res.json(await wpClient.getCategories()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/categories', async (req, res) => {
  try { res.status(201).json(await wpClient.createCategory(req.body.name, req.body.slug)); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/wordpress/v1/tags', async (req, res) => {
  try { res.json(await wpClient.getTags()); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── AI Content Generation ─────────────────────────────────────────

app.post('/api/wordpress/v1/ai/generate-post', async (req, res) => {
  try {
    const { topic, keywords, tone, category, template, featuredImage } = req.body;
    const result = await contentGen.generatePost({
      topic,
      keywords: keywords || [],
      tone: tone || 'professional',
      category,
      template: template || 'default',
      featuredImage,
      wpClient,
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/ai/generate-page', async (req, res) => {
  try {
    const { title, sections, tone } = req.body;
    const result = await contentGen.generatePage({ title, sections: sections || [], tone, wpClient });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/ai/rewrite', async (req, res) => {
  try {
    const { postId, tone } = req.body;
    const result = await contentGen.rewritePost(postId, tone || 'professional', wpClient);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/ai/translate', async (req, res) => {
  try {
    const { postId, language } = req.body;
    const result = await contentGen.translatePost(postId, language, wpClient);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Media Generation (Image Gen + Video Gen) ──────────────────────

app.post('/api/wordpress/v1/media/generate-image', async (req, res) => {
  try {
    const { prompt, style, postId } = req.body;
    const result = await mediaInt.generateFeaturedImage(prompt, style, postId, wpClient);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/media/generate-product-image', async (req, res) => {
  try {
    const { productId, prompt } = req.body;
    const result = await mediaInt.generateProductImage(productId, prompt);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/media/generate-video', async (req, res) => {
  try {
    const { prompt, postId } = req.body;
    const result = await mediaInt.generatePostVideo(prompt, postId, wpClient);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/media/batch-generate', async (req, res) => {
  try {
    const { items } = req.body; // [{prompt, type: 'image'|'video'}]
    const results = await mediaInt.batchGenerate(items);
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ERP Integration ───────────────────────────────────────────────

app.get('/api/wordpress/v1/erp/products', async (req, res) => {
  try {
    const products = await erpInt.getProducts();
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/wordpress/v1/erp/products/:id', async (req, res) => {
  try {
    const product = await erpInt.getProduct(req.params.id);
    res.json(product);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/erp/sync-products', async (req, res) => {
  try {
    const result = await erpInt.syncProductsToWp(wpClient);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/wordpress/v1/erp/dashboard', async (req, res) => {
  try {
    const data = await erpInt.getDashboardData();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/erp/order-from-wp', async (req, res) => {
  try {
    const { wpOrderId } = req.body;
    const result = await erpInt.syncOrderToErp(wpOrderId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Templates ─────────────────────────────────────────────────────

app.get('/api/wordpress/v1/templates', async (req, res) => {
  try {
    const templates = await templateMgr.listTemplates();
    res.json(templates);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/templates', async (req, res) => {
  try {
    const tmpl = await templateMgr.createTemplate(req.body);
    res.status(201).json(tmpl);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/wordpress/v1/templates/:name/render', async (req, res) => {
  try {
    const content = await templateMgr.renderTemplate(req.params.name, req.body);
    res.json({ content });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Module Registration Info ──────────────────────────────────────

app.get('/api/wordpress/v1/module', async (req, res) => {
  res.json({
    name: process.env.MODULE_NAME || 'wordpress',
    version: process.env.MODULE_VERSION || '0.1.0',
    publicUrl: process.env.PUBLIC_URL || 'http://localhost:8086',
    apiUrl: `http://localhost:${PORT}/api/wordpress/v1`,
    services: ['content', 'media', 'erp', 'templates', 'ai'],
    status: wpClient ? 'connected' : 'disconnected',
  });
});

// ─── 404 ───────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// ─── Start ─────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Business OS — WordPress Module listening on port ${PORT}`);
  console.log(`  WordPress proxy:    ${WP_API_URL}`);
  console.log(`  Image Gen service:  ${process.env.IMAGE_GEN_URL || 'not set'}`);
  console.log(`  Video Gen service:  ${process.env.VIDEO_GEN_URL || 'not set'}`);
  console.log(`  ERP MCP endpoint:   ${process.env.ERP_MCP_URL || 'not set'}`);
  console.log(`  Gateway:            ${process.env.GATEWAY_URL || 'http://localhost:8088'}`);
  init().catch(console.error);
});
