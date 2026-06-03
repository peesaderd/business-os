'use strict';

/**
 * Image Engine — Pipeline abstraction for AI image generation
 * Wraps Fal.ai API, background removal, upscaling
 *
 * Patterns borrowed from Etsy Wizard's image_gen.py:
 *   - Fal.ai FLUX schnell/dev/pro endpoints
 *   - ESRGAN upscale via fal-ai/esrgan
 *   - Thai model base prompt
 *   - Etsy-compliant image validation
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

// ─── Configuration ─────────────────────────────────────────────────────────

const FAL_BASE_URL = 'https://fal.run';
const DEFAULT_FAL_KEY = process.env.FAL_KEY || '';
const DEFAULT_MODEL_TIER = process.env.FAL_DEFAULT_MODEL || 'fast';
const UPSCALE_MODEL = process.env.FAL_UPSCALE_MODEL || 'esrgan';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '120000', 10);
const STORAGE_DIR = process.env.STORAGE_DIR || './storage/images';
const PUBLIC_URL_BASE = (process.env.PUBLIC_URL_BASE || 'http://localhost:8110').replace(/\/+$/, '');

// ─── Fal.ai Model Registry ─────────────────────────────────────────────────

const MODELS = {
  fal: {
    base_url: FAL_BASE_URL,
    tiers: {
      fast:   { endpoint: 'fal-ai/flux/schnell',            cost: 0.003 },
      quality:{ endpoint: 'fal-ai/flux/dev',                 cost: 0.025 },
      pro:    { endpoint: 'fal-ai/flux-pro/v1.1',           cost: 0.050 },
    },
    upscale: {
      esrgan: { endpoint: 'fal-ai/esrgan',                  cost: 0.003 },
      clarity:{ endpoint: 'fal-ai/clarity-upscaler',        cost: 0.010 },
      seedvr: { endpoint: 'fal-ai/seedvr/upscale/image',   cost: 0.020 },
    },
    bg_removal: {
      endpoint: 'fal-ai/imageutils/rembg',
      cost: 0.005,
    },
  },
};

// Etsy image requirements
const ETSY_MIN_SIZE = 2000;
const ETSY_RECOMMENDED_SIZE = 3000;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// Aspect ratio presets → Fal.ai image_size
const ASPECT_RATIOS = {
  '1:1':  'square_hd',
  '9:16': 'portrait_16_9',
  '16:9': 'landscape_16_9',
  '4:5':  'portrait_4_3',
  '3:2':  'landscape_4_3',
  '4:3':  'square_hd',      // fallback
};

// Thai model base prompt (borrowed from Etsy Wizard)
const THAI_BASE_PROMPT =
  'Thai model, young Southeast Asian woman or man, soft natural lighting, authentic Thai lifestyle setting, warm skin tones';

// ─── Helpers ───────────────────────────────────────────────────────────────

function getFalKey() {
  if (!DEFAULT_FAL_KEY) {
    throw new Error('FAL_KEY not configured. Set FAL_KEY in environment or .env');
  }
  return DEFAULT_FAL_KEY;
}

function buildPrompt(basePrompt, style, thaiModel) {
  let prompt = basePrompt;
  if (thaiModel) {
    prompt = `${THAI_BASE_PROMPT}, ${prompt}`;
  }
  // Etsy-optimized suffix for product images
  prompt += ', e-commerce product photography, pure white background, clean studio lighting, no watermark, no text overlay, high detail, sharp focus, professional quality';
  if (style && style !== 'product') {
    prompt += `, ${style}`;
  }
  return prompt;
}

function resolveImageSize(aspectRatio) {
  if (!aspectRatio) return 'square_hd';
  return ASPECT_RATIOS[aspectRatio] || 'square_hd';
}

function computeCost(modelTier, numImages, upscaleEnabled) {
  const tier = MODELS.fal.tiers[modelTier] || MODELS.fal.tiers.fast;
  let cost = tier.cost * numImages;
  if (upscaleEnabled) {
    cost += MODELS.fal.upscale[UPSCALE_MODEL].cost;
  }
  return parseFloat(cost.toFixed(6));
}

async function saveImageLocally(imageUrl, prefix) {
  try {
    const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(resp.data);
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const ext = resp.headers['content-type']?.includes('png') ? 'png' : 'jpg';
    const filename = `${prefix || 'gen'}_${hash}.${ext}`;
    const filePath = path.join(STORAGE_DIR, filename);
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
    return {
      url: `${PUBLIC_URL_BASE}/storage/images/${filename}`,
      path: filePath,
      filename,
      size: buffer.length,
      mimeType: resp.headers['content-type'] || 'image/jpeg',
    };
  } catch (err) {
    // Fallback: just return the original URL
    return { url: imageUrl, path: null, filename: null, size: 0, mimeType: 'image/jpeg' };
  }
}

// ─── Fal.ai API Calls ──────────────────────────────────────────────────────

async function falRequest(endpoint, payload, timeout) {
  const apiKey = getFalKey();
  const url = `${FAL_BASE_URL}/${endpoint}`;

  const resp = await axios.post(url, payload, {
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: timeout || REQUEST_TIMEOUT,
  });

  return resp.data;
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Generate image(s) from a text prompt
 * @param {string} prompt          - Text description
 * @param {object} [options]
 * @param {string} [options.modelTier='fast'] - 'fast' | 'quality' | 'pro'
 * @param {string} [options.aspectRatio]      - '1:1' | '9:16' | '16:9' | '4:5'
 * @param {number} [options.count=1]          - Number of images (1-4)
 * @param {boolean} [options.upscale=false]   - Auto-upscale to ≥2000px
 * @param {boolean} [options.thaiModel=false] - Add Thai model context
 * @param {boolean} [options.saveLocally=true]- Save to local storage
 * @returns {Promise<object>}
 */
