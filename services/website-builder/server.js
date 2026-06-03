/**
 * server.js — AI Website Builder Service
 *
 * Express server providing the REST API for AI-powered website generation,
 * management, publishing, and export.
 *
 * Port: 8120
 * Routes:
 *   GET    /api/website/v1/health
 *   POST   /api/website/v1/generate
 *   GET    /api/website/v1/sites
 *   GET    /api/website/v1/sites/:id
 *   PUT    /api/website/v1/sites/:id
 *   DELETE /api/website/v1/sites/:id
 *   POST   /api/website/v1/sites/:id/publish
 *   GET    /api/website/v1/templates
 *   POST   /api/website/v1/export
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { getManager } = require('./site-manager');

const app = express();
const PORT = process.env.PORT || 8120;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Serve published static sites
app.use('/published', express.static(path.join(__dirname, 'published')));

// ─── Routes ────────────────────────────────────────────────────────────────────

const manager = getManager();

/**
 * GET /api/website/v1/health
 * Health check endpoint.
 */
app.get('/api/website/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'business-os-website-builder',
    version: '0.1.0',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

/**
 * POST /api/website/v1/generate
 * Generate a new website from a natural language prompt.
 *
 * Body:
 *   { prompt: string, businessType?: string, template?: string }
 *
 * The template field supports:
 *   "business-landing", "portfolio", "ecommerce", "saas", "service"
 * Defaults to "business-landing" if not provided.
 *
 * Returns the full site object.
 */
app.post('/api/website/v1/generate', async (req, res) => {
  try {
    const { prompt, businessType, template } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: '"prompt" is required and must be a non-empty string.',
      });
    }

    const site = await manager.createFromPrompt(prompt.trim(), template || 'business-landing', businessType || '');

    console.log(`[Server] Generated site "${site.name}" (${site.id}) from prompt: "${prompt.substring(0, 80)}..."`);

    // ERP MCP integration: track site creation
    _trackSiteCreation(site).catch(err => {
      console.warn('[Server] ERP tracking skipped:', err.message);
    });

    res.status(201).json({
      success: true,
      site,
    });
  } catch (err) {
    console.error('[Server] Generate error:', err);
    res.status(500).json({
      error: 'GenerationError',
      message: err.message,
    });
  }
});

/**
 * GET /api/website/v1/sites
 * List all generated websites with summary info.
 */
