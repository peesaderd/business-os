'use strict';

/**
 * Video Engine — Multi-provider AI video generation abstraction
 *
 * Wraps TikTok UGC Studio patterns from video_gen.py:
 *   - Provider-agnostic interface
 *   - Fallback chain: WaveSpeed → Minimax → Pika → Runway → Kling → HeyGen
 *   - Rate limiting (token bucket)
 *   - Retry with exponential backoff
 *   - Image-to-video support
 *   - Job queue via SQLite
 *
 * Each provider class implements:
 *   generate(prompt, options) → { task_id, status }
 *   getStatus(taskId) → { task_id, status, video_url, progress }
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

// ─── Configuration ─────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 300000; // 5 minutes
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '120000', 10);
const STORAGE_DIR = process.env.STORAGE_DIR || './storage/videos';
const PUBLIC_URL_BASE = (process.env.PUBLIC_URL_BASE || 'http://localhost:8116').replace(/\/+$/, '');
const DB_PATH = process.env.DB_PATH || './data/video-jobs.db';
const MAX_WORKERS = parseInt(process.env.VIDEO_MAX_WORKERS || '3', 10);

// ─── Provider Configuration ────────────────────────────────────────────────

const PROVIDERS = {
  wavespeed: {
    displayName: 'WaveSpeed AI',
    key: () => process.env.WAVESPEED_API_KEY,
    baseUrl: 'https://api.wavespeed.ai/api/v3',
    models: {
      standard: { id: 'wavespeed-ai/short-video-generator', cost: 0.05 },
    },
    defaultModel: 'wavespeed-ai/short-video-generator',
    supportsImageToVideo: true,
    rateLimitRps: 10,
    priority: 1,
  },
  minimax: {
    displayName: 'Minimax / Hailuo',
    key: () => process.env.MINIMAX_API_KEY,
    baseUrl: 'https://api.minimax.chat/v1',
    models: {
      standard: { id: 'video-01', cost: 0.10 },
    },
    defaultModel: 'video-01',
    supportsImageToVideo: true,
    rateLimitRps: 10,
    priority: 2,
  },
  pika: {
    displayName: 'Pika Labs',
    key: () => process.env.PIKA_API_KEY,
    baseUrl: 'https://api.pika.art/v1',
    models: {
      standard: { id: 'pika-2.0', cost: 0.30 },
      turbo: { id: 'pika-2.0-turbo', cost: 0.40 },
    },
    defaultModel: 'pika-2.0',
    supportsImageToVideo: true,
    rateLimitRps: 20,
    priority: 3,
  },
  runway: {
    displayName: 'RunwayML',
    key: () => process.env.RUNWAY_API_KEY,
    baseUrl: 'https://api.runwayml.com/v1',
    models: {
      standard: { id: 'gen3a', cost: 0.40 },
      turbo: { id: 'gen3a_turbo', cost: 0.60 },
    },
    defaultModel: 'gen3a',
    supportsImageToVideo: true,
    rateLimitRps: 10,
    priority: 4,
  },
  kling: {
    displayName: 'Kling AI',
    key: () => process.env.KLING_API_KEY,
    baseUrl: 'https://api.kling.ai/v1',
    models: {
      standard: { id: 'kling-v1', cost: 0.60 },
      pro: { id: 'kling-v1-pro', cost: 1.00 },
    },
    defaultModel: 'kling-v1',
    supportsImageToVideo: true,
    rateLimitRps: 5,
    priority: 5,
  },
  heygen: {
    displayName: 'HeyGen',
    key: () => process.env.HEYGEN_API_KEY,
    baseUrl: 'https://api.heygen.com/v1',
    models: {
      standard: { id: 'heygen-video', cost: 0.20 },
    },
    defaultModel: 'heygen-video',
    supportsImageToVideo: false,
    rateLimitRps: 10,
    priority: 6,
  },
};

// Fallback chain in priority order
const FALLBACK_CHAIN = Object.entries(PROVIDERS)
  .sort(([, a], [, b]) => a.priority - b.priority)
  .map(([name]) => name);

// ─── UGC Presets ───────────────────────────────────────────────────────────

const UGC_PRESETS = {
  holding_product: {
    duration: 8,
    aspectRatio: '9:16',
    style: 'realistic',
    promptSuffix: 'Ultra-realistic, natural lighting, handheld camera feel, no text, no watermark',
  },
  product_usage: {
    duration: 8,
    aspectRatio: '9:16',
    style: 'realistic',
    promptSuffix: 'Demonstration video, natural hand movements, clean background, no text',
  },
  ugc_review: {
    duration: 8,
    aspectRatio: '9:16',
    style: 'realistic',
    promptSuffix: 'Casual UGC review style, authentic, handheld, natural lighting, no text, no watermark',
  },
  cinematic: {
    duration: 16,
    aspectRatio: '16:9',
    style: 'cinematic',
    promptSuffix: 'Cinematic quality, dramatic lighting, professional grade, no watermark',
  },
  product_demo: {
    duration: 8,
    aspectRatio: '1:1',
    style: 'clean',
    promptSuffix: 'Clean product demonstration, bright studio lighting, white background, no text, no watermark',
  },
};

// ─── Rate Limiter (Token Bucket) ─────────────────────────────────────────

class RateLimiter {
  constructor(rps) {
    this.maxTokens = rps;
    this.tokens = rps;
    this.lastRefill = Date.now();
  }

  async wait() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.tokens + elapsed * this.maxTokens, this.maxTokens);
    this.lastRefill = now;

    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) / this.maxTokens * 1000);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      this.tokens = 1;
      this.lastRefill = Date.now();
    }
    this.tokens -= 1;
  }
}

const _rateLimiters = {};

function getRateLimiter(providerName) {
  const cfg = PROVIDERS[providerName];
  if (!cfg) return null;
  if (!_rateLimiters[providerName]) {
    _rateLimiters[providerName] = new RateLimiter(cfg.rateLimitRps || 10);
  }
  return _rateLimiters[providerName];
}

// ─── Retry Helper ──────────────────────────────────────────────────────────

async function retryable(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRetryable =
        (err.response && [429, 502, 503, 504].includes(err.response.status)) ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT';
      if (!isRetryable) throw err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ─── Storage Helpers ───────────────────────────────────────────────────────

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

async function saveVideoLocally(videoUrl, prefix = 'vid') {
  try {
    const resp = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(resp.data);
    const ext = (resp.headers['content-type'] || '').includes('mp4') ? 'mp4' : 'mp4';
    const filename = `${prefix}_${uuidv4().slice(0, 8)}.${ext}`;
    const filePath = path.join(STORAGE_DIR, filename);
    ensureStorageDir();
    fs.writeFileSync(filePath, buffer);
    return {
      url: `${PUBLIC_URL_BASE}/storage/videos/${filename}`,
      path: filePath,
      filename,
      size: buffer.length,
      mimeType: resp.headers['content-type'] || 'video/mp4',
    };
  } catch (err) {
    return { url: videoUrl, path: null, filename: null, size: 0, mimeType: 'video/mp4' };
  }
}

// ─── Database (SQLite Job Queue) ───────────────────────────────────────────

let db = null;

function getDb() {
  if (db) return db;
  const Database = require('better-sqlite3');
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_jobs (
      job_id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'queued',
      prompt TEXT,
      provider TEXT,
      model TEXT,
      duration INTEGER DEFAULT 8,
      aspect_ratio TEXT DEFAULT '9:16',
      image_url TEXT,
      style TEXT,
      result TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  return db;
}

function insertJob(job) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO video_jobs (job_id, status, prompt, provider, model, duration, aspect_ratio, image_url, style)
    VALUES (@job_id, @status, @prompt, @provider, @model, @duration, @aspect_ratio, @image_url, @style)
  `);
  stmt.run(job);
}

function updateJob(jobId, updates) {
  const d = getDb();
  const sets = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  updates.updated_at = new Date().toISOString();
  const stmt = d.prepare(`UPDATE video_jobs SET ${sets} WHERE job_id = @job_id`);
  stmt.run({ job_id: jobId, ...updates });
}

function getJob(jobId) {
  const d = getDb();
  return d.prepare('SELECT * FROM video_jobs WHERE job_id = ?').get(jobId);
}

function listJobs(limit = 20) {
  const d = getDb();
  return d.prepare('SELECT * FROM video_jobs ORDER BY created_at DESC LIMIT ?').all(limit);
}

function getQueuedJobs() {
  const d = getDb();
  return d.prepare("SELECT * FROM video_jobs WHERE status = 'queued' ORDER BY created_at ASC").all();
}

// ─── Provider Implementations ──────────────────────────────────────────────

/**
 * WaveSpeed API v3 — O(n) inference engine
 */
