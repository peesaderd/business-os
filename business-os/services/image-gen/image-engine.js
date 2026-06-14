'use strict';

require('dotenv').config({ path: __dirname + '/.env' });

/**
 * Image Engine — Pipeline abstraction for AI image generation
 * Wraps Fal.ai API, Prodia V2, background removal, upscaling, SAM3
 *
 * v2.0 — Major update:
 *  - Prodia FLUX.2 klein 4B model for img2img (pixel-based)
 *  - SAM3 Segment, Mask Background, Remove Background
 *  - Face restore via Prodia
 *  - UGC video pipeline (frame-by-frame keyframe gen)
 *  - 480×854 (9:16) default for UGC
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const http = require('http');

// ─── Configuration ─────────────────────────────────────────────────────────

const FAL_BASE_URL = 'https://fal.run';
const DEFAULT_FAL_KEY = process.env.FAL_KEY || '';
const DEFAULT_PRODIA_KEY = process.env.PRODIA_TOKEN || '';
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
  '4:3':  'square_hd',
};

// UGC resolution presets (Prodia uses pixel dimensions, not aspect ratio strings)
// FLUX.2 klein 4B minimum width=512, minimum height=512
// https://docs.prodia.com/reference/v2-image-to-image 
const UGC_RESOLUTIONS = {
  '480p':  { width: 512, height: 910, label: '512p 9:16 (min for klein)' },
  '720p':  { width: 720, height: 1280, label: '720p 9:16' },
  '960p':  { width: 960, height: 1704, label: '960p 9:16' },
  '1080p': { width: 1080, height: 1920, label: '1080p 9:16' },
};

// ─── Prodia Job Type Registry ──────────────────────────────────────────────
const PRODIA_JOB_TYPES = {
  // Text to Image
  t2i: {
    schnell: 'inference.flux-fast.schnell.txt2img.v2',
    'klein.4b': 'inference.flux-2.klein.4b.txt2img.v1',
    'klein.9b': 'inference.flux-2.klein.9b.txt2img.v1',
    dev: 'inference.flux-2.dev.txt2img.v0',
    pro: 'inference.flux-2.pro.txt2img.v1',
    flex: 'inference.flux-2.flex.txt2img.v1',
  },
  // Image to Image
  img2img: {
    schnell: 'inference.flux.schnell.img2img.v1',
    'klein.4b': 'inference.flux-2.klein.4b.img2img.v1',
    'klein.9b': 'inference.flux-2.klein.9b.img2img.v1',
    pro: 'inference.flux-2.pro.img2img.v1',
  },
  // Utilities
  segment: 'inference.segment.v1',           // SAM3 (v2 doesn't exist)
  sam2: 'inference.sam2.segment.v1',         // SAM2 alternative
  removeBg: 'inference.remove-background.v1',
  maskBg: 'inference.mask-background.v1',
  faceRestore: 'inference.facerestore.v1',
  upscale: 'inference.upscale.v1',
  hypirUpscale: 'inference.hypir.upscale.v1',
};

// Thai model base prompt
const THAI_BASE_PROMPT =
  'Thai model, young Southeast Asian woman or man, soft natural lighting, authentic Thai lifestyle setting, warm skin tones';

// ─── Prodia V2 Client ────────────────────────────────────────────────────
const PRODIA_BASE_URL = 'https://inference.prodia.com';

function createProdiaClient() {
  if (!DEFAULT_PRODIA_KEY) throw new Error('PRODIA_TOKEN not configured');
  const { createProdia } = require('prodia/v2');
  return createProdia({
    token: DEFAULT_PRODIA_KEY,
    baseUrl: PRODIA_BASE_URL + '/v2',
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getFalKey() {
  if (!DEFAULT_FAL_KEY) throw new Error('FAL_KEY not configured');
  return DEFAULT_FAL_KEY;
}

function buildPrompt(basePrompt, style, thaiModel) {
  let prompt = basePrompt;
  if (thaiModel) prompt = `${THAI_BASE_PROMPT}, ${prompt}`;
  prompt += ', e-commerce product photography, pure white background, clean studio lighting, no watermark, no text overlay, high detail, sharp focus, professional quality';
  if (style && style !== 'product') prompt += `, ${style}`;
  return prompt;
}

function resolveImageSize(aspectRatio) {
  if (!aspectRatio) return 'square_hd';
  return ASPECT_RATIOS[aspectRatio] || 'square_hd';
}

function computeCost(modelTier, numImages, upscaleEnabled) {
  const tier = MODELS.fal.tiers[modelTier] || MODELS.fal.tiers.fast;
  let cost = tier.cost * numImages;
  if (upscaleEnabled) cost += MODELS.fal.upscale[UPSCALE_MODEL].cost;
  return parseFloat(cost.toFixed(6));
}

async function fetchImageBuffer(urlOrBuffer) {
  if (Buffer.isBuffer(urlOrBuffer)) return urlOrBuffer;
  if (typeof urlOrBuffer === 'string') {
    const resp = await axios.get(urlOrBuffer, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(resp.data);
  }
  // Assume it's an ArrayBuffer
  return Buffer.from(urlOrBuffer);
}

async function saveLocalImage(imageBuffer, prefix) {
  const hash = createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16);
  const filename = `${prefix}_${hash}.jpg`;
  const filePath = path.join(STORAGE_DIR, filename);
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.writeFileSync(filePath, imageBuffer);
  return {
    url: `${PUBLIC_URL_BASE}/storage/images/${filename}`,
    path: filePath,
    filename,
    size: imageBuffer.length,
    mimeType: 'image/jpeg',
  };
}

// ─── Prodia Job Runner ─────────────────────────────────────────────────────

/**
 * Run a Prodia V2 job with optional image input
 * @param {string} jobType - Prodia job type string
 * @param {object} config - Job config (prompt, etc.)
 * @param {Buffer|Buffer[]} [inputImages] - Optional input image(s)
 * @returns {Promise<Buffer>} - Output image buffer
 */
