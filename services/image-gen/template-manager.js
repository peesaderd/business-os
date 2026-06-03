'use strict';

/**
 * Template Manager — Image template system for social media, products, banners, logos
 *
 * Templates define parametric image generation — users fill in variables
 * (product name, description, colors) and the system generates brand-consistent images.
 *
 * A template is a JSON schema describing:
 *  - Template metadata (name, description, category, aspect ratio)
 *  - Variable fields that the user fills
 *  - A prompt template string with {{variable}} placeholders
 *  - Brand integration (optional)
 */

const fs = require('fs');
const path = require('path');
const imageEngine = require('./image-engine');
const brandManager = require('./brand-manager');

// ─── Configuration ─────────────────────────────────────────────────────────

const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(__dirname, 'data', 'templates');

if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

// ─── Built-in Templates ────────────────────────────────────────────────────

const BUILT_IN_TEMPLATES = [
  {
    id: 'product-photo-standard',
    name: 'Product Photo — Standard',
    description: 'Standard e-commerce product photo on white background',
    category: 'product',
    aspectRatio: '1:1',
    modelTier: 'quality',
    upscale: true,
    defaultPrompt: 'Professional product photography of {{productName}}, {{description}}, pure white background, clean studio lighting, high detail, sharp focus, no watermark',
    variables: [
      { key: 'productName', label: 'Product Name', type: 'string', required: true },
      { key: 'description', label: 'Description', type: 'string', required: false, default: '' },
    ],
  },
  {
    id: 'product-photo-lifestyle',
    name: 'Product Photo — Lifestyle',
    description: 'Lifestyle product photo in a natural setting',
    category: 'product',
    aspectRatio: '4:5',
    modelTier: 'quality',
    upscale: true,
    defaultPrompt: 'Lifestyle product photography of {{productName}}, {{description}}, natural setting, soft natural lighting, authentic lifestyle scene, warm tones, candid, no watermark, high quality',
    variables: [
      { key: 'productName', label: 'Product Name', type: 'string', required: true },
      { key: 'description', label: 'Description', type: 'string', required: false, default: '' },
      { key: 'setting', label: 'Setting/Environment', type: 'string', required: false, default: 'home interior' },
    ],
  },
  {
    id: 'social-instagram-square',
    name: 'Instagram — Square Post',
    description: 'Square social media post for Instagram feed',
    category: 'social',
    aspectRatio: '1:1',
    modelTier: 'fast',
    upscale: false,
    defaultPrompt: 'Social media post design for {{brandName}}, {{message}}, modern aesthetic, clean layout, engaging visual, brand colors {{colors}}, high quality social media content, no text overlay',
    variables: [
      { key: 'brandName', label: 'Brand Name', type: 'string', required: true },
      { key: 'message', label: 'Message/Theme', type: 'string', required: false, default: 'brand promotion' },
      { key: 'colors', label: 'Brand Colors', type: 'string', required: false, default: 'modern palette' },
    ],
  },
  {
    id: 'social-instagram-story',
    name: 'Instagram — Story (9:16)',
    description: 'Vertical Instagram Story format',
    category: 'social',
    aspectRatio: '9:16',
    modelTier: 'fast',
    upscale: false,
    defaultPrompt: 'Instagram story background for {{brandName}}, {{message}}, vertical format, modern design, engaging visuals, brand colors {{colors}}, soft gradients, high quality background, no text',
    variables: [
      { key: 'brandName', label: 'Brand Name', type: 'string', required: true },
      { key: 'message', label: 'Message', type: 'string', required: false, default: 'brand story' },
      { key: 'colors', label: 'Colors', type: 'string', required: false, default: 'warm modern' },
    ],
  },
  {
    id: 'banner-website',
    name: 'Website Banner — 16:9',
    description: 'Wide banner for website headers or hero sections',
    category: 'banner',
    aspectRatio: '16:9',
    modelTier: 'quality',
    upscale: true,
    defaultPrompt: 'Professional website banner for {{brandName}}, {{message}}, wide landscape format, clean modern design, brand colors {{colors}}, sophisticated background, high quality, no text overlay, no watermark',
    variables: [
      { key: 'brandName', label: 'Brand Name', type: 'string', required: true },
      { key: 'message', label: 'Theme/Message', type: 'string', required: false, default: 'professional business banner' },
      { key: 'colors', label: 'Colors', type: 'string', required: false, default: 'professional blue and white' },
    ],
  },
  {
    id: 'banner-shop',
    name: 'Shop Banner — Etsy/Shopify',
    description: 'Banner optimized for online shop headers',
    category: 'banner',
    aspectRatio: '16:9',
    modelTier: 'quality',
    upscale: true,
    defaultPrompt: 'Online shop banner for {{shopName}}, {{description}}, {{category}} products, stylish background, professional e-commerce banner, brand identity, modern shop design, no text, no watermark',
    variables: [
      { key: 'shopName', label: 'Shop Name', type: 'string', required: true },
      { key: 'description', label: 'Shop Description', type: 'string', required: false, default: 'unique handmade products' },
      { key: 'category', label: 'Product Category', type: 'string', required: false, default: 'handmade' },
    ],
  },
  {
    id: 'logo-minimal',
    name: 'Logo — Minimalist',
    description: 'Minimalist brand logo on solid background',
    category: 'logo',
    aspectRatio: '1:1',
    modelTier: 'quality',
    upscale: true,
    defaultPrompt: 'Minimalist logo for {{brandName}}, {{industry}} industry, simple clean icon, solid {{background}} background, professional brand identity, vector style, centered design, high contrast, no text in image',
    variables: [
      { key: 'brandName', label: 'Brand Name', type: 'string', required: true },
      { key: 'industry', label: 'Industry', type: 'string', required: false, default: 'general' },
      { key: 'background', label: 'Background Color', type: 'string', required: false, default: 'white' },
    ],
  },
  {
    id: 'product-collection',
    name: 'Product Collection — Multiple Items',
    description: 'Multiple products arranged in a collection shot',
    category: 'product',
    aspectRatio: '16:9',
    modelTier: 'quality',
    upscale: true,
    defaultPrompt: 'Product collection flat lay of {{productNames}}, {{description}}, beautifully arranged on {{surface}}, top-down view, natural lighting, soft shadows, professional product photography, no watermark',
    variables: [
      { key: 'productNames', label: 'Product Names (comma-separated)', type: 'string', required: true },
      { key: 'description', label: 'Description', type: 'string', required: false, default: 'various products' },
      { key: 'surface', label: 'Surface/Background', type: 'string', required: false, default: 'white marble surface' },
    ],
  },
  {
    id: 'flyer-promo',
    name: 'Promotional Flyer — 4:5',
    description: 'Promotional flyer in portrait 4:5 format',
    category: 'marketing',
    aspectRatio: '4:5',
    modelTier: 'quality',
    upscale: true,
    defaultPrompt: 'Promotional flyer design for {{brandName}}, {{promotionText}}, portrait format, professional marketing design, bold visual, brand colors {{colors}}, promotional background, engaging layout, no text, no watermark',
    variables: [
      { key: 'brandName', label: 'Brand Name', type: 'string', required: true },
      { key: 'promotionText', label: 'Promotion Text', type: 'string', required: false, default: 'special offer' },
      { key: 'colors', label: 'Colors', type: 'string', required: false, default: 'bold accent' },
    ],
  },
  {
    id: 'portfolio-thumbnail',
    name: 'Thumbnail — YouTube/Social',
    description: 'Eye-catching thumbnail for videos or portfolios',
    category: 'marketing',
    aspectRatio: '16:9',
    modelTier: 'fast',
    upscale: false,
    defaultPrompt: 'Eye-catching thumbnail for {{title}}, bold composition, high contrast, {{style}} style, engaging visual, professional content thumbnail, vibrant colors, no text, no watermark',
    variables: [
      { key: 'title', label: 'Title/Subject', type: 'string', required: true },
      { key: 'style', label: 'Visual Style', type: 'string', required: false, default: 'modern' },
    ],
  },
];