async function generateImage(prompt, options = {}) {
  const modelTier = options.modelTier || DEFAULT_MODEL_TIER;
  const aspectRatio = options.aspectRatio;
  const count = Math.min(Math.max(options.count || 1, 1), 4);
  const upscale = !!options.upscale;
  const thaiModel = !!options.thaiModel;
  const saveLocally = options.saveLocally !== false;

  const model = MODELS.fal.tiers[modelTier] || MODELS.fal.tiers.fast;
  const imageSize = resolveImageSize(aspectRatio);
  const finalPrompt = options.rawPrompt ? prompt : buildPrompt(prompt, options.style, thaiModel);

  const payload = {
    prompt: finalPrompt,
    image_size: imageSize,
    num_images: count,
  };

  // Extra quality params for dev/pro
  if (modelTier === 'quality' || modelTier === 'pro') {
    payload.guidance_scale = 7.5;
    payload.num_inference_steps = modelTier === 'pro' ? 30 : 28;
  }

  const data = await falRequest(model.endpoint, payload);
  const falImages = data.images || [];
  if (!falImages.length) {
    throw new Error('Fal.ai returned no images');
  }

  const images = [];
  for (let i = 0; i < falImages.length; i++) {
    const img = falImages[i];
    let imageUrl = img.url;

    // Upscale if needed
    if (upscale) {
      const upscaled = await upscaleImage(imageUrl, { scale: 2 });
      imageUrl = upscaled.images[0].url;
    }

    // Save locally
    let localInfo = { url: imageUrl, path: null, filename: null, size: 0, mimeType: 'image/jpeg' };
    if (saveLocally) {
      try {
        localInfo = await saveImageLocally(imageUrl, `gen_${i}`);
      } catch (_) { /* use original */ }
    }

    images.push({
      index: i,
      url: localInfo.url,
      localPath: localInfo.path,
      filename: localInfo.filename,
      width: img.width || 1024,
      height: img.height || 1024,
      contentType: img.content_type || 'image/jpeg',
      size: localInfo.size,
    });
  }

  return {
    provider: 'fal',
    model: model.endpoint,
    modelTier,
    prompt: finalPrompt,
    seed: data.seed || null,
    cost: computeCost(modelTier, count, upscale),
    images,
    raw: data,
  };
}

/**
 * Edit an existing image (inpaint / outpainting)
 * @param {string} imageUrl - URL of image to edit
 * @param {string} prompt   - What to generate in the edited area
 * @param {object} [options]
 * @param {string} [options.maskUrl] - URL of mask image
 * @param {string} [options.modelTier='fast']
 * @returns {Promise<object>}
 */
async function editImage(imageUrl, prompt, options = {}) {
  const modelTier = options.modelTier || DEFAULT_MODEL_TIER;
  const model = MODELS.fal.tiers[modelTier] || MODELS.fal.tiers.fast;

  const payload = {
    prompt,
    image_url: imageUrl,
    image_size: 'square_hd',
  };
  if (options.maskUrl) {
    payload.mask_url = options.maskUrl;
  }

  const data = await falRequest(model.endpoint, payload);

  const images = (data.images || []).map((img, i) => ({
    index: i,
    url: img.url,
    width: img.width || 1024,
    height: img.height || 1024,
    contentType: img.content_type || 'image/jpeg',
  }));

  return {
    provider: 'fal',
    model: model.endpoint,
    prompt,
    edit: true,
    seed: data.seed || null,
    cost: model.cost,
    images,
  };
}

