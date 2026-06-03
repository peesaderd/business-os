'use strict';

/**
 * Brand Manager — Brand asset profiles and generation
 *
 * Manages brand identities (colors, fonts, logos, style guides)
 * and generates brand-consistent images using the Image Engine.
 */

const fs = require('fs');
const path = require('path');
const imageEngine = require('./image-engine');

// ─── Configuration ─────────────────────────────────────────────────────────

const BRAND_PROFILES_DIR = process.env.BRAND_PROFILES_DIR || path.join(__dirname, 'data', 'brand-profiles');
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(__dirname, 'data', 'templates');

// Ensure directories exist
[BRAND_PROFILES_DIR, TEMPLATES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ─── Brand Profile Schema ──────────────────────────────────────────────────

/**
 * @typedef {object} BrandProfile
 * @property {string} id          - Unique identifier
 * @property {string} name        - Brand / business name
 * @property {string} [description]
 * @property {object} colors
 * @property {string} colors.primary       - Primary hex color
 * @property {string} colors.secondary     - Secondary hex color
 * @property {string} colors.accent        - Accent hex color
 * @property {string} colors.background    - Background hex color
 * @property {string} colors.text          - Text hex color
 * @property {object} [fonts]
 * @property {string} fonts.heading        - Heading font name
 * @property {string} fonts.body           - Body font name
 * @property {string} [logoUrl]            - URL to brand logo image
 * @property {string} [style]              - Overall brand style (minimal, bold, elegant, playful, etc.)
 * @property {string} [industry]           - Industry (fashion, food, tech, etc.)
 * @property {number} createdAt
 * @property {number} updatedAt
 */

// ─── Brand Profile CRUD ────────────────────────────────────────────────────

/**
 * Get the path to a brand profile file
 */
function profilePath(id) {
  return path.join(BRAND_PROFILES_DIR, `${id}.json`);
}

/**
 * List all brand profiles
 * @returns {Array<BrandProfile>}
 */
function listBrandProfiles() {
  const files = fs.readdirSync(BRAND_PROFILES_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(BRAND_PROFILES_DIR, f), 'utf-8'));
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Get a brand profile by ID
 * @param {string} id
 * @returns {BrandProfile|null}
 */
function getBrandProfile(id) {
  const p = profilePath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/**
 * Create a new brand profile
 * @param {object} data
 * @param {string} data.name
 * @param {object} [data.colors]
 * @param {string} [data.colors.primary]
 * @param {string} [data.colors.secondary]
 * @param {string} [data.colors.accent]
 * @param {string} [data.colors.background]
 * @param {string} [data.colors.text]
 * @param {object} [data.fonts]
 * @param {string} [data.style]
 * @param {string} [data.industry]
 * @returns {BrandProfile}
 */
function createBrandProfile(data) {
  const id = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') + '_' + Date.now().toString(36);

  const profile = {
    id,
    name: data.name,
    description: data.description || '',
    colors: {
      primary: data.colors?.primary || '#333333',
      secondary: data.colors?.secondary || '#666666',
      accent: data.colors?.accent || '#FF6B35',
      background: data.colors?.background || '#FFFFFF',
      text: data.colors?.text || '#111111',
    },
    fonts: {
      heading: data.fonts?.heading || 'Inter',
      body: data.fonts?.body || 'Inter',
    },
    logoUrl: data.logoUrl || '',
    style: data.style || 'minimal',
    industry: data.industry || 'general',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  fs.writeFileSync(profilePath(id), JSON.stringify(profile, null, 2));
  return profile;
}

/**
 * Update an existing brand profile
 * @param {string} id
 * @param {object} updates - Partial brand profile data
 * @returns {BrandProfile|null}
 */
function updateBrandProfile(id, updates) {
  const profile = getBrandProfile(id);
  if (!profile) return null;

  // Merge deep for colors
  if (updates.colors) {
    profile.colors = { ...profile.colors, ...updates.colors };
  }
  if (updates.fonts) {
    profile.fonts = { ...profile.fonts, ...updates.fonts };
  }

  // Merge scalar fields
  const scalarFields = ['name', 'description', 'logoUrl', 'style', 'industry'];
  for (const field of scalarFields) {
    if (updates[field] !== undefined) {
      profile[field] = updates[field];
    }
  }

  profile.updatedAt = Date.now();
  fs.writeFileSync(profilePath(id), JSON.stringify(profile, null, 2));
  return profile;
}

/**
 * Delete a brand profile
 * @param {string} id
 * @returns {boolean}
 */
function deleteBrandProfile(id) {
  const p = profilePath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

// ─── Brand Asset Generation ────────────────────────────────────────────────

/**
 * Asset type prompts for brand-consistent image generation
 */
const ASSET_TYPE_PROMPTS = {
  logo: {
    defaultPrompt: 'minimalist brand logo, clean vector style, solid background, centered icon, professional corporate identity, no text',
    imageSize: 'square_hd',
  },
  banner: {
    defaultPrompt: 'wide business banner, gradient background, clean modern design, brand-oriented, professional marketing banner',
    count: 1,
  },
  social_post: {
    defaultPrompt: 'social media post design, modern aesthetic, clean layout, engaging visual, professional content marketing',
    imageSize: 'square_hd',
  },
  product_photo: {
    defaultPrompt: 'professional product photography, pure white background, studio lighting, high detail',
    imageSize: 'square_hd',
  },
  profile_picture: {
    defaultPrompt: 'professional profile picture, clean background, business portrait style',
    imageSize: 'square_hd',
  },
  thumbnail: {
    defaultPrompt: 'eye-catching thumbnail image, high contrast, bold composition, 16:9 landscape, clickable design',
    count: 1,
  },
  flyer: {
    defaultPrompt: 'marketing flyer design, professional layout, promotional content, clean hierarchy, 4:5 portrait',
    count: 1,
  },
};

/**
 * Generate a brand-consistent asset
 * @param {object} brandConfig
 * @param {string} brandConfig.brandName   - Brand name
 * @param {object} [brandConfig.colors]    - Color palette
 * @param {string} [brandConfig.assetType] - 'logo' | 'banner' | 'social_post' | 'product_photo' | etc.
 * @param {string} [brandConfig.style]
 * @param {string} [brandConfig.industry]
 * @param {object} [imageOptions]          - Overrides for image generation
 * @returns {Promise<object>}
 */
async function generateBrandAsset(brandConfig, imageOptions = {}) {
  const brandName = brandConfig.brandName || 'Brand';
  const assetType = brandConfig.assetType || 'logo';
  const colors = brandConfig.colors || {};
  const style = brandConfig.style || 'minimal';
  const industry = brandConfig.industry || 'general';

  // Look up asset type prompt config
  const assetConfig = ASSET_TYPE_PROMPTS[assetType] || ASSET_TYPE_PROMPTS.logo;

  // Build a brand-aware prompt
  const colorDesc = Object.entries(colors)
    .filter(([k, v]) => k !== 'text' && k !== 'background' && v)
    .map(([k, v]) => `${k} color ${v}`)
    .join(', ');

  const promptParts = [
    brandName ? `"${brandName}" brand` : '',
    assetConfig.defaultPrompt,
    style ? `${style} style` : '',
    industry ? `for ${industry} industry` : '',
    colorDesc ? `using ${colorDesc}` : '',
    'no watermark, no text overlay, high quality',
  ].filter(Boolean);

  const prompt = promptParts.join(', ');

  // Determine aspect ratio per asset type
  let aspectRatio = imageOptions.aspectRatio;
  if (!aspectRatio) {
    if (assetType === 'banner') aspectRatio = '16:9';
    else if (assetType === 'flyer') aspectRatio = '4:5';
    else if (assetType === 'thumbnail') aspectRatio = '16:9';
    else aspectRatio = '1:1';
  }

  const count = imageOptions.count || assetConfig.count || 1;
  const modelTier = imageOptions.modelTier || 'fast';
  const upscale = imageOptions.upscale ?? true;

  // Generate using the image engine
  const result = await imageEngine.generateImage(prompt, {
    modelTier,
    aspectRatio,
    count,
    upscale,
    rawPrompt: true,  // We already built a complete prompt
  });

  return {
    brandName,
    assetType,
    brandConfig: {
      style,
      industry,
      colors,
    },
    image: result,
  };
}

/**
 * Generate a brand logo specifically
 * @param {string} brandName
 * @param {object} [brandProfile] - Optional existing brand profile
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function generateLogo(brandName, brandProfile = null, options = {}) {
  const brandConfig = {
    brandName,
    assetType: 'logo',
    colors: brandProfile?.colors || {},
    style: brandProfile?.style || options.style || 'minimal',
    industry: brandProfile?.industry || options.industry || 'general',
  };
  return generateBrandAsset(brandConfig, options);
}

/**
 * Generate a social media post image for a brand
 * @param {string} brandName
 * @param {object} [brandProfile]
 * @param {object} [options]
 * @param {string} [options.caption] - Additional context for the prompt
 * @returns {Promise<object>}
 */
async function generateSocialPost(brandName, brandProfile = null, options = {}) {
  const brandConfig = {
    brandName,
    assetType: 'social_post',
    colors: brandProfile?.colors || {},
    style: brandProfile?.style || options.style || 'minimal',
    industry: brandProfile?.industry || options.industry || 'general',
  };

  const imageOptions = { ...options };
  if (options.caption) {
    imageOptions.customPrompt = `${brandName} brand social media post, ${options.caption}`;
  }

  return generateBrandAsset(brandConfig, imageOptions);
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  listBrandProfiles,
  getBrandProfile,
  createBrandProfile,
  updateBrandProfile,
  deleteBrandProfile,
  generateBrandAsset,
  generateLogo,
  generateSocialPost,
  ASSET_TYPE_PROMPTS,
  BRAND_PROFILES_DIR,
};
