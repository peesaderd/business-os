'use strict';

/**
 * Template Manager — Script → Video template system
 *
 * Provides:
 *   - Script template rendering (with LLM fallback)
 *   - UGC script generation for TikTok/Reels/Shorts
 *   - Template CRUD for video prompt templates
 *   - Product-aware script generation (ERP MCP integration)
 *
 * Patterns from TikTok UGC Studio script_gen.py:
 *   - 8s / 16s script templates with hook → value → CTA structure
 *   - UGC style presets (holding_product, product_usage, ugc_review)
 *   - LLM-backed script generation with template fallback
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const videoEngine = require('./video-engine');

// ─── Configuration ─────────────────────────────────────────────────────────

const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(__dirname, 'data', 'templates');
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const ERP_MCP_URL = process.env.ERP_MCP_URL || 'http://localhost:3000/api/mcp';

if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

// ─── Built-in Script Templates ─────────────────────────────────────────────

const BUILT_IN_TEMPLATES = [
  {
    id: 'tiktok-review-8s',
    name: 'TikTok UGC Review — 8s',
    description: 'Fast-paced TikTok review script, 8 seconds',
    category: 'ugc',
    duration: '8s',
    variables: [
      { key: 'product_name', label: 'Product Name', type: 'string', required: true },
      { key: 'customer_problem', label: 'Customer Problem', type: 'string', required: false },
      { key: 'main_benefit', label: 'Main Benefit', type: 'string', required: false },
      { key: 'target_audience', label: 'Target Audience', type: 'string', required: false },
      { key: 'tone', label: 'Tone', type: 'string', required: false },
      { key: 'cta', label: 'Call to Action', type: 'string', required: false },
    ],
    template: `[Hook] {{hook_phrase}}! {{product_name}} {{customer_problem}} ต้องดู!
[Value] {{product_name}} {{main_benefit}} ลองใช้แล้วดีมาก
[CTA] {{cta_phrase}}!`,
    hooks: [
      'แนะนำสินค้าดีๆ',
      'ของดีบอกต่อ',
      'เจอของเด็ดมาแนะนำ',
      'ปังมากบอกเลย',
      'ต้องลอง!',
    ],
    ctaPhrases: [
      'กดตะกร้าเลย',
      'สั่งเลยวันนี้',
      'ดูเพิ่มเติมที่ลิงก์',
      'อย่าพลาด',
      'จัดเลย',
    ],
    fallback: `[สคริปต์ 8 วินาที]
{{hook_phrase}}! {{product_name}} {{customer_problem}} ต้องดู!
{{product_name}} {{main_benefit}} ลองใช้แล้วดีมาก
{{cta_phrase}}!`,
  },
  {
    id: 'tiktok-review-16s',
    name: 'TikTok UGC Review — 16s',
    description: 'Detailed TikTok review script, 16 seconds',
    category: 'ugc',
    duration: '16s',
    variables: [
      { key: 'product_name', label: 'Product Name', type: 'string', required: true },
      { key: 'customer_problem', label: 'Customer Problem', type: 'string', required: false },
      { key: 'main_benefit', label: 'Main Benefit', type: 'string', required: false },
      { key: 'target_audience', label: 'Target Audience', type: 'string', required: false },
      { key: 'tone', label: 'Tone', type: 'string', required: false },
      { key: 'cta', label: 'Call to Action', type: 'string', required: false },
    ],
    template: `[Hook] {{hook_phrase}}! {{product_name}} {{customer_problem}} ต้องดู!

[Value] {{product_name}} {{main_benefit}} ใช้งานง่าย ได้ผลจริง ลองใช้แล้วประทับใจมาก

[CTA] {{cta_phrase}} {{product_name}} ราคาพิเศษวันนี้เท่านั้น!`,
    hooks: [
      'แนะนำเลย!',
      'ปังมากกก',
      'ของดีต้องรีบ',
      'บอกต่อแบบไม่กั๊ก',
      'ลองแล้วชอบ',
    ],
    ctaPhrases: [
      'กดดูในตะกร้าเลย',
      'สั่งด่วน',
      'รีบกดลิงก์เลย',
      'อย่าพลาดโปรนี้',
      'จัดเลย!',
    ],
    fallback: `[Hook] {{hook_phrase}}! {{product_name}} {{customer_problem}} ต้องดู!

[Value] {{product_name}} {{main_benefit}} ใช้งานง่าย ได้ผลจริง ลองใช้แล้วประทับใจมาก

[CTA] {{cta_phrase}} {{product_name}} ราคาพิเศษวันนี้เท่านั้น!`,
  },
  {
    id: 'ugc-holding-product',
    name: 'UGC Holding Product — Video Prompt',
    description: 'Generate a video prompt for product showcase video',
    category: 'ugc_video',
    ugcStyle: 'holding_product',
    variables: [
      { key: 'product_name', label: 'Product Name', type: 'string', required: true },
      { key: 'product_desc', label: 'Product Description', type: 'string', required: false },
      { key: 'gender', label: 'Model Gender', type: 'string', required: false },
      { key: 'scene', label: 'Scene/Background', type: 'string', required: false },
    ],
    template: `{{gender || 'young person'}} holding {{product_name}} in their hands, {{product_desc || 'showing product details'}}, {{scene || 'home interior'}} setting, natural lighting`,
  },
  {
    id: 'ugc-product-usage',
    name: 'UGC Product Usage — Video Prompt',
    description: 'Generate a video prompt for product demonstration',
    category: 'ugc_video',
    ugcStyle: 'product_usage',
    variables: [
      { key: 'product_name', label: 'Product Name', type: 'string', required: true },
      { key: 'product_desc', label: 'Product Description', type: 'string', required: false },
      { key: 'gender', label: 'Model Gender', type: 'string', required: false },
      { key: 'scene', label: 'Scene/Background', type: 'string', required: false },
    ],
    template: `Close-up shot of {{product_name}} being used, {{product_desc || 'demonstrating functionality'}}, {{scene || 'well-lit room'}}, clear hand movements, product in focus`,
  },
  {
    id: 'ugc-review-video',
    name: 'UGC Review — Video Prompt',
    description: 'Generate a video prompt for review-style content',
    category: 'ugc_video',
    ugcStyle: 'ugc_review',
    variables: [
      { key: 'product_name', label: 'Product Name', type: 'string', required: true },
      { key: 'product_desc', label: 'Product Description', type: 'string', required: false },
      { key: 'gender', label: 'Model Gender', type: 'string', required: false },
      { key: 'age', label: 'Model Age Range', type: 'string', required: false },
      { key: 'scene', label: 'Scene/Background', type: 'string', required: false },
    ],
    template: `{{gender || 'young woman'}} aged {{age || '25-35'}} holding {{product_name}}, {{product_desc || 'showing product'}}, {{scene || 'home'}} background, authentic UGC style`,
  },
  {
    id: 'product-demo-1-1',
    name: 'Product Demo — Square (1:1)',
    description: 'Clean product demo for social media feed',
    category: 'ugc_video',
    ugcStyle: 'product_demo',
    variables: [
      { key: 'product_name', label: 'Product Name', type: 'string', required: true },
      { key: 'product_desc', label: 'Product Description', type: 'string', required: false },
    ],
    template: `Clean product demonstration of {{product_name}}, {{product_desc || 'showing all angles and features'}}, bright studio lighting, pristine white background, rotating slowly`,
  },
  {
    id: 'social-reel-16-9',
    name: 'Social Reel — Landscape (16:9)',
    description: 'Cinematic landscape video for YouTube Shorts or social reels',
    category: 'ugc_video',
    ugcStyle: 'cinematic',
    variables: [
      { key: 'product_name', label: 'Product Name', type: 'string', required: true },
      { key: 'scene', label: 'Scene/Setting', type: 'string', required: false },
      { key: 'mood', label: 'Mood/Atmosphere', type: 'string', required: false },
    ],
    template: `Cinematic shot of {{product_name}} in {{scene || 'beautiful outdoor setting'}}, {{mood || 'peaceful and elegant'}} atmosphere, smooth camera movement, dramatic lighting, professional quality`,
  },
];

// ─── LLM Client ────────────────────────────────────────────────────────────

async function callLLM(systemPrompt, userPrompt) {
  if (!LLM_API_KEY) return null;

  try {
    const resp = await axios.post(
      `${LLM_BASE_URL}/chat/completions`,
      {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          'Authorization': `Bearer ${LLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return resp.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`LLM call failed: ${err.message}`);
    }
    return null;
  }
}

// ─── Template Helpers ──────────────────────────────────────────────────────

function templatePath(id) {
  return path.join(TEMPLATES_DIR, `${id}.json`);
}

function initTemplates() {
  const existing = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
  if (existing.length === 0) {
    for (const tpl of BUILT_IN_TEMPLATES) {
      fs.writeFileSync(templatePath(tpl.id), JSON.stringify(tpl, null, 2));
    }
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(templateStr, data) {
  let result = templateStr;
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}(?:\\|\\|[^}]+)?\\}\\}`, 'g');
    result = result.replace(regex, value !== null && value !== undefined ? String(value) : '');
  }
  // Handle default expressions like {{var || 'default value'}}
  result = result.replace(/\{\{(\w+)\s*\|\|\s*'([^']*)'\}\}/g, (_, key, defaultVal) => {
    return data[key] !== undefined && data[key] !== null && data[key] !== ''
      ? String(data[key])
      : defaultVal;
  });
  // Clean unfilled placeholders
  result = result.replace(/\{\{[\w\s\|\']+\}\}/g, '');
  // Clean double commas
  result = result.replace(/,+/g, ',').replace(/,\s*,/g, ',');
  return result.trim();
}

// ─── ERP MCP Integration ──────────────────────────────────────────────────

/**
 * Fetch product data from ERP MCP
 * @param {string} productId
 * @returns {Promise<object|null>}
 */