async function waveSpeedGenerate(prompt, options = {}) {
  const cfg = PROVIDERS.wavespeed;
  const apiKey = cfg.key();
  const model = options.model || cfg.defaultModel;
  const duration = options.duration || 8;
  const aspectRatio = options.aspectRatio || '9:16';
  const imageUrl = options.imageUrl;

  const url = `${cfg.baseUrl}/predictions`;
  const inp = { prompt };

  // Snap duration to allowed values
  const allowed = [5, 10, 15];
  inp.duration = allowed.reduce((prev, curr) =>
    Math.abs(curr - duration) < Math.abs(prev - duration) ? curr : prev
  );
  inp.aspect_ratio = aspectRatio;

  if (imageUrl) {
    inp.reference_images = [imageUrl];
  }

  const resp = await axios.post(url, {
    model,
    input: inp,
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    timeout: DEFAULT_TIMEOUT,
  });

  const data = resp.data?.data || {};
  return { task_id: data.id || '', status: data.status || 'created' };
}

async function waveSpeedStatus(taskId) {
  const cfg = PROVIDERS.wavespeed;
  const url = `${cfg.baseUrl}/predictions/${taskId}/result`;
  const resp = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${cfg.key()}` },
    timeout: 30000,
  });

  const body = resp.data;
  const data = body.data || {};
  const outputs = data.outputs || body.outputs || [];
  let videoUrl = '';
  if (outputs.length) videoUrl = outputs[0];
  if (!videoUrl) {
    const output = data.output || {};
    videoUrl = output.video_url || (output.video && output.video.url) || data.video_url || '';
  }

  return {
    task_id: taskId,
    status: data.status || body.status || 'unknown',
    video_url: videoUrl,
    progress: data.status === 'completed' ? 100 : data.status === 'processing' ? 50 : null,
  };
}

/**
 * Minimax / Hailuo API
 */
async function minimaxGenerate(prompt, options = {}) {
  const cfg = PROVIDERS.minimax;
  const model = options.model || cfg.defaultModel;
  const duration = options.duration || 8;
  const imageUrl = options.imageUrl;

  const payload = { model, prompt, duration };
  if (imageUrl) payload.image_url = imageUrl;

  const resp = await axios.post(`${cfg.baseUrl}/video/generate`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.key()}`,
    },
    timeout: DEFAULT_TIMEOUT,
  });

  return { task_id: resp.data.task_id || '', status: 'pending' };
}