async function prodiaJob(jobType, config, inputImages) {
  const prodia = createProdiaClient();

  const jobConfig = { type: jobType, config };

  if (inputImages) {
    const inputs = Array.isArray(inputImages) ? inputImages : [inputImages];
    const job = await prodia.job(jobConfig, { inputs });
    return Buffer.from(await job.arrayBuffer());
  }

  const job = await prodia.job(jobConfig);
  return Buffer.from(await job.arrayBuffer());
}

// ─── Prodia T2I / Img2Img ────────────────────────────────────────────────

async function prodiaGenerate(prompt, options = {}) {
  if (!DEFAULT_PRODIA_KEY) throw new Error('PRODIA_TOKEN not configured');

  let finalPrompt = prompt;
  if (options.thaiModel) finalPrompt = `${THAI_BASE_PROMPT}, ${prompt}`;

  // UGC mode uses pixel dimensions
  const resolutionKey = options.resolution || '480p';
  const res = UGC_RESOLUTIONS[resolutionKey] || UGC_RESOLUTIONS['480p'];

  let width = options.width || res.width;
  let height = options.height || res.height;
  // Fallback from aspectRatio (minimum 512 for klein 4B)
  if (!options.width && !options.height && options.aspectRatio) {
    if (options.aspectRatio === '9:16') { width = 512; height = 910; }
    else if (options.aspectRatio === '16:9') { width = 910; height = 512; }
    else if (options.aspectRatio === '1:1') { width = 1024; height = 1024; }
    else if (options.aspectRatio === '4:5') { width = 768; height = 960; }
  }
  // FLUX.2 klein 4B minimum: width >= 512, height >= 512
  if (options.inputImage && width < 512) width = 512;
  if (width < 512) width = 512;
  if (height < 512) height = 512;
  // Ensure multiples of 16
  width = Math.floor(width / 16) * 16;
  height = Math.floor(height / 16) * 16;

  const count = Math.min(Math.max(options.count || 1, 1), 4);
  const results = [];

  for (let i = 0; i < count; i++) {
    let imageBuffer;

    if (options.inputImage) {
      // Image to Image mode
      const inputBuf = await fetchImageBuffer(options.inputImage);
      const jobType = options.model === 'klein.9b'
        ? PRODIA_JOB_TYPES.img2img['klein.9b']
        : PRODIA_JOB_TYPES.img2img['klein.4b'];
      imageBuffer = await prodiaJob(jobType, {
        prompt: finalPrompt,
        width,
        height,
      }, [inputBuf]);
    } else {
      // Text to Image mode
      const jobType = options.model === 'klein.9b'
        ? PRODIA_JOB_TYPES.t2i['klein.9b']
        : PRODIA_JOB_TYPES.t2i['klein.4b'];
      imageBuffer = await prodiaJob(jobType, {
        prompt: finalPrompt,
        width,
        height,
      });
    }

    const localInfo = await saveLocalImage(imageBuffer, `prodia_${i}`);

    results.push({
      index: i,
      url: localInfo.url,
      localPath: localInfo.path,
      filename: localInfo.filename,
      width,
      height,
      contentType: 'image/jpeg',
      size: localInfo.size,
    });
  }

  return {
    success: true,
    provider: 'prodia',
    model: options.inputImage ? PRODIA_JOB_TYPES.img2img['klein.4b'] : PRODIA_JOB_TYPES.t2i['klein.4b'],
    images: results,
    cost: count * (options.inputImage ? 0.0025 : 0.0015),
  };
}

