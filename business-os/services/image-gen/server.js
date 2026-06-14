'use strict';

/**
 * Business OS — Image Generation Service
 *
 * Express server on port 8110 offering:
 *  - Image generation (Fal.ai FLUX pipeline)
 *  - Image editing (inpaint)
 *  - Background removal
 *  - Brand asset generation
 *  - Template system with rendering
 *  - Product image generation (ERP MCP integration)
 *
 * Port: 8110
 * Base path: /api/image/v1
 */

require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Read .env before requiring modules to ensure PRODIA_TOKEN is set
const __envPath = __dirname + '/.env';
try {
  const __envContent = require('fs').readFileSync(__envPath, 'utf8');
  for (const __line of __envContent.split('\n')) {
    const idx = __line.indexOf('=');
    if (idx > 0) {
      const k = __line.slice(0, idx);
      const v = __line.slice(idx + 1);
      if (k && !process.env[k]) process.env[k] = v;
    }
  }
} catch (_) {}

// Debug: log key status
console.log('[boot] PRODIA_TOKEN:', process.env.PRODIA_TOKEN ? process.env.PRODIA_TOKEN.length + ' chars' : 'NOT SET');

const imageEngine = require('./image-engine');
const brandManager = require('./brand-manager');
const templateManager = require('./template-manager');

// ─── App Setup ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '8110', 10);
const ERP_MCP_URL = process.env.ERP_MCP_URL || 'http://localhost:18789';
const ERP_TENANT_ID = process.env.ERP_TENANT_ID || 'default';
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, 'storage', 'images');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('[:date[iso]] :method :url :status :response-time ms - :res[content-length] bytes'));

// Serve stored images
app.use('/storage/images', express.static(STORAGE_DIR, {
  maxAge: '7d',
  immutable: true,
}));

// ─── Axios instance for ERP MCP calls ──────────────────────────────────────