/**
 * Remove background from an image
 * Uses remove.bg API if configured, falls back to Fal.ai rembg
 * @param {string} imageUrl
 * @returns {Promise<{ url: string, provider: string }>}
 */
async function removeBackground(imageUrl) {
  const removeBgKey = process.env.REMOVE_BG_API_KEY;

  // Prefer remove.bg
  if (removeBgKey) {
    try {
      const resp = await axios.post(
        'https://api.remove.bg/v1.0/removebg',
        { image_url: imageUrl, size: 'auto' },
        {
          headers: {
            'X-Api-Key': removeBgKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 60000,
        }
      );
      const buffer = Buffer.from(resp.data);
      const filename = `nobg_${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}.png`;
      const filePath = path.join(STORAGE_DIR, filename);
      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }
      fs.writeFileSync(filePath, buffer);
      return {
        url: `${PUBLIC_URL_BASE}/storage/images/${filename}`,
        localPath: filePath,
        filename,
        provider: 'remove.bg',
        cost: 0.049,
      };
    } catch (err) {
      // Fall through to Fal.ai
    }
  }

  // Fal.ai rembg
  try {
    const data = await falRequest(MODELS.fal.bg_removal.endpoint, {
      image_url: imageUrl,
    });
    const resultUrl = data.image?.url || data.images?.[0]?.url || '';
    if (!resultUrl) {
      throw new Error('Background removal returned no image');
    }
    return {
      url: resultUrl,
      provider: 'fal',
      cost: MODELS.fal.bg_removal.cost,
    };
  } catch (err) {
    throw new Error(`Background removal failed: ${err.message}`);
  }
}

/**
 * Upscale an image using Fal.ai upscale models
 * @param {string} imageUrl
 * @param {object} [options]
 * @param {number} [options.scale=2]
 * @returns {Promise<{ images: Array<{url:string}>, model: string, cost: number }>}
 */
async function upscaleImage(imageUrl, options = {}) {
  const upscaleModel = options.model || UPSCALE_MODEL;
  const config = MODELS.fal.upscale[upscaleModel] || MODELS.fal.upscale[UPSCALE_MODEL];

  const payload = { image_url: imageUrl };
  if (options.scale) {
    payload.scale = options.scale;
  }

  const data = await falRequest(config.endpoint, payload);

  // Some models return { image: {...} } instead of { images: [...] }
  const images = data.images || [];
  const single = data.image;
  if (!images.length && single) {
    images.push(single);
  }

  if (!images.length) {
    throw new Error('Upscale returned no images');
  }

  return {
    provider: 'fal',
    model: config.endpoint,
    images: images.map(img => ({
      url: img.url || img.image_url,
      width: img.width || 0,
      height: img.height || 0,
    })),
    cost: config.cost,
  };
}

/**
 * Validate image against Etsy requirements
 * @param {string} imageUrl
 * @returns {Promise<{ valid: boolean, issues: string[], width?: number, height?: number, size?: number }>}
 */
async function validateImage(imageUrl) {
  try {
    const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(resp.data);
    const size = buffer.length;

    // Try to get dimensions from Content-Type hints or use HEAD
    // Note: full dimension parsing would need sharp/jimp — keeping it metadata-only
    const contentType = resp.headers['content-type'] || 'unknown';

    const issues = [];

    if (size > MAX_FILE_SIZE) {
      issues.push(`File too large: ${(size / (1024 * 1024)).toFixed(1)}MB, max 20MB`);
    }

    return {
      valid: issues.length === 0,
      issues,
      size,
      contentType,
      url: imageUrl,
    };
  } catch (err) {
    return {
      valid: false,
      issues: [`Failed to validate image: ${err.message}`],
    };
  }
}

// ─── Batch Generation ──────────────────────────────────────────────────────

/**
 * Generate multiple images from an array of prompts
 * @param {Array<{prompt: string, options?: object}>} prompts
 * @returns {Promise<Array<object>>}
 */
async function batchGenerate(prompts) {
  const results = [];
  for (let i = 0; i < prompts.length; i++) {
    const { prompt, options = {} } = prompts[i];
    try {
      const result = await generateImage(prompt, options);
      results.push({ index: i, prompt, success: true, result });
    } catch (err) {
      results.push({ index: i, prompt, success: false, error: err.message });
    }
  }
  return {
    total: prompts.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  generateImage,
  editImage,
  removeBackground,
  upscaleImage,
  validateImage,
  batchGenerate,
  buildPrompt,
  MODELS,
  ETSY_MIN_SIZE,
  ETSY_RECOMMENDED_SIZE,
};