// ─── SAM3 Segment ──────────────────────────────────────────────────────────

/**
 * Run SAM3 segmentation on an image
 * @param {string|Buffer} imageInput - Image URL or Buffer
 * @param {string} [languagePrompt] - Optional language prompt for SAM3
 * @returns {Promise<{ maskBuffer: Buffer, imageBuffer: Buffer, url: string }>}
 */
async function sam3Segment(imageInput, languagePrompt) {
  const inputBuf = await fetchImageBuffer(imageInput);
  const taskId = randomUUID().slice(0, 8);

  // SAM3 returns a mask image: white = segmented, black = background
  const maskBuffer = await prodiaJob(PRODIA_JOB_TYPES.segment, {
    prompt: languagePrompt || 'segment the product in this image',
  }, [inputBuf]);

  const maskInfo = await saveLocalImage(maskBuffer, `sam3_mask_${taskId}`);
  const imageInfo = await saveLocalImage(inputBuf, `sam3_input_${taskId}`);

  return {
    maskBuffer,
    imageBuffer: inputBuf,
    maskUrl: maskInfo.url,
    imageUrl: imageInfo.url,
    cost: 0.005,
  };
}

// ─── Remove Background ─────────────────────────────────────────────────────

/**
 * Remove background from image via Prodia
 * @param {string|Buffer} imageInput
 * @returns {Promise<{ buffer: Buffer, url: string }>}
 */
async function prodiaRemoveBackground(imageInput) {
  const inputBuf = await fetchImageBuffer(imageInput);
  const resultBuf = await prodiaJob(PRODIA_JOB_TYPES.removeBg, {}, [inputBuf]);
  const info = await saveLocalImage(resultBuf, 'nobg');
  return { buffer: resultBuf, url: info.url, cost: 0.0025 };
}

// ─── Mask Background ──────────────────────────────────────────────────────

/**
 * Generate a background mask (opposite of remove-bg)
 * @param {string|Buffer} imageInput
 * @returns {Promise<{ buffer: Buffer, url: string }>}
 */
async function prodiaMaskBackground(imageInput) {
  const inputBuf = await fetchImageBuffer(imageInput);
  const resultBuf = await prodiaJob(PRODIA_JOB_TYPES.maskBg, {}, [inputBuf]);
  const info = await saveLocalImage(resultBuf, 'maskbg');
  return { buffer: resultBuf, url: info.url, cost: 0.0025 };
}

// ─── Face Restore ──────────────────────────────────────────────────────────

/**
 * Restore/enhance faces in an image
 * @param {string|Buffer} imageInput
 * @returns {Promise<{ buffer: Buffer, url: string }>}
 */
async function prodiaFaceRestore(imageInput) {
  const inputBuf = await fetchImageBuffer(imageInput);
  const resultBuf = await prodiaJob(PRODIA_JOB_TYPES.faceRestore, {}, [inputBuf]);
  const info = await saveLocalImage(resultBuf, 'facerestore');
  return { buffer: resultBuf, url: info.url, cost: 0.0008 };
}

// ─── UGC Video Pipeline ───────────────────────────────────────────────────

/**
 * Full UGC video keyframe generation pipeline:
 *   SAM3 segment → T2I background scenes → Img2Img keyframes → Face restore
 *
 * @param {object} options
 * @param {string} options.productImageUrl - URL of product image
 * @param {string} options.scenePrompt - Description of background scene
 * @param {number} [options.durationSeconds=16] - Video length in seconds
 * @param {number} [options.fps=1] - Keyframes per second (1 = 1 keyframe/sec)
 * @param {string} [options.resolution='480p'] - '480p' | '720p' | '1080p'
 * @param {string} [options.modelGender='female'] - 'female' | 'male' | 'unisex'
 * @param {string} [options.productName=''] - Product name for scene prompt
 * @param {string} [options.style='holding'] - 'holding' | 'usage' | 'review' | 'talking'
 * @returns {Promise<object>}
 */