async function fetchProductFromERP(productId) {
  try {
    const resp = await axios.get(`${ERP_MCP_URL}/product/${productId}`, { timeout: 10000 });
    return resp.data;
  } catch (_) {
    return null;
  }
}

// ─── Script Generation ─────────────────────────────────────────────────────

/**
 * Generate a TikTok UGC review script
 * @param {object} data - { product_name, customer_problem, main_benefit, tone, cta, duration, target_audience }
 * @returns {Promise<object>}
 */
async function generateReviewScript(data = {}) {
  const {
    product_name = 'สินค้านี้',
    customer_problem = 'ปัญหาที่พบเจอบ่อย',
    main_benefit = 'คุณภาพดี ใช้งานได้จริง',
    target_audience = 'ทุกคนที่กำลังมองหา',
    tone = 'เป็นกันเอง พูดเร็ว',
    cta = 'กดดูในตะกร้าเลย',
    duration = '8s',
    extra_rules = '',
  } = data;

  // Try LLM first
  const systemPrompt =
    'คุณคือผู้เชี่ยวชาญด้านการเขียนสคริปต์ TikTok UGC รีวิวสินค้า ' +
    'เขียนสคริปต์ให้สั้น กระชับ ได้ใจความ ในรูปแบบที่เหมาะกับ TikTok ' +
    'ใช้ภาษาไทย เป็นกันเอง พูดเร็ว เข้าใจง่าย';

  const userPrompt = [
    `สินค้า: ${product_name}`,
    `ปัญหาของลูกค้า: ${customer_problem}`,
    `ประโยชน์หลัก: ${main_benefit}`,
    `กลุ่มเป้าหมาย: ${target_audience}`,
    `โทนเสียง: ${tone}`,
    `CTA: ${cta}`,
    `ความยาว: ${duration}`,
    extra_rules ? `กฎเพิ่มเติม: ${extra_rules}` : '',
    '',
    'ให้เขียนสคริปต์ TikTok UGC รีวิวสินค้า ' +
    (duration === '16s' ? '16 วินาที มี 3 ส่วน: Hook → Value → CTA' : '8 วินาที สั้นกระชับ'),
  ].filter(Boolean).join('\n');

  const llmResult = await callLLM(systemPrompt, userPrompt);

  if (llmResult) {
    return {
      script: llmResult,
      usesLLM: true,
      duration,
      product: product_name,
      source: 'llm',
    };
  }

  // Fallback: template-based script
  const template = BUILT_IN_TEMPLATES.find(t => t.id === (duration === '16s' ? 'tiktok-review-16s' : 'tiktok-review-8s'));
  if (!template) {
    return {
      script: `สคริปต์สำหรับ ${product_name}: ${main_benefit}. ${cta}`,
      usesLLM: false,
      duration,
      product: product_name,
      source: 'fallback',
    };
  }

  const hook = pickRandom(template.hooks);
  const ctaPhrase = pickRandom(template.ctaPhrases);

  const script = fillTemplate(template.fallback, {
    product_name,
    customer_problem,
    main_benefit,
    target_audience,
    tone,
    cta,
    hook_phrase: hook,
    cta_phrase: ctaPhrase,
  });

  return {
    script,
    usesLLM: false,
    duration,
    product: product_name,
    source: 'template',
    used: { hook, cta: ctaPhrase },
  };
}