app.get('/api/website/v1/sites', (req, res) => {
  try {
    const sites = manager.listSites();
    res.json({ success: true, count: sites.length, sites });
  } catch (err) {
    console.error('[Server] List sites error:', err);
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

/**
 * GET /api/website/v1/sites/:id
 * Get a single site with full data (sections, styles, content).
 */
app.get('/api/website/v1/sites/:id', (req, res) => {
  try {
    const site = manager.getSite(req.params.id);
    if (!site) {
      return res.status(404).json({ error: 'NotFound', message: `Site "${req.params.id}" not found.` });
    }
    res.json({ success: true, site });
  } catch (err) {
    console.error('[Server] Get site error:', err);
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

/**
 * PUT /api/website/v1/sites/:id
 * Update a site (replace sections, styles, or metadata).
 *
 * Body: { sections?, styles?, name?, businessType? }
 */
app.put('/api/website/v1/sites/:id', (req, res) => {
  try {
    const { sections, styles, name, businessType, template } = req.body;
    const updates = {};

    if (sections !== undefined) updates.sections = sections;
    if (styles !== undefined) updates.styles = styles;
    if (name !== undefined) updates.name = name;
    if (businessType !== undefined) updates.businessType = businessType;
    if (template !== undefined) updates.template = template;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'ValidationError', message: 'No valid fields to update.' });
    }

    const site = manager.updateSite(req.params.id, updates);
    if (!site) {
      return res.status(404).json({ error: 'NotFound', message: `Site "${req.params.id}" not found.` });
    }

    res.json({ success: true, site });
  } catch (err) {
    console.error('[Server] Update site error:', err);
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

/**
 * DELETE /api/website/v1/sites/:id
 * Delete a website entirely.
 */
app.delete('/api/website/v1/sites/:id', (req, res) => {
  try {
    const deleted = manager.deleteSite(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'NotFound', message: `Site "${req.params.id}" not found.` });
    }
    res.json({ success: true, message: `Site "${req.params.id}" deleted.` });
  } catch (err) {
    console.error('[Server] Delete site error:', err);
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

/**
 * POST /api/website/v1/sites/:id/publish
 * Publish a site — generates a static HTML file.
 *
 * Returns the published URL and HTML.
 */
app.post('/api/website/v1/sites/:id/publish', (req, res) => {
  try {
    const result = manager.publishSite(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'NotFound', message: `Site "${req.params.id}" not found.` });
    }

    console.log(`[Server] Published site "${result.site.name}" → ${result.url}`);
    res.json({
      success: true,
      publishedUrl: result.url,
      htmlLength: result.html.length,
      site: result.site,
    });
  } catch (err) {
    console.error('[Server] Publish error:', err);
    res.status(500).json({ error: 'PublishError', message: err.message });
  }
});

/**
 * GET /api/website/v1/templates
 * List all available site templates.
 */
app.get('/api/website/v1/templates', (req, res) => {
  try {
    const templates = manager.listTemplates();
    res.json({ success: true, count: templates.length, templates });
  } catch (err) {
    console.error('[Server] List templates error:', err);
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

/**
 * POST /api/website/v1/export
 * Export a site in the specified format.
 *
 * Body: { siteId: string, format?: "html" | "react" }
 */
app.post('/api/website/v1/export', (req, res) => {
  try {
    const { siteId, format } = req.body;

    if (!siteId) {
      return res.status(400).json({ error: 'ValidationError', message: '"siteId" is required.' });
    }

    const validFormats = ['html', 'react'];
    const exportFormat = format && validFormats.includes(format) ? format : 'html';

    const result = manager.exportSite(siteId, exportFormat);
    if (!result) {
      return res.status(404).json({ error: 'NotFound', message: `Site "${siteId}" not found.` });
    }

    // For HTML export, optionally set content-type for direct download
    if (exportFormat === 'html') {
      res.json({
        success: true,
        format: 'html',
        html: result.html,
        size: result.html.length,
      });
    } else {
      res.json({
        success: true,
        format: 'react',
        componentName: result.componentName,
        sections: result.sections,
        imports: result.imports,
        styles: result.styles,
      });
    }
  } catch (err) {
    console.error('[Server] Export error:', err);
    res.status(500).json({ error: 'ExportError', message: err.message });
  }
});

// ─── Section Re-generation Endpoint ────────────────────────────────────────────

/**
 * POST /api/website/v1/sites/:id/sections/:index/regenerate
 * Regenerate a single section using AI.
 *
 * Body: { prompt: string }
 */
app.post('/api/website/v1/sites/:id/sections/:index/regenerate', async (req, res) => {
  try {
    const { id, index } = req.params;
    const { prompt } = req.body;
    const sectionIndex = parseInt(index, 10);

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'ValidationError', message: '"prompt" is required.' });
    }

    const updatedSection = await manager.regenerateSection(id, sectionIndex, prompt);
    if (!updatedSection) {
      return res.status(404).json({ error: 'NotFound', message: `Site "${id}" not found.` });
    }

    res.json({ success: true, section: updatedSection });
  } catch (err) {
    console.error('[Server] Regenerate section error:', err);
    res.status(500).json({ error: 'RegenerationError', message: err.message });
  }
});

// ─── ERP MCP Integration ──────────────────────────────────────────────────────

/**
 * Track site creation for campaign/marketing integration.
 */
async function _trackSiteCreation(site) {
  // This is a fire-and-forget integration with ERP MCP tools.
  // It runs in the background and won't block site generation.
  const tenantId = process.env.DEFAULT_TENANT_ID || 'default';

  try {
    // Attempt to auto-populate products if the site has a products section
    if (hasSectionType(site, 'products')) {
      try {
        const axios = require('axios');
        const erpUrl = process.env.ERP_MCP_URL || 'http://localhost:3000';
        const resp = await axios.get(`${erpUrl}/api/products?tenantId=${tenantId}`, { timeout: 5000 });
        const products = resp.data?.products || resp.data || [];
        if (products.length > 0) {
          // Update site with real product data
          const productSection = site.sections.find(s => s.type === 'products');
          if (productSection) {
            productSection.content.items = products.slice(0, 9).map((p, i) => ({
              name: p.name || `Product ${i + 1}`,
              description: p.description || '',
              price: p.price ? `$${p.price}` : '',
              imageUrl: p.imageUrl || '',
              category: p.category || 'General',
            }));
            manager.updateSite(site.id, { sections: site.sections });
          }
        }
      } catch (e) {
        console.warn('[ERP] Product fetch skipped:', e.message);
      }
    }

    // Fetch customer insights for personalization hints
    try {
      const axios = require('axios');
      const erpUrl = process.env.ERP_MCP_URL || 'http://localhost:3000';
      await axios.get(`${erpUrl}/api/customer-insights?tenantId=${tenantId}`, { timeout: 3000 });
    } catch (e) {
      // Optional enhancement
    }

    // Track as campaign creation
    try {
      const axios = require('axios');
      const erpUrl = process.env.ERP_MCP_URL || 'http://localhost:3000';
      await axios.post(`${erpUrl}/api/campaigns`, {
        tenantId,
        name: `Site: ${site.name}`,
        type: 'multi',
        description: `Auto-generated website from prompt: ${site.prompt?.substring(0, 100)}`,
        budget: 0,
        startDate: Date.now(),
      }, { timeout: 3000 });
    } catch (e) {
      // Optional
    }
  } catch (err) {
    console.warn('[ERP] Integration skipped:', err.message);
  }
}

function hasSectionType(site, type) {
  return (site.sections || []).some(s => s.type === type);
}

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    error: 'InternalServerError',
    message: process.env.NODE_ENV === 'production' ? 'An internal error occurred.' : err.message,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          AI Website Builder Service v0.1.0           ║
║          Business OS - Prompt to Website              ║
╠══════════════════════════════════════════════════════╣
║  Running on: http://0.0.0.0:${PORT.toString().padEnd(5)}                  ║
║  Health:    http://localhost:${PORT}/api/website/v1/health      ║
║  Generate:  POST /api/website/v1/generate             ║
║  Templates: GET  /api/website/v1/templates            ║
║  Sites:     GET  /api/website/v1/sites                ║
║  Publish:   POST /api/website/v1/sites/:id/publish    ║
║  Export:    POST /api/website/v1/export               ║
╚══════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