async function ugcGenerateVideo(options = {}) {
  const {
    productImageUrl,
    productName = 'product',
    scenePrompt = '',
    durationSeconds = 16,
    fps = 1,
    resolution = '480p',
    modelGender = 'female',
    style = 'holding',
  } = options;

  if (!productImageUrl) throw new Error('productImageUrl is required');
  if (!DEFAULT_PRODIA_KEY) throw new Error('PRODIA_TOKEN not configured');

  const res = UGC_RESOLUTIONS[resolution] || UGC_RESOLUTIONS['480p'];
  const width = res.width;
  const height = res.height;
  const numKeyframes = Math.max(durationSeconds * fps, 1);
  const taskId = randomUUID().slice(0, 8);
  const startTime = Date.now();

  const costBreakdown = { sam3: 0.005, t2i_scene: 0, img2img: 0, faceRestore: 0 };

  console.log(`[UGC] Starting pipeline task=${taskId}, frames=${numKeyframes}, res=${resolution}, style=${style}`);

  // ── Step 1: SAM3 Segment product image (fallback: remove-bg)
  let segResult;
  try {
    segResult = await sam3Segment(productImageUrl, 'segment the product in this image');
    console.log(`[UGC] ${taskId} Step1 SAM3 done, mask=${segResult.maskUrl}`);
  } catch (sam3Err) {
    console.warn(`[UGC] ${taskId} SAM3 failed: ${sam3Err.message}, falling back to remove-bg`);
    try {
      const rbResult = await prodiaRemoveBackground(productImageUrl);
      segResult = {
        maskBuffer: rbResult.buffer,
        imageBuffer: await fetchImageBuffer(productImageUrl),
        maskUrl: rbResult.url,
        imageUrl: '',
        cost: 0.0025,
      };
      console.log(`[UGC] ${taskId} Fallback remove-bg done`);
    } catch (rbErr) {
      console.warn(`[UGC] ${taskId} Remove-bg also failed: ${rbErr.message}, continuing without mask`);
      const inputBuf = await fetchImageBuffer(productImageUrl);
      segResult = {
        maskBuffer: inputBuf,
        imageBuffer: inputBuf,
        maskUrl: '',
        imageUrl: '',
        cost: 0,
      };
    }
  }

  // ── Step 2: Generate background scenes (T2I) ────────────────────────
  // Generate a few scene variations; cycle through them for keyframes
  const numScenes = Math.min(numKeyframes, 3);
  const scenePrompts = [];
  for (let s = 0; s < numScenes; s++) {
    const angleSuffix = s === 0 ? '' : s === 1 ? ', different angle' : ', close up view';
    const sceneP = scenePrompt
      ? `${scenePrompt}${angleSuffix}`
      : `Thai ${modelGender} model holding ${productName}, ${style} style, soft natural lighting, authentic Thai setting${angleSuffix}`;
    scenePrompts.push(sceneP);
  }

  const sceneImages = [];
  for (const sp of scenePrompts) {
    const buf = await prodiaJob(PRODIA_JOB_TYPES.t2i['klein.4b'], {
      prompt: sp,
      width,
      height,
    });
    const info = await saveLocalImage(buf, `scene_${taskId}`);
    sceneImages.push({ buffer: buf, url: info.url, prompt: sp });
    console.log(`[UGC] ${taskId} T2I scene: ${info.url}`);
  }
  costBreakdown.sam3 = segResult.cost || 0.005;
  costBreakdown.t2i_scene = sceneImages.length * 0.0015;
  console.log(`[UGC] ${taskId} Step2 done, ${sceneImages.length} scenes`);

  // ── Step 3: Img2Img — Insert product into each scene (keyframes) ────
  const keyframes = [];
  for (let f = 0; f < numKeyframes; f++) {
    // Cycle through scene images
    const scene = sceneImages[f % sceneImages.length];
    const angleDesc = f === 0 ? 'front view' : f % 2 === 0 ? 'side angle' : 'three quarter view';

    const img2imgPrompt = `${scene.prompt}, ${productName} visible, ${angleDesc}, authentic UGC style, natural lighting, high detail`;

    const resultBuf = await prodiaJob(PRODIA_JOB_TYPES.img2img['klein.4b'], {
      prompt: img2imgPrompt,
      width,
      height,
    }, [scene.buffer]);

    const info = await saveLocalImage(resultBuf, `kf_${taskId}_${String(f).padStart(3, '0')}`);
    keyframes.push({ frame: f, url: info.url, path: info.path, buffer: resultBuf });
    console.log(`[UGC] ${taskId} Keyframe ${f + 1}/${numKeyframes}: ${info.url}`);
  }
  costBreakdown.img2img = numKeyframes * 0.0025;
  console.log(`[UGC] ${taskId} Step3 done, ${keyframes.length} keyframes`);

  // ── Step 4: Face Restore on each keyframe ──────────────────────────
  const finalFrames = [];
  for (const kf of keyframes) {
    try {
      const fr = await prodiaFaceRestore(kf.buffer);
      finalFrames.push({ frame: kf.frame, url: fr.url, path: null, buffer: fr.buffer });
    } catch (e) {
      // If face restore fails, use original keyframe
      console.warn(`[UGC] ${taskId} Face restore failed for frame ${kf.frame}: ${e.message}`);
      finalFrames.push({ frame: kf.frame, url: kf.url, path: kf.path, buffer: kf.buffer });
    }
  }
  costBreakdown.faceRestore = numKeyframes * 0.0008;
  console.log(`[UGC] ${taskId} Step4 done`);

  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Save scene images as separate reference
  const sceneRefs = sceneImages.map(si => ({
    url: si.url,
    prompt: si.prompt,
  }));

  return {
    success: true,
    taskId,
    resolution,
    frameCount: finalFrames.length,
    durationSeconds,
    fps,
    width,
    height,
    elapsed,
    cost: parseFloat(totalCost.toFixed(6)),
    costBreakdown,
    scenes: sceneRefs,
    keyframes: finalFrames.map(f => ({
      frame: f.frame,
      url: f.url,
    })),
    // First and last frame for cover
    firstFrameUrl: finalFrames[0]?.url || '',
    lastFrameUrl: finalFrames[finalFrames.length - 1]?.url || '',
  };
}