async function minimaxStatus(taskId) {
  const cfg = PROVIDERS.minimax;
  const resp = await axios.get(`${cfg.baseUrl}/video/status/${taskId}`, {
    headers: { 'Authorization': `Bearer ${cfg.key()}` },
    timeout: 30000,
  });
  const data = resp.data;
  const output = data.output || {};
  return {
    task_id: taskId,
    status: data.status || 'unknown',
    video_url: output.url || '',
    progress: data.status === 'completed' ? 100 : data.status === 'processing' ? 50 : null,
  };
}

/**
 * Pika Labs API
 */
async function pikaGenerate(prompt, options = {}) {
  const cfg = PROVIDERS.pika;
  const model = options.model || cfg.defaultModel;
  const imageUrl = options.imageUrl;

  const payload = { model, prompt };
  if (imageUrl) payload.image_url = imageUrl;

  const resp = await axios.post(`${cfg.baseUrl}/generations`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.key()}`,
    },
    timeout: DEFAULT_TIMEOUT,
  });

  return { task_id: resp.data.id || resp.data.task_id || '', status: 'pending' };
}

async function pikaStatus(taskId) {
  const cfg = PROVIDERS.pika;
  const resp = await axios.get(`${cfg.baseUrl}/generations/${taskId}`, {
    headers: { 'Authorization': `Bearer ${cfg.key()}` },
    timeout: 30000,
  });
  const data = resp.data;
  const output = data.output || {};
  return {
    task_id: taskId,
    status: data.status || 'unknown',
    video_url: output.url || '',
    progress: data.status === 'completed' ? 100 : data.status === 'processing' ? 50 : null,
  };
}

/**
 * RunwayML API
 */
async function runwayGenerate(prompt, options = {}) {
  const cfg = PROVIDERS.runway;
  const model = options.model || cfg.defaultModel;
  const imageUrl = options.imageUrl;

  const payload = { model, prompt };
  if (imageUrl) payload.image_url = imageUrl;

  const resp = await axios.post(`${cfg.baseUrl}/generations`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.key()}`,
    },
    timeout: DEFAULT_TIMEOUT,
  });

  return { task_id: resp.data.id || resp.data.task_id || '', status: 'pending' };
}