/**
 * Generate a UGC video prompt from style parameters
 * @param {string} style - ugc_style: 'holding_product' | 'product_usage' | 'ugc_review'
 * @param {object} data - { product_name, product_desc, gender, age, scene }
 * @returns {Promise<object>}
 */
async function generateUgCPrompt(style = 'ugc_review', data = {}) {
  const {
    product_name = '',
    product_desc = '',
    gender = 'female',
    age = '25-35',
    scene = 'home',
  } = data;

  const styleTemplateId = {
    holding_product: 'ugc-holding-product',
    product_usage: 'ugc-product-usage',
    ugc_review: 'ugc-review-video',
    product_demo: 'product-demo-1-1',
    cinematic: 'social-reel-16-9',
  }[style];

  const template = BUILT_IN_TEMPLATES.find(t => t.id === styleTemplateId);
  if (!template) {
    return {
      style,
      prompt: `${product_name} video, ${product_desc || ''} ${gender} aged ${age}, ${scene}`,
      product: product_name,
      usesLLM: false,
    };
  }

  const prompt = fillTemplate(template.template, {
    product_name,
    product_desc,
    gender,
    age,
    scene,
  });

  // Try LLM to enhance the prompt
  const systemPrompt = 'You are a video prompt engineer. Write detailed, vivid video generation prompts.';
  const userPrompt = `Enhance this video prompt for AI video generation: "${prompt}". Add visual details, camera movement suggestions, lighting, and atmosphere. Keep it under 200 words.`;

  const llmResult = await callLLM(systemPrompt, userPrompt);

  return {
    style,
    prompt: llmResult || prompt,
    product: product_name,
    usesLLM: !!llmResult,
    ugcStyle: style,
  };
}