const axios = require('axios');
const erpClient = axios.create({
  baseURL: ERP_MCP_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Call an ERP MCP endpoint
 */
async function erpCall(method, params = {}) {
  try {
    const resp = await erpClient.post('/api/mcp', {
      method,
      params: { tenantId: ERP_TENANT_ID, ...params },
    });
    return resp.data;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.warn(`[ERP MCP] ${method} failed:`, typeof detail === 'object' ? JSON.stringify(detail).slice(0, 200) : detail);
    return null;
  }
}

// ─── Health ────────────────────────────────────────────────────────────────

/**
 * GET /api/image/v1/health
 */
app.get('/api/image/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'business-os-image-gen',
    version: '0.1.0',
    provider: 'fal',
    defaultModel: process.env.FAL_DEFAULT_MODEL || 'fast',
    storage: STORAGE_DIR,
    storageExists: fs.existsSync(STORAGE_DIR),
    erpMcpConfigured: !!ERP_MCP_URL,
    falKeyConfigured: !!process.env.FAL_KEY,
    templatesCount: templateManager.listTemplates().length,
    brandProfilesCount: brandManager.listBrandProfiles().length,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// ─── UGC Video Pipeline ────────────────────────────────────────────────────

/**
 * POST /api/image/v1/ugc/generate-frames
 * Generate video keyframes via Prodia UGC pipeline
 *
 * Body:
 *   { productImageUrl: string, scenePrompt?: string, productName?: string,
 *     durationSeconds?: number, fps?: number, resolution?: string,
 *     modelGender?: string, style?: string }
 */
app.post('/api/image/v1/ugc/generate-frames', async (req, res) => {
  try {
    const {
      productImageUrl,
      productName,
      scenePrompt,
      durationSeconds,
      fps,
      resolution,
      modelGender,
      style,
    } = req.body;

    if (!productImageUrl) {
      return res.status(400).json({ error: '"productImageUrl" is required' });
    }

    const result = await imageEngine.ugcGenerateVideo({
      productImageUrl,
      productName: productName || 'product',
      scenePrompt: scenePrompt || '',
      durationSeconds: parseInt(durationSeconds || '16', 10),
      fps: parseFloat(fps || '1'),
      resolution: resolution || '480p',
      modelGender: modelGender || 'female',
      style: style || 'holding',
    });

    res.json(result);
  } catch (err) {
    console.error('[ugc/generate-frames] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/ugc/sam3-segment
 * Run SAM3 on an image
 * Body: { imageUrl: string, prompt?: string }
 */
app.post('/api/image/v1/ugc/sam3-segment', async (req, res) => {
  try {
    const { imageUrl, prompt } = req.body;
    if (!imageUrl) return res.status(400).json({ error: '"imageUrl" is required' });
    const result = await imageEngine.sam3Segment(imageUrl, prompt || 'segment the product in this image');
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/ugc/remove-bg
 * Prodia remove background
 * Body: { imageUrl: string }
 */
app.post('/api/image/v1/ugc/remove-bg', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: '"imageUrl" is required' });
    const result = await imageEngine.prodiaRemoveBackground(imageUrl);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/ugc/mask-bg
 * Prodia mask background (output = mask image)
 * Body: { imageUrl: string }
 */
app.post('/api/image/v1/ugc/mask-bg', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: '"imageUrl" is required' });
    const result = await imageEngine.prodiaMaskBackground(imageUrl);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/ugc/face-restore
 * Prodia face restore
 * Body: { imageUrl: string }
 */
app.post('/api/image/v1/ugc/face-restore', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: '"imageUrl" is required' });
    const result = await imageEngine.prodiaFaceRestore(imageUrl);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Image Generation ──────────────────────────────────────────────────────

/**
 * POST /api/image/v1/generate
 * Generate image(s) from a text prompt
 *
 * Body:
 *   { prompt: string, style?: string, size?: string, count?: number,
 *     aspectRatio?: string, modelTier?: string, upscale?: boolean,
 *     thaiModel?: boolean, tenantId?: string }
 */
app.post('/api/image/v1/generate', async (req, res) => {
  try {
    const {
      prompt,
      style,
      size,
      count,
      aspectRatio,
      modelTier,
      upscale,
      thaiModel,
      tenantId,
      provider,
    } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"prompt" is required and must be a non-empty string',
      });
    }

    const result = await imageEngine.generateImage(prompt.trim(), {
      provider: provider || 'prodia',
      modelTier: modelTier || 'fast',
      aspectRatio: aspectRatio || size || undefined,
      count: parseInt(count || '1', 10),
      upscale: upscale !== false,
      thaiModel: !!thaiModel,
      style: style || undefined,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[generate] Error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Generation failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/image/v1/edit
 * Edit an existing image (inpaint/outpaint)
 *
 * Body: { imageUrl: string, prompt: string, mask?: string, modelTier?: string }
 */
app.post('/api/image/v1/edit', async (req, res) => {
  try {
    const { imageUrl, prompt, mask, modelTier } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: '"imageUrl" is required' });
    }
    if (!prompt) {
      return res.status(400).json({ error: '"prompt" is required' });
    }

    const result = await imageEngine.editImage(imageUrl, prompt, {
      maskUrl: mask,
      modelTier: modelTier || 'fast',
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[edit] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/remove-bg
 * Remove background from an image
 *
 * Body: { imageUrl: string }
 */
app.post('/api/image/v1/remove-bg', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: '"imageUrl" is required' });
    }

    const result = await imageEngine.removeBackground(imageUrl);

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[remove-bg] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/upscale
 * Upscale an image
 *
 * Body: { imageUrl: string, scale?: number, model?: string }
 */
app.post('/api/image/v1/upscale', async (req, res) => {
  try {
    const { imageUrl, scale, model } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: '"imageUrl" is required' });
    }

    const result = await imageEngine.upscaleImage(imageUrl, {
      scale: parseInt(scale || '2', 10),
      model: model || undefined,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[upscale] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/validate
 * Validate an image for Etsy compliance
 *
 * Body: { imageUrl: string }
 */
app.post('/api/image/v1/validate', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: '"imageUrl" is required' });
    }

    const result = await imageEngine.validateImage(imageUrl);

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[validate] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Brand Asset Generation ────────────────────────────────────────────────

/**
 * POST /api/image/v1/brand/generate
 * Generate a brand asset (logo, banner, social post, etc.)
 *
 * Body:
 *   { brandName: string, assetType?: string, colors?: object,
 *     style?: string, industry?: string, brandId?: string, count?: number }
 */
app.post('/api/image/v1/brand/generate', async (req, res) => {
  try {
    const { brandName, brandId, ...brandConfig } = req.body;

    if (!brandName && !brandId) {
      return res.status(400).json({
        error: 'Either "brandName" or "brandId" is required',
      });
    }

    let brandProfile = null;
    if (brandId) {
      brandProfile = brandManager.getBrandProfile(brandId);
      if (!brandProfile) {
        return res.status(404).json({ error: `Brand profile not found: "${brandId}"` });
      }
    }

    const finalConfig = {
      brandName: brandName || brandProfile?.name || 'Brand',
      colors: brandConfig.colors || brandProfile?.colors || {},
      assetType: brandConfig.assetType || 'logo',
      style: brandConfig.style || brandProfile?.style || 'minimal',
      industry: brandConfig.industry || brandProfile?.industry || 'general',
    };

    const result = await brandManager.generateBrandAsset(finalConfig, {
      count: parseInt(brandConfig.count || '1', 10),
      modelTier: brandConfig.modelTier || 'fast',
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[brand/generate] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Brand Profile Management ──────────────────────────────────────────────

/**
 * GET /api/image/v1/brand/profiles — List all brand profiles
 */
app.get('/api/image/v1/brand/profiles', (req, res) => {
  try {
    const profiles = brandManager.listBrandProfiles();
    res.json({ success: true, total: profiles.length, profiles });
  } catch (err) {
    console.error('[brand/profiles] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/image/v1/brand/profiles/:id — Get a brand profile
 */
app.get('/api/image/v1/brand/profiles/:id', (req, res) => {
  try {
    const profile = brandManager.getBrandProfile(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: `Brand profile not found: "${req.params.id}"` });
    }
    res.json({ success: true, profile });
  } catch (err) {
    console.error('[brand/profiles/:id] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/brand/profiles — Create a brand profile
 *
 * Body: { name: string, colors?: object, fonts?: object, style?: string, industry?: string }
 */
app.post('/api/image/v1/brand/profiles', (req, res) => {
  try {
    const { name, colors, fonts, style, industry, description } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: '"name" is required' });
    }

    const profile = brandManager.createBrandProfile({
      name: name.trim(),
      description,
      colors,
      fonts,
      style,
      industry,
    });

    res.status(201).json({ success: true, profile });
  } catch (err) {
    console.error('[brand/profiles create] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/image/v1/brand/profiles/:id — Update a brand profile
 */
app.put('/api/image/v1/brand/profiles/:id', (req, res) => {
  try {
    const profile = brandManager.updateBrandProfile(req.params.id, req.body);
    if (!profile) {
      return res.status(404).json({ error: `Brand profile not found: "${req.params.id}"` });
    }
    res.json({ success: true, profile });
  } catch (err) {
    console.error('[brand/profiles update] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/image/v1/brand/profiles/:id — Delete a brand profile
 */
app.delete('/api/image/v1/brand/profiles/:id', (req, res) => {
  try {
    const deleted = brandManager.deleteBrandProfile(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: `Brand profile not found: "${req.params.id}"` });
    }
    res.json({ success: true, deleted: true });
  } catch (err) {
    console.error('[brand/profiles delete] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Template System ───────────────────────────────────────────────────────

/**
 * GET /api/image/v1/templates — List templates
 * Query: ?category=product|social|banner|logo|marketing
 */
app.get('/api/image/v1/templates', (req, res) => {
  try {
    const category = req.query.category || null;
    const templates = templateManager.listTemplates(category);
    res.json({
      success: true,
      total: templates.length,
      category: category || 'all',
      templates,
    });
  } catch (err) {
    console.error('[templates] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/image/v1/templates/:id — Get a specific template
 */
app.get('/api/image/v1/templates/:id', (req, res) => {
  try {
    const template = templateManager.getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: `Template not found: "${req.params.id}"` });
    }
    res.json({ success: true, template });
  } catch (err) {
    console.error('[templates/:id] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/templates — Create a custom template
 *
 * Body: { name, description, category, aspectRatio, modelTier, upscale, defaultPrompt, variables }
 */
app.post('/api/image/v1/templates', (req, res) => {
  try {
    const { name, description, category, aspectRatio, modelTier, upscale, defaultPrompt, variables } = req.body;

    if (!name || !defaultPrompt) {
      return res.status(400).json({ error: '"name" and "defaultPrompt" are required' });
    }

    const template = templateManager.createTemplate({
      name,
      description,
      category: category || 'custom',
      aspectRatio: aspectRatio || '1:1',
      modelTier: modelTier || 'fast',
      upscale: upscale ?? false,
      defaultPrompt,
      variables: variables || [],
    });

    res.status(201).json({ success: true, template });
  } catch (err) {
    console.error('[templates create] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/image/v1/templates/:id — Delete a custom template
 */
app.delete('/api/image/v1/templates/:id', (req, res) => {
  try {
    const deleted = templateManager.deleteTemplate(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        error: `Template not found or is built-in (cannot delete built-in templates): "${req.params.id}"`,
      });
    }
    res.json({ success: true, deleted: true });
  } catch (err) {
    console.error('[templates delete] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/templates/render — Render a template
 *
 * Body:
 *   { templateId: string, data: object,
 *     brandId?: string, count?: number, modelTier?: string }
 */
app.post('/api/image/v1/templates/render', async (req, res) => {
  try {
    const { templateId, data, brandId, count, modelTier } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: '"templateId" is required' });
    }
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: '"data" object is required with variable values' });
    }

    const result = await templateManager.renderTemplate(templateId, data, {
      brandId: brandId || null,
      count: parseInt(count || '1', 10),
      modelTier: modelTier || undefined,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[templates/render] Error:', err.message);

    if (err.message.startsWith('Template not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    if (err.message.startsWith('Template validation failed')) {
      return res.status(400).json({ success: false, error: err.message });
    }

    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/templates/render-batch — Render multiple templates
 *
 * Body:
 *   { renders: Array<{ templateId, data, options? }> }
 */
app.post('/api/image/v1/templates/render-batch', async (req, res) => {
  try {
    const { renders } = req.body;

    if (!renders || !Array.isArray(renders) || renders.length === 0) {
      return res.status(400).json({
        error: '"renders" array is required with at least one render request',
      });
    }

    const results = await templateManager.batchRender(renders);
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[templates/render-batch] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── ERP MCP Integration Endpoints ─────────────────────────────────────────

/**
 * POST /api/image/v1/product/generate
 * Generate a product photo using ERP MCP product data
 *
 * Body: { productId?: string, productName?: string, description?: string,
 *         category?: string, templateId?: string, style?: string }
 */
app.post('/api/image/v1/product/generate', async (req, res) => {
  try {
    const { productId, productName, description, category, templateId, style } = req.body;

    let name = productName;
    let desc = description || '';
    let cat = category || '';

    // If productId is given, fetch product data from ERP MCP
    if (productId) {
      const productData = await erpCall('get_product', { productId });
      if (productData?.product) {
        name = name || productData.product.name;
        desc = desc || productData.product.description || '';
        cat = cat || productData.product.categoryName || '';
      }
    }

    if (!name) {
      return res.status(400).json({
        error: 'Either "productId" or "productName" is required',
      });
    }

    // Use template if specified
    if (templateId) {
      const result = await templateManager.renderTemplate(templateId, {
        productName: name,
        description: desc,
        category: cat,
        style: style || 'product',
      });

      return res.json({
        success: true,
        source: 'template',
        productId: productId || null,
        ...result,
      });
    }

    // Direct generation
    const prompt = imageEngine.buildPrompt(
      `${name}${desc ? ', ' + desc : ''}`,
      style || 'product',
      false
    );

    const result = await imageEngine.generateImage(prompt, {
      modelTier: 'quality',
      aspectRatio: '1:1',
      count: 1,
      upscale: true,
    });

    // Optionally update the product with the generated image URL
    if (productId && result.images?.[0]?.url) {
      // Fire-and-forget update — don't block response
      erpCall('update_product', {
        productId,
        imageUrl: result.images[0].url,
      }).catch(() => {});
    }

    res.json({
      success: true,
      source: 'direct',
      productId: productId || null,
      image: result,
    });
  } catch (err) {
    console.error('[product/generate] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/image/v1/campaign/generate
 * Generate campaign assets (banner, social posts, etc.)
 *
 * Body: { campaignName: string, brandId?: string, templateIds?: string[],
 *         assets?: string[], message?: string }
 */
app.post('/api/image/v1/campaign/generate', async (req, res) => {
  try {
    const { campaignName, brandId, templateIds, assets, message } = req.body;

    if (!campaignName) {
      return res.status(400).json({ error: '"campaignName" is required' });
    }

    let brandProfile = null;
    if (brandId) {
      brandProfile = brandManager.getBrandProfile(brandId);
    }

    // Determine which assets to generate
    const assetTypes = assets || ['banner', 'social_post'];
    const tplIds = templateIds || [];

    const generatePromises = [];

    for (const assetType of assetTypes) {
      if (tplIds.length > 0) {
        // Use specified templates
        for (const tplId of tplIds) {
          generatePromises.push(
            templateManager.renderTemplate(tplId, {
              brandName: campaignName,
              message: message || 'campaign promotion',
              colors: brandProfile ? Object.values(brandProfile.colors).join(', ') : '',
            }, { brandId }).then(r => ({ ...r, assetType })).catch(e => ({ assetType, error: e.message }))
          );
        }
      } else {
        // Use brand asset generation
        generatePromises.push(
          brandManager.generateBrandAsset({
            brandName: campaignName,
            assetType,
            colors: brandProfile?.colors || {},
            style: brandProfile?.style || 'modern',
            industry: brandProfile?.industry || 'general',
          }).then(r => ({ ...r, assetType })).catch(e => ({ assetType, error: e.message }))
        );
      }
    }

    const assetsResults = await Promise.all(generatePromises);

    // Optionally create campaign in ERP MCP
    erpCall('create_campaign', {
      name: campaignName,
      type: 'multi',
      description: `Campaign assets generated for: ${message || campaignName}`,
    }).catch(() => {});

    res.json({
      success: true,
      campaignName,
      brandId: brandId || null,
      totalAssets: assetsResults.length,
      assets: assetsResults,
    });
  } catch (err) {
    console.error('[campaign/generate] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Batch Generation ──────────────────────────────────────────────────────

/**
 * POST /api/image/v1/batch
 * Generate multiple images from an array of prompts
 *
 * Body: { prompts: Array<{prompt: string, options?: object}> }
 */
app.post('/api/image/v1/batch', async (req, res) => {
  try {
    const { prompts } = req.body;

    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({
        error: '"prompts" array is required with at least one prompt',
      });
    }

    const results = await imageEngine.batchGenerate(prompts);
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[batch] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Category-based Templates ──────────────────────────────────────────────

/**
 * GET /api/image/v1/category-templates
 * List templates for product categories (fetches ERP categories)
 */
app.get('/api/image/v1/category-templates', async (req, res) => {
  try {
    // Fetch categories from ERP MCP
    const categoriesData = await erpCall('list_categories');
    const categories = categoriesData?.categories || [];

    // Map categories to appropriate templates
    const categoryTemplates = categories.map(cat => ({
      category: cat,
      suggestedTemplates: templateManager.listTemplates('product'),
    }));

    res.json({
      success: true,
      categories: categories.map(c => c.name || c),
      templates: templateManager.listTemplates(),
      categoryTemplates,
    });
  } catch (err) {
    console.error('[category-templates] Error:', err.message);
    // Fallback: return templates without categories
    res.json({
      success: true,
      categories: [],
      templates: templateManager.listTemplates(),
      categoryTemplates: [],
      note: 'ERP MCP not available, showing all templates',
    });
  }
});

// ─── Error Handling ────────────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    available: [
      'GET  /api/image/v1/health',
      'POST /api/image/v1/generate',
      'POST /api/image/v1/edit',
      'POST /api/image/v1/remove-bg',
      'POST /api/image/v1/upscale',
      'POST /api/image/v1/validate',
      'POST /api/image/v1/brand/generate',
      'GET  /api/image/v1/brand/profiles',
      'POST /api/image/v1/brand/profiles',
      'GET  /api/image/v1/templates',
      'GET  /api/image/v1/templates/:id',
      'POST /api/image/v1/templates',
      'POST /api/image/v1/templates/render',
      'POST /api/image/v1/templates/render-batch',
      'POST /api/image/v1/product/generate',
      'POST /api/image/v1/campaign/generate',
      'POST /api/image/v1/batch',
      'GET  /api/image/v1/category-templates',
      'POST /api/image/v1/ugc/generate-frames',
      'POST /api/image/v1/ugc/sam3-segment',
      'POST /api/image/v1/ugc/remove-bg',
      'POST /api/image/v1/ugc/mask-bg',
      'POST /api/image/v1/ugc/face-restore',
    ],
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err.stack || err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// ─── Register with ERP Modular ──────────────────────────────────────────────

function registerWithERP() {
  const http = require('http');
  const body = JSON.stringify({
    name: 'Image Generation',
    slug: 'image-gen',
    version: '0.1.0',
    endpoint: `http://localhost:${PORT}`,
    description: 'AI Image generation (Fal.ai FLUX, inpaint, background remove)',
  });
  const req = http.request({
    hostname: 'localhost', port: 8102, path: '/api/v1/modules/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => console.log(`[ERP] Image-Gen registration: ${res.statusCode}`));
  req.on('error', (e) => console.log(`[ERP] Image-Gen registration skipped: ${e.message}`));
  req.write(body);
  req.end();
}

// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║     Business OS — Image Generation Service          ║
║     Port: ${String(PORT).padEnd(40)}║
║     Fal.ai: ${(!!process.env.FAL_KEY).toString().padEnd(41)}║
║     Storage: ${STORAGE_DIR.padEnd(39)}║
║     ERP MCP: ${ERP_MCP_URL.padEnd(39)}║
╚══════════════════════════════════════════════════════╝
  `);
  registerWithERP();
});

module.exports = app;