// ─── Fal.ai API Calls ──────────────────────────────────────────────────────

async function falRequest(endpoint, payload, timeout) {
  const apiKey = getFalKey();
  const url = `${FAL_BASE_URL}/${endpoint}`;
  const resp = await axios.post(url, payload, {
    headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: timeout || REQUEST_TIMEOUT,
  });
  return resp.data;
}

// ─── Core Functions ─────────────────────────────────────────────────────────

async function generateImage(prompt, options = {}) {
  const provider = options.provider || (DEFAULT_PRODIA_KEY ? 'prodia' : 'fal');
  const modelTier = options.modelTier || DEFAULT_MODEL_TIER;
  const aspectRatio = options.aspectRatio;

  // Route to Prodia
  if (provider === 'prodia' && DEFAULT_PRODIA_KEY) {
    return await prodiaGenerate(prompt, options);
  }

  const count = Math.min(Math.max(options.count || 1, 1), 4);
  const upscale = !!options.upscale;
  const thaiModel = !!options.thaiModel;
  const saveLocally = options.saveLocally !== false;

  const model = MODELS.fal.tiers[modelTier] || MODELS.fal.tiers.fast;
  const imageSize = resolveImageSize(aspectRatio);
  const finalPrompt = options.rawPrompt ? prompt : buildPrompt(prompt, options.style, thaiModel);

  const payload = { prompt: finalPrompt, image_size: imageSize, num_images: count };
  if (modelTier === 'quality' || modelTier === 'pro') {
    payload.guidance_scale = 7.5;
    payload.num_inference_steps = modelTier === 'pro' ? 30 : 28;
  }

  const data = await falRequest(model.endpoint, payload);
  const falImages = data.images || [];
  if (!falImages.length) throw new Error('Fal.ai returned no images');

  const images = [];
  for (let i = 0; i < falImages.length; i++) {
    const img = falImages[i];
    let imageUrl = img.url;
    if (upscale) {
      const upscaled = await upscaleImage(imageUrl, { scale: 2 });
      imageUrl = upscaled.images[0].url;
    }
    let localInfo = { url: imageUrl, path: null, filename: null, size: 0, mimeType: 'image/jpeg' };
    if (saveLocally) {
      try { localInfo = await saveImageLocally(imageUrl, `gen_${i}`); } catch (_) {}
    }
    images.push({
      index: i, url: localInfo.url, localPath: localInfo.path, filename: localInfo.filename,
      width: img.width || 1024, height: img.height || 1024,
      contentType: img.content_type || 'image/jpeg', size: localInfo.size,
    });
  }

  return {
    provider: 'fal', model: model.endpoint, modelTier, prompt: finalPrompt,
    seed: data.seed || null, cost: computeCost(modelTier, count, upscale),
    images, raw: data,
  };
}

