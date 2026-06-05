/**
 * Template Manager — WordPress content templates for AI generation
 *
 * Provides templates for blog posts, product pages, landing pages,
 * and other content types that guide AI generation.
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, 'data', 'templates');

// ── Default Templates ────────────────────────────────────────────

const DEFAULT_TEMPLATES = {
  'default': {
    name: 'Default Blog Post',
    description: 'Standard blog post with introduction, body, and conclusion',
    type: 'post',
    structure: ['introduction', 'body', 'conclusion'],
    systemPrompt: 'Write a well-structured blog post with clear headings and actionable insights.',
  },
  'product-review': {
    name: 'Product Review',
    description: 'In-depth product review with pros/cons and rating',
    type: 'post',
    structure: ['introduction', 'overview', 'features', 'pros-cons', 'verdict', 'faq'],
    systemPrompt: 'Write an honest, detailed product review. Include pros/cons list and a final verdict.',
  },
  'tutorial': {
    name: 'How-To Tutorial',
    description: 'Step-by-step tutorial with numbered instructions',
    type: 'post',
    structure: ['introduction', 'prerequisites', 'steps', 'conclusion'],
    systemPrompt: 'Write a clear step-by-step tutorial. Number each step and include tips.',
  },
  'listicle': {
    name: 'Listicle',
    description: 'Top N list-style article',
    type: 'post',
    structure: ['introduction', 'list-items', 'conclusion'],
    systemPrompt: 'Write an engaging list-style article. Each item should have a clear heading and description.',
  },
  'landing-page': {
    name: 'Landing Page',
    description: 'Marketing landing page with hero, features, CTA',
    type: 'page',
    structure: ['hero', 'features', 'benefits', 'testimonials', 'cta'],
    systemPrompt: 'Write persuasive landing page content focused on conversion and clear value proposition.',
  },
  'about-page': {
    name: 'About Page',
    description: 'Company about page with mission and team',
    type: 'page',
    structure: ['hero', 'mission', 'story', 'team', 'values'],
    systemPrompt: 'Write a compelling about page that tells the company story and builds trust.',
  },
};

// ── Template Manager ──────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
}

async function listTemplates() {
  ensureDir();
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
  const templates = { ...DEFAULT_TEMPLATES };

  // Load custom templates
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf-8'));
      const key = file.replace('.json', '');
      templates[key] = data;
    } catch (e) {
      console.warn(`[templates] Skipping ${file}: ${e.message}`);
    }
  }

  return {
    total: Object.keys(templates).length,
    templates: Object.entries(templates).map(([key, t]) => ({
      id: key,
      name: t.name,
      description: t.description,
      type: t.type,
      structure: t.structure,
    })),
  };
}

async function createTemplate(data) {
  ensureDir();
  const { id, name, description, type, structure, systemPrompt } = data;

  if (!id || !name) throw new Error('Template requires id and name');

  const template = {
    name,
    description: description || '',
    type: type || 'post',
    structure: structure || ['introduction', 'body', 'conclusion'],
    systemPrompt: systemPrompt || 'Write high-quality content.',
  };

  const filePath = path.join(TEMPLATES_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(template, null, 2));

  return { success: true, id, template };
}

async function renderTemplate(templateId, variables = {}) {
  const templates = await listTemplates();
  const found = templates.templates.find(t => t.id === templateId);

  if (!found) throw new Error(`Template "${templateId}" not found`);

  let content = '';
  let sections = [];

  if (found.structure) {
    for (const section of found.structure) {
      const sectionContent = variables[section] || `[${section.toUpperCase()}]`;
      sections.push({
        type: section,
        placeholder: !variables[section],
        content: sectionContent,
      });
      content += `<section class="wp-${section}">${sectionContent}</section>\n`;
    }
  }

  return { template: found, sections, content, rendered: content };
}

module.exports = { listTemplates, createTemplate, renderTemplate };
