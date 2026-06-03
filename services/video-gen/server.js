'use strict';

/**
 * Business OS — Video Generation Service
 *
 * Express server on port 8116 offering:
 *   - Text-to-video generation (WaveSpeed, Minimax, Pika, Runway, Kling)
 *   - Image-to-video generation
 *   - Multi-provider fallback chain
 *   - Job queue with status polling
 *   - Script generation (LLM + template fallback)
 *   - Video prompt templates
 *   - Subtitle generation
 *   - ERP MCP integration
 *
 * Port: 8116
 * Base path: /api/video/v1
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const videoEngine = require('./video-engine');
const templateManager = require('./template-manager');

// ─── App Setup ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '8116', 10);
const PUBLIC_URL_BASE = (process.env.PUBLIC_URL_BASE || `http://localhost:${PORT}`).replace(/\/+$/, '');
const STORAGE_DIR = process.env.STORAGE_DIR || './storage/videos';
const ERP_MCP_URL = process.env.ERP_MCP_URL || 'http://localhost:3000/api/mcp';

const app = express();

// Path normalization: accept /api/video/v1/* and /video/v1/*
app.use((req, res, next) => {
  // If the gateway stripped /api from the path, prepend it back
  if (req.path.startsWith('/video/v1/') && !req.path.startsWith('/api/video/v1/')) {
    req.url = '/api' + req.url;
  }
  next();
});

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static storage (generated videos)
const storagePath = path.resolve(STORAGE_DIR);
if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true });
}
app.use('/storage/videos', express.static(storagePath));

// ─── Error Handling Wrapper ────────────────────────────────────────────────

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
      res.status(err.statusCode || 500).json({
        error: true,
        message: err.message || 'Internal service error',
        path: req.path,
        timestamp: new Date().toISOString(),
      });
    });
  };
}

// ─── Health ────────────────────────────────────────────────────────────────

app.get('/api/video/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'video-gen',
    version: '0.1.0',
    port: PORT,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    providers: Object.keys(videoEngine.PROVIDERS).filter(p => videoEngine.PROVIDERS[p].key()).length,
  });
});

// ─── List Providers ────────────────────────────────────────────────────────

app.get('/api/video/v1/providers', (req, res) => {
  const providers = videoEngine.listProviders();
  const presets = videoEngine.listUgCPresets();

  res.json({
    providers,
    ugcPresets: presets,
    fallbackChain: videoEngine.FALLBACK_CHAIN,
    total: Object.keys(providers).length,
    configured: Object.values(providers).filter(p => p.configured).length,
  });
});

// ─── List Templates ────────────────────────────────────────────────────────

app.get('/api/video/v1/templates', (req, res) => {
  const category = req.query.category;
  const templates = templateManager.listTemplates(category);
  const variations = templateManager.getScriptVariations();

  res.json({
    templates,
    variations,
    total: templates.length,
  });
});

// ─── Get Template ──────────────────────────────────────────────────────────

app.get('/api/video/v1/templates/:id', (req, res) => {
  const template = templateManager.getTemplate(req.params.id);
  if (!template) {
    return res.status(404).json({ error: true, message: `Template "${req.params.id}" not found` });
  }
  res.json({ template });
});

// ─── Generate Script ───────────────────────────────────────────────────────

app.post('/api/video/v1/script', asyncHandler(async (req, res) => {
  const {
    product_name,
    customer_problem,
    main_benefit,
    target_audience,
    tone,
    cta,
    duration = '8s',
    extra_rules,
  } = req.body;

  if (!product_name) {
    return res.status(400).json({ error: true, message: 'product_name is required' });
  }

  const script = await templateManager.generateReviewScript({
    product_name,
    customer_problem,
    main_benefit,
    target_audience,
    tone,
    cta,
    duration,
    extra_rules,
  });

  res.json(script);
}));

// ─── Generate UGC Prompt ───────────────────────────────────────────────────

app.post('/api/video/v1/ugc-prompt', asyncHandler(async (req, res) => {
  const {
    style = 'ugc_review',
    product_name,
    product_desc,
    gender,
    age,
    scene,
  } = req.body;

  if (!product_name) {
    return res.status(400).json({ error: true, message: 'product_name is required' });
  }

  const result = await templateManager.generateUgCPrompt(style, {
    product_name,
    product_desc,
    gender,
    age,
    scene,
  });

  res.json(result);
}));

// ─── Render Template (Script → Video) ─────────────────────────────────────

app.post('/api/video/v1/templates/render', asyncHandler(async (req, res) => {
  const { templateId, data = {}, options = {} } = req.body;

  if (!templateId) {
    return res.status(400).json({ error: true, message: 'templateId is required' });
  }

  const result = await templateManager.renderTemplate(templateId, data, {
    provider: options.provider,
    model: options.model,
    duration: options.duration,
    aspectRatio: options.aspectRatio,
    generateVideo: options.generateVideo !== false,
  });

  res.json(result);
}));

// ─── Batch Render Templates ────────────────────────────────────────────────

app.post('/api/video/v1/templates/batch-render', asyncHandler(async (req, res) => {
  const { renders = [] } = req.body;

  if (!renders.length) {
    return res.status(400).json({ error: true, message: 'renders array is required' });
  }

  const results = await templateManager.batchRender(renders);
  res.json(results);
}));

// ─── Generate Subtitles ────────────────────────────────────────────────────

app.post('/api/video/v1/subtitles', (req, res) => {
  const { script, duration = 8 } = req.body;

  if (!script) {
    return res.status(400).json({ error: true, message: 'script is required' });
  }

  const srt = templateManager.generateSubtitles(script, duration);

  res.json({
    srt,
    script,
    duration,
    segments: srt ? srt.split('\n\n').filter(Boolean).length : 0,
    format: 'srt',
  });
});

// ─── Generate Video ────────────────────────────────────────────────────────

app.post('/api/video/v1/generate', asyncHandler(async (req, res) => {
  const {
    prompt,
    provider,
    model,
    duration = 8,
    aspectRatio = '9:16',
    style,
    imageUrl,
    script,
    async: asyncMode = false,
  } = req.body;

  if (!prompt && !script) {
    return res.status(400).json({
      error: true,
      message: 'Either "prompt" or "script" is required',
    });
  }

  // Build final prompt
  let finalPrompt = prompt;
  if (script && !prompt) {
    finalPrompt = videoEngine.buildVideoPrompt(script, style);
  } else if (prompt && style) {
    finalPrompt = videoEngine.buildVideoPrompt(prompt, style);
  }

  // Async mode: queue and return immediately
  if (asyncMode) {
    const jobId = videoEngine.jobQueue.enqueue(finalPrompt, {
      provider,
      model,
      duration,
      aspectRatio,
      imageUrl,
      style,
    });

    return res.json({
      async: true,
      jobId,
      status: 'queued',
      statusUrl: `/api/video/v1/status/${jobId}`,
      message: 'Video generation queued. Poll status endpoint for result.',
    });
  }

  // Sync mode: wait for result
  const result = await videoEngine.generateVideo(finalPrompt, {
    provider,
    model,
    duration,
    aspectRatio,
    imageUrl,
    style,
    fallback: true,
    saveLocally: true,
  });

  res.json({
    ...result,
    elapsed_ms: result.elapsed_ms || null,
    prompt: finalPrompt,
  });
}));

// ─── Image-to-Video ────────────────────────────────────────────────────────

app.post('/api/video/v1/image-to-video', asyncHandler(async (req, res) => {
  const {
    imageUrl,
    prompt = 'Animate this image naturally, smooth motion',
    provider,
    model,
    duration = 8,
    aspectRatio,
    motion = 'natural',
    async: asyncMode = false,
  } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: true, message: 'imageUrl is required' });
  }

  // Enhance prompt with motion direction
  const motionPrompts = {
    natural: 'Smooth natural motion, gentle camera movement',
    zoom: 'Slow zoom in, cinematic focus',
    pan: 'Gentle pan across the scene',
    subtle: 'Very subtle movement, barely noticeable motion',
    dramatic: 'Dynamic camera movement, dramatic effect',
  };

  const motionSuffix = motionPrompts[motion] || motionPrompts.natural;
  const finalPrompt = `${prompt}. ${motionSuffix}`;

  if (asyncMode) {
    const jobId = videoEngine.jobQueue.enqueue(finalPrompt, {
      provider,
      model,
      duration,
      aspectRatio,
      imageUrl,
      style: 'cinematic',
    });

    return res.json({
      async: true,
      jobId,
      status: 'queued',
      statusUrl: `/api/video/v1/status/${jobId}`,
      message: 'Image-to-video generation queued.',
    });
  }

  const result = await videoEngine.generateVideo(finalPrompt, {
    provider,
    model,
    duration,
    aspectRatio,
    imageUrl,
    fallback: true,
    saveLocally: true,
  });

  res.json({
    ...result,
    motion,
    sourceImage: imageUrl,
    mode: 'image_to_video',
  });
}));

// ─── Check Job Status ─────────────────────────────────────────────────────

app.get('/api/video/v1/status/:jobId', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const status = await videoEngine.getJobStatus(jobId);

  if (!status) {
    return res.status(404).json({ error: true, message: `Job "${jobId}" not found` });
  }

  res.json(status);
}));

// ─── List Recent Jobs ─────────────────────────────────────────────────────

app.get('/api/video/v1/jobs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const jobs = videoEngine.listJobs(limit);

  res.json({
    jobs: jobs.map(j => ({
      job_id: j.job_id,
      status: j.status,
      provider: j.provider,
      duration: j.duration,
      aspect_ratio: j.aspect_ratio,
      style: j.style,
      created_at: j.created_at,
      updated_at: j.updated_at,
      has_result: !!j.result,
      has_error: !!j.error,
    })),
    total: jobs.length,
  });
});

// ─── ERP MCP Integration ──────────────────────────────────────────────────

app.get('/api/video/v1/erp/product/:productId', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const product = await templateManager.fetchProductFromERP(productId);
  if (!product) {
    return res.status(404).json({ error: true, message: `Product "${productId}" not found in ERP` });
  }
  res.json({ product });
}));

app.post('/api/video/v1/erp/campaign', asyncHandler(async (req, res) => {
  const { productId, campaignName, videoUrl, script } = req.body;

  if (!productId || !campaignName) {
    return res.status(400).json({ error: true, message: 'productId and campaignName required' });
  }

  // Try to create a campaign in ERP MCP for tracking
  try {
    const axios = require('axios');
    const campaignResp = await axios.post(`${ERP_MCP_URL}/campaign`, {
      tenantId: process.env.ERP_TENANT_ID || 'default',
      name: campaignName,
      type: 'social',
      description: `Video campaign for product ${productId}`,
    }, { timeout: 10000 });

    res.json({
      success: true,
      campaign: campaignResp.data,
      videoUrl,
      script,
    });
  } catch (err) {
    // ERP not available — still return the video info
    res.json({
      success: true,
      warning: 'ERP campaign creation skipped (ERP unavailable)',
      videoUrl,
      script,
      productId,
      campaignName,
    });
  }
}));

// ─── Generate Script + Video (Full Pipeline) ──────────────────────────────

app.post('/api/video/v1/full-pipeline', asyncHandler(async (req, res) => {
  const {
    product_name,
    customer_problem,
    main_benefit,
    tone,
    cta,
    provider,
    duration = 8,
    aspectRatio = '9:16',
    style = 'ugc_review',
    scriptOnly = false,
  } = req.body;

  if (!product_name) {
    return res.status(400).json({ error: true, message: 'product_name is required' });
  }

  // Step 1: Generate script
  const scriptResult = await templateManager.generateReviewScript({
    product_name,
    customer_problem,
    main_benefit,
    tone,
    cta,
    duration: duration <= 10 ? '8s' : '16s',
  });

  const result = {
    script: scriptResult,
    video: null,
  };

  if (!scriptOnly) {
    // Step 2: Build video prompt from script
    const videoPrompt = videoEngine.buildVideoPrompt(
      scriptResult.script,
      style
    );

    // Step 3: Generate video
    const videoResult = await videoEngine.generateVideo(videoPrompt, {
      provider,
      duration,
      aspectRatio,
      style,
      fallback: true,
      saveLocally: true,
    });

    result.video = videoResult;
    result.prompt = videoPrompt;
  }

  res.json(result);
}));

// ─── 404 Handler ───────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: `Route not found: ${req.method} ${req.path}`,
    available: {
      health: 'GET /api/video/v1/health',
      providers: 'GET /api/video/v1/providers',
      templates: 'GET /api/video/v1/templates',
      generate: 'POST /api/video/v1/generate',
      imageToVideo: 'POST /api/video/v1/image-to-video',
      script: 'POST /api/video/v1/script',
      ugcPrompt: 'POST /api/video/v1/ugc-prompt',
      templateRender: 'POST /api/video/v1/templates/render',
      subtitles: 'POST /api/video/v1/subtitles',
      status: 'GET /api/video/v1/status/:jobId',
      jobs: 'GET /api/video/v1/jobs',
      fullPipeline: 'POST /api/video/v1/full-pipeline',
    },
  });
});

// ─── Start Server ──────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║         Business OS — Video Generation Service       ║
╠══════════════════════════════════════════════════════╣
║  Port:    ${String(PORT).padEnd(40)}║
║  Base:    /api/video/v1                             ║
║  Status:  http://localhost:${PORT}/api/video/v1/health  ║
║  Storage: ${STORAGE_DIR.padEnd(40)}║
║  Providers: ${Object.keys(videoEngine.PROVIDERS).length} configured                     ║
║  Fallback: ${videoEngine.FALLBACK_CHAIN.slice(0, 5).join(' → ')} → ...║
║                                                    ║
║  ERP MCP: ${ERP_MCP_URL.padEnd(39)}║
╚══════════════════════════════════════════════════════╝
  `);
  });
}

module.exports = app;