async function editImage(imageUrl, prompt, options = {}) {
  const modelTier = options.modelTier || DEFAULT_MODEL_TIER;
  const model = MODELS.fal.tiers[modelTier] || MODELS.fal.tiers.fast;
  const payload = { prompt, image_url: imageUrl, image_size: 'square_hd' };
  if (options.maskUrl) payload.mask_url = options.maskUrl;
  const data = await falRequest(model.endpoint, payload);
  const images = (data.images || []).map((img, i) => ({
    index: i, url: img.url, width: img.width || 1024, height: img.height || 1024, contentType: img.content_type || 'image/jpeg',
  }));
  return { provider: 'fal', model: model.endpoint, prompt, edit: true, seed: data.seed || null, cost: model.cost, images };
}

async function removeBackground(imageUrl) {
  const removeBgKey = process.env.REMOVE_BG_API_KEY;
  if (removeBgKey) {
    try {
      const resp = await axios.post('https://api.remove.bg/v1.0/removebg', { image_url: imageUrl, size: 'auto' }, {
        headers: { 'X-Api-Key': removeBgKey, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer', timeout: 60000,
      });
      const buffer = Buffer.from(resp.data);
      const filename = `nobg_${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}.png`;
      const filePath = path.join(STORAGE_DIR, filename);
      if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
      fs.writeFileSync(filePath, buffer);
      return { url: `${PUBLIC_URL_BASE}/storage/images/${filename}`, localPath: filePath, filename, provider: 'remove.bg', cost: 0.049 };
    } catch (err) { /* fall through */ }
  }
  try {
    const data = await falRequest(MODELS.fal.bg_removal.endpoint, { image_url: imageUrl });
    const resultUrl = data.image?.url || data.images?.[0]?.url || '';
    if (!resultUrl) throw new Error('Background removal returned no image');
    return { url: resultUrl, provider: 'fal', cost: MODELS.fal.bg_removal.cost };
  } catch (err) {
    throw new Error(`Background removal failed: ${err.message}`);
  }
}

async function upscaleImage(imageUrl, options = {}) {
  const upscaleModel = options.model || UPSCALE_MODEL;
  const config = MODELS.fal.upscale[upscaleModel] || MODELS.fal.upscale[UPSCALE_MODEL];
  const payload = { image_url: imageUrl };
  if (options.scale) payload.scale = options.scale;
  const data = await falRequest(config.endpoint, payload);
  const images = data.images || [];
  const single = data.image;
  if (!images.length && single) images.push(single);
  if (!images.length) throw new Error('Upscale returned no images');
  return {
    provider: 'fal', model: config.endpoint,
    images: images.map(img => ({ url: img.url || img.image_url, width: img.width || 0, height: img.height || 0 })),
    cost: config.cost,
  };
}

async function saveImageLocally(imageUrl, prefix) {
  try {
    const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(resp.data);
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const ext = resp.headers['content-type']?.includes('png') ? 'png' : 'jpg';
    const filename = `${prefix || 'gen'}_${hash}.${ext}`;
    const filePath = path.join(STORAGE_DIR, filename);
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return { url: `${PUBLIC_URL_BASE}/storage/images/${filename}`, path: filePath, filename, size: buffer.length, mimeType: resp.headers['content-type'] || 'image/jpeg' };
  } catch (err) {
    return { url: imageUrl, path: null, filename: null, size: 0, mimeType: 'image/jpeg' };
  }
}

async function validateImage(imageUrl) {
  try {
    const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(resp.data);
    const size = buffer.length;
    const contentType = resp.headers['content-type'] || 'unknown';
    const issues = [];
    if (size > MAX_FILE_SIZE) issues.push(`File too large: ${(size / (1024 * 1024)).toFixed(1)}MB, max 20MB`);
    return { valid: issues.length === 0, issues, size, contentType, url: imageUrl };
  } catch (err) {
    return { valid: false, issues: [`Failed to validate image: ${err.message}`] };
  }
}

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
  return { total: prompts.length, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results };
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
  // Prodia utilities
  prodiaJob,
  prodiaGenerate,
  sam3Segment,
  prodiaRemoveBackground,
  prodiaMaskBackground,
  prodiaFaceRestore,
  // UGC Video Pipeline
  ugcGenerateVideo,
  PRODIA_JOB_TYPES,
  UGC_RESOLUTIONS,
};