/**
 * Full pipeline: Generate script → Generate video prompt → Generate video
 * @param {string} templateId - Template ID
 * @param {object} data - Template variables
 * @param {object} [options]
 * @param {string} [options.provider] - Video provider
 * @param {boolean} [options.generateVideo=true] - Also generate video
 * @returns {Promise<object>}
 */
async function renderTemplate(templateId, data, options = {}) {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: "${templateId}"`);
  }

  const result = {
    template: { id: template.id, name: template.name, category: template.category },
    data,
    script: null,
    video: null,
  };

  // If it's a script template, generate the script
  if (template.category === 'ugc' || template.duration) {
    const scriptResult = await generateReviewScript({
      ...data,
      duration: template.duration,
    });
    result.script = scriptResult;
  }

  // If it's a video prompt template or we should generate video
  const shouldGenerateVideo = options.generateVideo !== false;
  if (shouldGenerateVideo && template.ugcStyle) {
    // Build the video prompt from template
    const prompt = fillTemplate(template.template, data);

    // Generate video via video engine
    const videoResult = await videoEngine.generateVideo(prompt, {
      provider: options.provider,
      model: options.model,
      duration: options.duration || template.ugcStyle ? videoEngine.UGC_PRESETS[template.ugcStyle]?.duration : 8,
      aspectRatio: options.aspectRatio || template.ugcStyle ? videoEngine.UGC_PRESETS[template.ugcStyle]?.aspectRatio : '9:16',
      style: template.ugcStyle,
      fallback: true,
      saveLocally: true,
    });

    result.video = videoResult;
    result.prompt = prompt;
  }

  // If script was generated and we want video too, combine them
  if (result.script && shouldGenerateVideo && !result.video) {
    const videoPrompt = videoEngine.buildVideoPrompt(
      result.script.script || result.script,
      template.ugcStyle || 'ugc_review'
    );

    const videoResult = await videoEngine.generateVideo(videoPrompt, {
      provider: options.provider,
      duration: options.duration || 8,
      style: template.ugcStyle || 'ugc_review',
      fallback: true,
      saveLocally: true,
    });

    result.video = videoResult;
    result.prompt = videoPrompt;
  }

  return result;
}

/**
 * Render multiple templates in batch
 * @param {Array<{templateId: string, data: object, options?: object}>} renders
 * @returns {Promise<object>}
 */
async function batchRender(renders) {
  const results = [];
  for (let i = 0; i < renders.length; i++) {
    const { templateId, data, options = {} } = renders[i];
    try {
      const r = await renderTemplate(templateId, data, options);
      results.push({ index: i, templateId, success: true, result: r });
    } catch (err) {
      results.push({ index: i, templateId, success: false, error: err.message });
    }
  }
  return {
    total: renders.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };
}

// ─── Template CRUD ─────────────────────────────────────────────────────────

/**
 * List all available templates
 * @param {string} [category] - Filter by category
 * @returns {Array<object>}
 */
function listTemplates(category) {
  initTemplates();
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
  let templates = files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf-8'));
      const { template, ...meta } = data;
      return meta;
    } catch {
      return null;
    }
  }).filter(Boolean);

  if (category) {
    templates = templates.filter(t => t.category === category);
  }

  return templates;
}

/**
 * Get a specific template by ID
 * @param {string} id
 * @returns {object|null}
 */
function getTemplate(id) {
  initTemplates();
  const p = templatePath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/**
 * Create a custom template
 * @param {object} data
 * @returns {object}
 */
function createTemplate(data) {
  const id = data.id || (
    data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );

  const template = {
    id,
    name: data.name,
    description: data.description || '',
    category: data.category || 'custom',
    duration: data.duration || '8s',
    ugcStyle: data.ugcStyle || null,
    variables: data.variables || [],
    template: data.template || '',
    hooks: data.hooks || [],
    ctaPhrases: data.ctaPhrases || [],
    fallback: data.fallback || data.template || '',
    createdAt: Date.now(),
  };

  fs.writeFileSync(templatePath(id), JSON.stringify(template, null, 2));
  return template;
}

/**
 * Delete a custom template
 * @param {string} id
 * @returns {boolean}
 */
function deleteTemplate(id) {
  if (BUILT_IN_TEMPLATES.some(t => t.id === id)) return false;
  const p = templatePath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

/**
 * Get script variations (hook phrases, CTA phrases, etc.)
 * @returns {object}
 */
function getScriptVariations() {
  return {
    hooks: BUILT_IN_TEMPLATES.reduce((acc, t) => {
      if (t.hooks) acc.push(...t.hooks);
      return acc;
    }, []),
    ctas: BUILT_IN_TEMPLATES.reduce((acc, t) => {
      if (t.ctaPhrases) acc.push(...t.ctaPhrases);
      return acc;
    }, []),
    tones: ['เป็นกันเอง', 'พูดเร็ว', 'จริงใจ', 'เป็นทางการ', 'สนุกสนาน', 'อบอุ่น'],
    benefits: ['คุณภาพดี', 'คุ้มค่า', 'ใช้งานง่าย', 'ได้ผลจริง', 'ปลอดภัย'],
  };
}

// ─── Subtitle Generation ──────────────────────────────────────────────────

/**
 * Generate simple subtitles/SRT content from script text
 * @param {string} script - The script text
 * @param {number} duration - Video duration in seconds
 * @returns {string} SRT format subtitles
 */
function generateSubtitles(script, duration = 8) {
  // Split script into segments by newlines or punctuation
  const segments = script
    .replace(/\[.*?\]/g, '') // Remove [Hook], [Value] etc.
    .split(/[\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (!segments.length) return '';

  const segmentDuration = duration / segments.length;
  const srtLines = [];

  segments.forEach((text, i) => {
    const startTime = i * segmentDuration;
    const endTime = Math.min((i + 1) * segmentDuration, duration);

    const startFormatted = formatSRTTime(startTime);
    const endFormatted = formatSRTTime(endTime);

    srtLines.push(
      (i + 1).toString(),
      `${startFormatted} --> ${endFormatted}`,
      text,
      ''
    );
  });

  return srtLines.join('\n');
}

function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  renderTemplate,
  batchRender,
  generateReviewScript,
  generateUgCPrompt,
  generateSubtitles,
  getScriptVariations,
  fetchProductFromERP,
  BUILT_IN_TEMPLATES,
  TEMPLATES_DIR,
  callLLM,
};