// ─── Template CRUD ─────────────────────────────────────────────────────────

/**
 * Get template file path
 */
function templatePath(id) {
  return path.join(TEMPLATES_DIR, `${id}.json`);
}

/**
 * Initialize built-in templates on first run
 */
function initTemplates() {
  const existing = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
  if (existing.length === 0) {
    for (const tpl of BUILT_IN_TEMPLATES) {
      fs.writeFileSync(templatePath(tpl.id), JSON.stringify(tpl, null, 2));
    }
  }
}

/**
 * List all available templates
 * @param {string} [category] - Filter by category: 'product' | 'social' | 'banner' | 'logo' | 'marketing'
 * @returns {Array<object>}
 */
function listTemplates(category) {
  initTemplates();

  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
  let templates = files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf-8'));
      // Return metadata only (no defaultPrompt to keep response lightweight)
      const { defaultPrompt, ...meta } = data;
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
 * @param {object} templateData
 * @returns {object}
 */
function createTemplate(templateData) {
  const id = templateData.id || (
    templateData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );

  const template = {
    id,
    name: templateData.name,
    description: templateData.description || '',
    category: templateData.category || 'custom',
    aspectRatio: templateData.aspectRatio || '1:1',
    modelTier: templateData.modelTier || 'fast',
    upscale: templateData.upscale ?? false,
    defaultPrompt: templateData.defaultPrompt || '',
    variables: templateData.variables || [],
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
  // Don't allow deleting built-in templates
  if (BUILT_IN_TEMPLATES.some(t => t.id === id)) {
    return false;
  }
  const p = templatePath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

// ─── Template Rendering ────────────────────────────────────────────────────

/**
 * Validate variable data against template variable schema
 * @param {object} template
 * @param {object} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTemplateData(template, data) {
  const errors = [];

  for (const variable of (template.variables || [])) {
    if (variable.required) {
      const value = data[variable.key];
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push(`Missing required variable: "${variable.key}" (${variable.label})`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Render a prompt template by filling in variables
 * @param {string} promptTemplate - Template string with {{variable}} placeholders
 * @param {object} data           - Variable values
 * @returns {string}
 */
function renderPromptTemplate(promptTemplate, data) {
  let prompt = promptTemplate;

  // Replace {{variable}} with actual values
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    const val = value !== null && value !== undefined ? String(value) : '';
    prompt = prompt.replaceAll(placeholder, val);
  }

  // Clean up any remaining unfilled placeholders
  prompt = prompt.replace(/\{\{[\w]+\}\}/g, '');

  // Clean up double commas, trailing/leading commas
  prompt = prompt
    .replace(/,+/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/^,\s*/, '')
    .replace(/,\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return prompt;
}

/**
 * Render a template — fill data and generate image
 * @param {string} templateId      - Template ID
 * @param {object} data            - Variable values { variableName: value }
 * @param {object} [options]
 * @param {string} [options.brandId] - Brand profile ID for color/style context
 * @param {number} [options.count]   - Number of images
 * @returns {Promise<object>}
 */
async function renderTemplate(templateId, data, options = {}) {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error(`Template not found: "${templateId}"`);
  }

  // Validate required variables
  const validation = validateTemplateData(template, data);
  if (!validation.valid) {
    throw new Error(`Template validation failed: ${validation.errors.join('; ')}`);
  }

  // Merge with brand profile if specified
  let brandColors = '';
  let brandStyle = '';
  if (options.brandId) {
    const brand = brandManager.getBrandProfile(options.brandId);
    if (brand) {
      brandColors = Object.values(brand.colors).join(', ');
      brandStyle = brand.style;
      // Add brand colors to data so {{colors}} gets filled
      if (!data.colors) {
        data.colors = brandColors;
      }
      if (!data.style) {
        data.style = brandStyle;
      }
    }
  }

  // Render the prompt
  const prompt = renderPromptTemplate(template.defaultPrompt, data);

  // Determine generation options
  const aspectRatio = data.aspectRatio || template.aspectRatio || '1:1';
  const modelTier = data.modelTier || template.modelTier || 'fast';
  const count = options.count || data.count || 1;

  // Generate the image
  const result = await imageEngine.generateImage(prompt, {
    modelTier,
    aspectRatio,
    count,
    upscale: template.upscale !== false,
    rawPrompt: true,
  });

  return {
    template: {
      id: template.id,
      name: template.name,
      category: template.category,
    },
    data,
    prompt,
    brandId: options.brandId || null,
    image: result,
  };
}

/**
 * Render multiple templates in batch
 * @param {Array<{templateId: string, data: object, options?: object}>} renders
 * @returns {Promise<Array<object>>}
 */
async function batchRender(renders) {
  const results = [];
  for (let i = 0; i < renders.length; i++) {
    const { templateId, data, options = {} } = renders[i];
    try {
      const result = await renderTemplate(templateId, data, options);
      results.push({ index: i, templateId, success: true, result });
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

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  renderTemplate,
  batchRender,
  renderPromptTemplate,
  BUILT_IN_TEMPLATES,
  TEMPLATES_DIR,
};