async function runwayStatus(taskId) {
  const cfg = PROVIDERS.runway;
  const resp = await axios.get(`${cfg.baseUrl}/generations/${taskId}`, {
    headers: { 'Authorization': `Bearer ${cfg.key()}` },
    timeout: 30000,
  });
  const data = resp.data;
  const output = data.output || {};
  return {
    task_id: taskId,
    status: data.status || 'unknown',
    video_url: output.url || '',
    progress: data.status === 'completed' ? 100 : data.status === 'processing' ? 50 : null,
  };
}

/**
 * Kling AI API
 */
async function klingGenerate(prompt, options = {}) {
  const cfg = PROVIDERS.kling;
  const model = options.model || cfg.defaultModel;
  const duration = options.duration || 8;
  const aspectRatio = options.aspectRatio || '9:16';
  const imageUrl = options.imageUrl;

  const payload = { model, prompt, duration, aspect_ratio: aspectRatio };
  if (imageUrl) payload.image_url = imageUrl;

  const resp = await axios.post(`${cfg.baseUrl}/images/generations`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.key()}`,
    },
    timeout: DEFAULT_TIMEOUT,
  });

  const data = resp.data?.data || {};
  return { task_id: data.task_id || '', status: 'pending' };
}

async function klingStatus(taskId) {
  const cfg = PROVIDERS.kling;
  const resp = await axios.get(`${cfg.baseUrl}/images/generations/${taskId}`, {
    headers: { 'Authorization': `Bearer ${cfg.key()}` },
    timeout: 30000,
  });
  const data = resp.data?.data || {};
  const videos = data.videos || [];
  const result = { task_id: taskId, status: data.status || 'unknown', video_url: '' };
  if (videos.length) {
    result.video_url = videos[0].url || '';
    result.videos = videos;
  }
  return result;
}

/**
 * HeyGen API — avatar-based talking videos
 */
async function heygenGenerate(prompt, options = {}) {
  const cfg = PROVIDERS.heygen;
  const model = options.model || cfg.defaultModel;
  const avatarId = options.avatarId || '';
  const voiceId = options.voiceId || '';

  const payload = {
    model,
    script: {
      type: 'text',
      input_text: prompt,
    },
  };
  if (avatarId) payload.avatar = { avatar_id: avatarId };
  if (voiceId) payload.voice = { voice_id: voiceId };

  const resp = await axios.post(`${cfg.baseUrl}/template.generate`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': cfg.key(),
    },
    timeout: DEFAULT_TIMEOUT,
  });

  return { task_id: resp.data.data?.video_id || '', status: 'pending' };
}

async function heygenStatus(taskId) {
  const cfg = PROVIDERS.heygen;
  const resp = await axios.get(`${cfg.baseUrl}/video.status?video_id=${taskId}`, {
    headers: { 'X-Api-Key': cfg.key() },
    timeout: 30000,
  });
  const data = resp.data?.data || {};
  return {
    task_id: taskId,
    status: data.status || 'unknown',
    video_url: data.video_url || '',
    progress: data.status === 'completed' ? 100 : data.status === 'processing' ? 50 : null,
  };
}

// ─── Provider Dispatch ─────────────────────────────────────────────────────

const GENERATE_HANDLERS = {
  wavespeed: waveSpeedGenerate,
  minimax: minimaxGenerate,
  pika: pikaGenerate,
  runway: runwayGenerate,
  kling: klingGenerate,
  heygen: heygenGenerate,
};

const STATUS_HANDLERS = {
  wavespeed: waveSpeedStatus,
  minimax: minimaxStatus,
  pika: pikaStatus,
  runway: runwayStatus,
  kling: klingStatus,
  heygen: heygenStatus,
};

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Generate video using the specified provider (with auto-fallback)
 * @param {string} prompt - Text description/video prompt
 * @param {object} [options]
 * @param {string} [options.provider] - Preferred provider name
 * @param {string} [options.model] - Model tier (standard, pro, turbo)
 * @param {number} [options.duration] - Video duration in seconds (5-15)
 * @param {string} [options.aspectRatio] - '9:16' | '16:9' | '1:1'
 * @param {string} [options.imageUrl] - Reference image for image-to-video
 * @param {string} [options.style] - UGC preset style
 * @param {boolean} [options.fallback] - Enable fallback chain (default true)
 * @param {boolean} [options.saveLocally] - Save result to local storage
 * @returns {Promise<object>}
 */
async function generateVideo(prompt, options = {}) {
  const useFallback = options.fallback !== false;
  const preferredProvider = options.provider || null;
  const saveLocally = options.saveLocally !== false;

  // Determine provider order
  const providerOrder = preferredProvider
    ? [preferredProvider, ...FALLBACK_CHAIN.filter(p => p !== preferredProvider)]
    : FALLBACK_CHAIN;
  const tryProviders = useFallback ? providerOrder : providerOrder.slice(0, 1);

  const errors = [];
  let lastResult = null;

  for (const providerName of tryProviders) {
    const cfg = PROVIDERS[providerName];
    if (!cfg || !cfg.key()) {
      errors.push(`${providerName}: no API key configured`);
      continue;
    }

    const handler = GENERATE_HANDLERS[providerName];
    if (!handler) {
      errors.push(`${providerName}: no handler`);
      continue;
    }

    try {
      // Apply rate limiting
      const limiter = getRateLimiter(providerName);
      if (limiter) await limiter.wait();

      // Apply UGC preset if style specified
      let effectivePrompt = prompt;
      const preset = options.style ? UGC_PRESETS[options.style] : null;
      if (preset) {
        effectivePrompt = `${prompt}\n\nStyle: ${options.style}\n${preset.promptSuffix}`;
      }

      const retryResult = await retryable(() =>
        handler(effectivePrompt, {
          ...options,
          model: options.model || cfg.defaultModel,
        })
      );

      lastResult = {
        ...retryResult,
        provider: providerName,
        model: options.model || cfg.defaultModel,
        estimate_cost: cfg.models[options.model || 'standard']?.cost || cfg.models[Object.keys(cfg.models)[0]].cost,
        mode: options.imageUrl ? 'image_to_video' : 'text_to_video',
        prompt: effectivePrompt,
      };

      // Save locally
      if (saveLocally && lastResult.video_url) {
        try {
          const local = await saveVideoLocally(lastResult.video_url, `vid_${providerName}`);
          lastResult.localVideo = local;
        } catch (_) { /* keep original URL */ }
      }

      return lastResult;
    } catch (err) {
      errors.push(`${providerName}: ${err.message?.slice(0, 150) || err}`);
    }
  }

  throw new Error(
    `All video providers failed. Errors: ${errors.join('; ')}`
  );
}

/**
 * Check video generation status for a job
 * @param {string} jobId - Job ID to check
 * @returns {Promise<object>}
 */
async function getJobStatus(jobId) {
  // Prefer DB lookup for queued jobs
  const job = getJob(jobId);
  if (job && ['queued', 'processing'].includes(job.status)) {
    // Poll remote provider if we know it
    if (job.provider && job.result) {
      try {
        const parsed = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
        const statusHandler = STATUS_HANDLERS[job.provider];
        if (statusHandler && parsed.task_id) {
          const remoteStatus = await statusHandler(parsed.task_id);
          // Update local DB
          const done = remoteStatus.status === 'completed' || remoteStatus.status === 'failed';
          updateJob(jobId, {
            status: done ? remoteStatus.status : 'processing',
            result: JSON.stringify(remoteStatus),
          });
          return { ...remoteStatus, job_id: jobId };
        }
      } catch (_) { /* fall through */ }
    }
    return { ...job, status: job.status };
  }

  if (job) {
    return { ...job, result: job.result ? JSON.parse(job.result) : null };
  }

  return { job_id: jobId, status: 'unknown' };
}

/**
 * List available providers with capabilities
 * @returns {object}
 */
function listProviders() {
  const available = {};
  for (const [name, cfg] of Object.entries(PROVIDERS)) {
    const isConfigured = !!cfg.key();
    available[name] = {
      name: cfg.displayName,
      configured: isConfigured,
      models: Object.entries(cfg.models).map(([tier, info]) => ({
        tier,
        model: info.id,
        cost: info.cost,
      })),
      defaultModel: cfg.defaultModel,
      supportsImageToVideo: cfg.supportsImageToVideo,
      rateLimitRps: cfg.rateLimitRps,
      priority: cfg.priority,
    };
  }
  return available;
}

/**
 * List UGC presets
 * @returns {object}
 */
function listUgCPresets() {
  const presets = {};
  for (const [name, cfg] of Object.entries(UGC_PRESETS)) {
    presets[name] = {
      duration: cfg.duration,
      aspectRatio: cfg.aspectRatio,
      style: cfg.style,
      description: cfg.promptSuffix,
    };
  }
  return presets;
}

/**
 * Build a video prompt from a script and style
 * @param {string} script - The script text
 * @param {string} ugcStyle - UGC preset style key
 * @param {string} additionalContext - Extra context
 * @returns {string}
 */
function buildVideoPrompt(script, ugcStyle = 'ugc_review', additionalContext = '') {
  const preset = UGC_PRESETS[ugcStyle] || UGC_PRESETS.ugc_review;
  return [
    script,
    '',
    `Style: ${ugcStyle}`,
    additionalContext,
    preset.promptSuffix,
  ].filter(Boolean).join('\n');
}

// ─── Job Queue (Background Processing) ─────────────────────────────────────

class JobQueue extends EventEmitter {
  constructor(maxWorkers = MAX_WORKERS) {
    super();
    this.maxWorkers = maxWorkers;
    this.activeWorkers = 0;
    this._running = false;
  }

  /**
   * Enqueue a video generation job
   * @param {string} prompt - Video prompt
   * @param {object} [options]
   * @returns {string} job ID
   */
  enqueue(prompt, options = {}) {
    const jobId = `vid_${uuidv4().slice(0, 12)}`;
    const job = {
      job_id: jobId,
      status: 'queued',
      prompt,
      provider: options.provider || null,
      model: options.model || null,
      duration: options.duration || 8,
      aspect_ratio: options.aspectRatio || '9:16',
      image_url: options.imageUrl || null,
      style: options.style || null,
    };

    insertJob(job);
    this._maybeSpawnWorker();
    return jobId;
  }

  _maybeSpawnWorker() {
    if (this.activeWorkers >= this.maxWorkers) return;
    const queued = getQueuedJobs();
    if (!queued.length) return;

    this.activeWorkers++;
    this._processNext().finally(() => {
      this.activeWorkers--;
      setTimeout(() => this._maybeSpawnWorker(), 100);
    });
  }

  async _processNext() {
    let job;
    try {
      job = getQueuedJobs()[0];
      if (!job) return;

      updateJob(job.job_id, { status: 'processing' });

      const result = await generateVideo(job.prompt, {
        provider: job.provider || undefined,
        model: job.model || undefined,
        duration: job.duration,
        aspectRatio: job.aspect_ratio,
        imageUrl: job.image_url || undefined,
        style: job.style || undefined,
        fallback: true,
        saveLocally: true,
      });

      // Save result
      const resultData = JSON.stringify({
        ...result,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });

      // Try to download and save video locally
      let videoUrl = '';
      if (result.video_url) videoUrl = result.video_url;
      if (result.localVideo?.url) videoUrl = result.localVideo.url;
      if (!videoUrl && result.task_id) {
        // Poll for result
        const status = await getJobStatus(job.job_id);
        if (status.video_url) videoUrl = status.video_url;
      }

      updateJob(job.job_id, {
        status: 'completed',
        result: resultData,
        video_url: videoUrl,
      });

      this.emit('job:completed', job.job_id, result);
    } catch (err) {
      const errorMsg = err.message?.slice(0, 1000) || 'Unknown error';
      updateJob(job?.job_id, {
        status: 'failed',
        error: errorMsg,
      });
      this.emit('job:failed', job?.job_id, errorMsg);
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

const jobQueue = new JobQueue();

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  generateVideo,
  getJobStatus,
  listProviders,
  listUgCPresets,
  buildVideoPrompt,
  jobQueue,
  PROVIDERS,
  UGC_PRESETS,
  FALLBACK_CHAIN,
  // Exposed for lower-level access
  getJob,
  insertJob,
  updateJob,
  listJobs,
  // Storage
  saveVideoLocally,
};
