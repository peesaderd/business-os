/**
 * site-manager.js — Site CRUD, persistence, and publishing
 *
 * Manages the full lifecycle of generated websites:
 * - In-memory store with JSON file persistence
 * - CRUD operations (create, read, update, delete)
 * - Publishing (generates static HTML export)
 * - Export (HTML, React component JSON)
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { generateSite, regenerateSection, regenerateSite } = require('./site-generator');
const { getTemplate, listTemplates } = require('./templates');

// ─── Storage ──────────────────────────────────────────────────────────────────

class SiteStore {
  constructor(dbPath) {
    this.sites = new Map();
    this.dbPath = dbPath || process.env.SITES_DB_PATH || path.join(__dirname, 'data', 'sites.json');
    this._ensureDbDir();
    this._load();
  }

  _ensureDbDir() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const arr = JSON.parse(raw);
        for (const site of arr) {
          this.sites.set(site.id, site);
        }
        console.log(`[SiteManager] Loaded ${arr.length} sites from ${this.dbPath}`);
      } else {
        console.log('[SiteManager] No existing sites db, starting fresh.');
      }
    } catch (err) {
      console.error('[SiteManager] Error loading sites db:', err.message);
    }
  }

  _save() {
    try {
      const arr = Array.from(this.sites.values());
      fs.writeFileSync(this.dbPath, JSON.stringify(arr, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[SiteManager] Error saving sites db:', err.message);
      return false;
    }
  }

  getAll() {
    return Array.from(this.sites.values());
  }

  get(id) {
    return this.sites.get(id) || null;
  }

  set(id, site) {
    this.sites.set(id, site);
    this._save();
  }

  delete(id) {
    const existed = this.sites.has(id);
    this.sites.delete(id);
    if (existed) this._save();
    return existed;
  }

  update(id, updates) {
    const site = this.sites.get(id);
    if (!site) return null;
    Object.assign(site, updates);
    site.meta = site.meta || {};
    site.meta.updatedAt = Date.now();
    this._save();
    return site;
  }
}

// ─── Site Manager ─────────────────────────────────────────────────────────────

class SiteManager {
  constructor() {
    this.store = new SiteStore();
    this.publishDir = path.join(__dirname, 'published');
  }

  /**
   * Generate and store a new site from a prompt.
   */
  async createFromPrompt(prompt, templateKey = 'business-landing', businessType = '') {
    const site = await generateSite(prompt, templateKey, businessType);
    site.id = uuidv4();
    site.createdAt = Date.now();
    site.updatedAt = Date.now();
    site.publishedUrl = '';
    site.publishedAt = null;
    site.meta = site.meta || {};
    site.meta.createdAt = Date.now();

    this.store.set(site.id, site);
    return site;
  }

  /**
   * Get all sites.
   */
  listSites() {
    return this.store.getAll().map(s => ({
      id: s.id,
      name: s.name,
      template: s.template,
      businessType: s.businessType,
      sectionCount: s.sections?.length || 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      publishedUrl: s.publishedUrl,
      published: !!s.publishedUrl,
    }));
  }

  /**
   * Get a single site with full data.
   */
  getSite(id) {
    return this.store.get(id);
  }

  /**
   * Update an entire site (sections, styles).
   */
  updateSite(id, updates) {
    const allowed = ['name', 'sections', 'styles', 'sections', 'businessType'];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        filtered[key] = updates[key];
      }
    }

    const site = this.store.update(id, filtered);
    if (site) {
      // When sections are updated via editor, regenerate meta
      if (updates.sections) {
        site.meta.sectionCount = updates.sections.length;
        site.meta.editedAt = Date.now();
      }
    }
    return site;
  }

  /**
   * Delete a site.
   */
  deleteSite(id) {
    return this.store.delete(id);
  }

  /**
   * Publish a site — generates a static HTML file.
   */
  publishSite(id) {
    const site = this.store.get(id);
    if (!site) return null;

    const html = this._generateStaticHtml(site);
    const fileName = `${site.id}.html`;
    const filePath = path.join(this.publishDir, fileName);

    if (!fs.existsSync(this.publishDir)) {
      fs.mkdirSync(this.publishDir, { recursive: true });
    }

    fs.writeFileSync(filePath, html, 'utf-8');
    console.log(`[SiteManager] Published ${id} to ${filePath}`);

    const updatedSite = this.store.update(id, {
      publishedUrl: `/published/${fileName}`,
      publishedAt: Date.now(),
      publishedHtml: html,
    });

    return {
      site: updatedSite || site,
      html,
      filePath,
      url: `/published/${fileName}`,
    };
  }

  /**
   * Export a site as HTML or React component JSON.
   */
  exportSite(id, format = 'html') {
    const site = this.store.get(id);
    if (!site) return null;

    if (format === 'react') {
      return this._exportAsReact(site);
    }

    // Default: HTML
    return {
      format: 'html',
      html: this._generateStaticHtml(site),
      site,
    };
  }

  /**
   * Regenerate a specific section.
   */
  async regenerateSection(id, sectionIndex, prompt) {
    const site = this.store.get(id);
    if (!site) return null;

    const updated = await regenerateSection(site, sectionIndex, prompt);
    this._save();
    return updated;
  }

  /**
   * List available templates.
   */
  listTemplates() {
    return listTemplates();
  }

  // ─── Export Generators ──────────────────────────────────────────────────────

  _generateStaticHtml(site) {
    const styles = site.styles || {};
    const sections = site.sections || [];

    const sectionHtmls = sections.map((sec, i) => this._renderSection(sec, i, styles));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Business OS Website Builder v0.1.0">
  <title>${escapeHtml(site.name)}</title>
  <style>
    :root {
      --primary: ${styles.primaryColor || '#2563eb'};
      --secondary: ${styles.secondaryColor || '#1e40af'};
      --font-family: ${styles.fontFamily || 'Inter, system-ui, sans-serif'};
      --heading-font: ${styles.headingFont || 'Inter, system-ui, sans-serif'};
      --radius: ${styles.borderRadius || '8px'};
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-family);
      color: ${styles.bodyTextColor || '#334155'};
      background: ${styles.bodyBackground || '#ffffff'};
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    h1, h2, h3, h4, h5, h6 { font-family: var(--heading-font); color: ${styles.headingColor || '#1e293b'}; }
    a { color: ${styles.linkColor || styles.primaryColor || '#2563eb'}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; height: auto; }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    .section { padding: 60px 20px; }
    .section-heading { text-align: center; margin-bottom: 16px; font-size: 2rem; }
    .section-subheading { text-align: center; margin-bottom: 40px; color: #64748b; font-size: 1.1rem; }
    .grid { display: grid; gap: 24px; }
    .grid-2 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }
    .grid-4 { grid-template-columns: repeat(4, 1fr); }
    .btn {
      display: inline-block; padding: 12px 32px;
      background: var(--primary); color: #fff;
      border: none; border-radius: var(--radius);
      font-size: 1rem; cursor: pointer; transition: opacity 0.2s;
      text-decoration: none;
    }
    .btn:hover { opacity: 0.9; text-decoration: none; }
    @media (max-width: 768px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
      .section { padding: 40px 16px; }
    }
  </style>
</head>
<body>
  ${sectionHtmls.join('\n  ')}
</body>
</html>`;
  }

  _renderSection(section, index, styles) {
    if (!section || !section.type) return '';

    switch (section.type) {
      case 'hero': return this._renderHero(section, styles);
      case 'features': return this._renderFeatures(section);
      case 'pricing': return this._renderPricing(section);
      case 'about': return this._renderAbout(section);
      case 'contact': return this._renderContact(section);
      case 'footer': return this._renderFooter(section);
      case 'products': return this._renderProducts(section);
      case 'testimonials': return this._renderTestimonials(section);
      case 'gallery': return this._renderGallery(section);
      case 'services': return this._renderServices(section);
      default: return `<!-- Unknown section type: ${section.type} -->`;
    }
  }

  _renderHero(section, styles) {
    const c = section.content || {};
    const s = section.styles || {};
    const bgCss = c.backgroundType === 'gradient'
      ? `background: ${c.backgroundValue};`
      : `background-color: ${styles.primaryColor};`;

    return `<section class="hero" style="${bgCss} padding: ${s.padding?.top || 80}px 20px; text-align: ${c.alignment || 'center'};">
      <div class="container">
        <h1 style="font-size: ${s.headingSize || '3rem'}; color: ${s.textColor || '#fff'}; margin-bottom: 16px;">${escapeHtml(c.heading)}</h1>
        ${c.subheading ? `<p style="font-size: 1.25rem; color: ${s.textColor || '#fff'}; opacity: 0.9; margin-bottom: 32px; max-width: 600px; margin-left: auto; margin-right: auto;">${escapeHtml(c.subheading)}</p>` : ''}
        ${c.ctaText ? `<a href="${escapeHtml(c.ctaUrl)}" class="btn" style="background: #fff; color: ${styles.primaryColor};">${escapeHtml(c.ctaText)}</a>` : ''}
      </div>
    </section>`;
  }

  _renderFeatures(section) {
    const c = section.content || {};
    const s = section.styles || {};
    const cols = Math.min(c.columns || 3, 4);

    return `<section class="section" style="background: ${s.background || '#f8fafc'};">
      <div class="container">
        <h2 class="section-heading" style="color: ${s.headingColor};">${escapeHtml(c.heading)}</h2>
        ${c.subheading ? `<p class="section-subheading">${escapeHtml(c.subheading)}</p>` : ''}
        <div class="grid grid-${cols}">
          ${(c.items || []).map(item => `
            <div style="background: ${s.cardBackground}; border-radius: ${s.cardBorderRadius}; box-shadow: ${s.cardShadow}; padding: 24px;">
              <div style="width: 48px; height: 48px; background: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; color: #fff; font-size: 1.2rem;">✦</div>
              <h3 style="font-size: 1.1rem; margin-bottom: 8px; color: ${s.headingColor};">${escapeHtml(item.title)}</h3>
              <p style="color: ${s.textColor}; font-size: 0.95rem;">${escapeHtml(item.description)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;
  }

  _renderPricing(section) {
    const c = section.content || {};
    const s = section.styles || {};

    return `<section class="section" style="background: ${s.background || '#ffffff'};">
      <div class="container">
        <h2 class="section-heading" style="color: ${s.headingColor};">${escapeHtml(c.heading)}</h2>
        ${c.subheading ? `<p class="section-subheading">${escapeHtml(c.subheading)}</p>` : ''}
        <div class="grid grid-${Math.min((c.items || []).length, 3)}">
          ${(c.items || []).map(tier => `
            <div style="background: ${s.cardBackground}; border: ${tier.highlighted ? s.highlightedCardBorder || '2px solid var(--primary)' : s.cardBorder || '1px solid #e2e8f0'}; border-radius: var(--radius); padding: 32px; text-align: center; ${tier.highlighted ? 'transform: scale(1.05);' : ''}">
              <h3 style="margin-bottom: 8px;">${escapeHtml(tier.name)}</h3>
              <div style="font-size: 2.5rem; font-weight: 700; color: ${s.priceColor || 'var(--primary)'}; margin-bottom: 24px;">${escapeHtml(tier.price)}</div>
              <ul style="list-style: none; text-align: left; margin-bottom: 24px;">
                ${(tier.features || []).map(f => `<li style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: ${s.textColor};">✓ ${escapeHtml(f)}</li>`).join('')}
              </ul>
              <a href="#" class="btn" style="${tier.highlighted ? '' : 'background: transparent; border: 2px solid var(--primary); color: var(--primary);'}">Choose Plan</a>
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;
  }

  _renderAbout(section) {
    const c = section.content || {};
    const s = section.styles || {};

    return `<section class="section" style="background: ${s.background || '#ffffff'};">
      <div class="container" style="max-width: ${s.maxWidth || '800px'};">
        <h2 class="section-heading" style="color: ${s.headingColor};">${escapeHtml(c.heading)}</h2>
        <div style="display: flex; gap: 40px; align-items: center; flex-wrap: wrap;">
          ${c.imageUrl ? `<div style="flex: 1; min-width: 280px;"><img src="${escapeHtml(c.imageUrl)}" alt="About us" style="border-radius: ${s.imageBorderRadius}; width: 100%;"></div>` : ''}
          <div style="${c.imageUrl ? 'flex: 1;' : ''} min-width: 280px;">
            <p style="color: ${s.textColor}; font-size: 1.05rem; line-height: 1.8;">${escapeHtml(c.body)}</p>
          </div>
        </div>
      </div>
    </section>`;
  }

  _renderContact(section) {
    const c = section.content || {};
    const s = section.styles || {};

    return `<section class="section" style="background: ${s.background || '#f8fafc'};">
      <div class="container" style="max-width: 700px;">
        <h2 class="section-heading" style="color: ${s.headingColor};">${escapeHtml(c.heading)}</h2>
        ${c.subheading ? `<p class="section-subheading">${escapeHtml(c.subheading)}</p>` : ''}
        <div style="margin-bottom: 32px; text-align: center;">
          ${c.email ? `<p style="margin-bottom: 8px;">📧 ${escapeHtml(c.email)}</p>` : ''}
          ${c.phone ? `<p style="margin-bottom: 8px;">📞 ${escapeHtml(c.phone)}</p>` : ''}
          ${c.address ? `<p style="margin-bottom: 8px;">📍 ${escapeHtml(c.address)}</p>` : ''}
        </div>
        ${c.showForm ? `
        <form style="display: flex; flex-direction: column; gap: 16px;">
          ${(c.formFields || []).map(f => `
            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 500;">${escapeHtml(f.label)}</label>
              ${f.type === 'textarea'
                ? `<textarea rows="4" style="width: 100%; padding: 12px; border: ${s.inputBorder}; border-radius: ${s.inputBorderRadius}; font-family: inherit; font-size: 1rem;"></textarea>`
                : `<input type="${f.type}" style="width: 100%; padding: 12px; border: ${s.inputBorder}; border-radius: ${s.inputBorderRadius}; font-size: 1rem;">`}
            </div>
          `).join('')}
          <button type="submit" class="btn" style="align-self: flex-start;">Send Message</button>
        </form>` : ''}
      </div>
    </section>`;
  }

  _renderFooter(section) {
    const c = section.content || {};
    const s = section.styles || {};

    return `<footer style="background: ${s.background || '#1e293b'}; padding: 40px 20px; text-align: center;">
      <div class="container">
        <h3 style="color: ${s.headingColor || '#f8fafc'}; margin-bottom: 8px;">${escapeHtml(c.brandName)}</h3>
        <p style="color: ${s.textColor || '#cbd5e1'}; margin-bottom: 16px;">${escapeHtml(c.tagline)}</p>
        ${(c.links || []).length > 0 ? `
        <div style="margin-bottom: 16px;">
          ${(c.links || []).map(l => `<a href="${escapeHtml(l.url)}" style="color: ${s.linkColor || '#94a3b8'}; margin: 0 12px; font-size: 0.9rem;">${escapeHtml(l.label)}</a>`).join('')}
        </div>` : ''}
        <p style="color: ${s.textColor || '#cbd5e1'}; font-size: 0.85rem;">&copy; ${escapeHtml(c.year)} ${escapeHtml(c.brandName)}. All rights reserved.</p>
      </div>
    </footer>`;
  }

  _renderProducts(section) {
    const c = section.content || {};
    const s = section.styles || {};
    const cols = Math.min(c.columns || 3, 4);

    return `<section class="section" style="background: ${s.background || '#f8fafc'};">
      <div class="container">
        <h2 class="section-heading" style="color: ${s.headingColor};">${escapeHtml(c.heading)}</h2>
        ${c.subheading ? `<p class="section-subheading">${escapeHtml(c.subheading)}</p>` : ''}
        <div class="grid grid-${cols}">
          ${(c.items || []).map(item => `
            <div style="background: ${s.cardBackground}; border-radius: ${s.cardBorderRadius}; box-shadow: ${s.cardShadow}; overflow: hidden;">
              ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" style="width: 100%; height: 200px; object-fit: cover;">` : `<div style="width: 100%; height: 200px; background: #e2e8f0; display: flex; align-items: center; justify-content: center; color: #94a3b8;">📦 ${escapeHtml(item.name)}</div>`}
              <div style="padding: 20px;">
                <h3 style="font-size: 1.1rem; margin-bottom: 8px; color: ${s.headingColor};">${escapeHtml(item.name)}</h3>
                <p style="color: ${s.textColor}; font-size: 0.9rem; margin-bottom: 12px;">${escapeHtml(item.description)}</p>
                ${c.showPrices && item.price ? `<div style="font-weight: 700; color: ${s.priceColor || 'var(--primary)'}; font-size: 1.2rem;">${escapeHtml(item.price)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;
  }

  _renderTestimonials(section) {
    const c = section.content || {};
    const s = section.styles || {};

    return `<section class="section" style="background: ${s.background || '#ffffff'};">
      <div class="container">
        <h2 class="section-heading" style="color: ${s.headingColor};">${escapeHtml(c.heading)}</h2>
        ${c.subheading ? `<p class="section-subheading">${escapeHtml(c.subheading)}</p>` : ''}
        <div class="grid grid-2">
          ${(c.items || []).map(item => `
            <div style="background: ${s.cardBackground || '#f8fafc'}; border-radius: ${s.cardBorderRadius || '12px'}; padding: 32px;">
              <p style="color: ${s.quoteColor}; font-style: italic; margin-bottom: 16px; font-size: 1.05rem;">"${escapeHtml(item.quote)}"</p>
              <div>
                <strong style="color: ${s.authorColor || 'var(--primary)'};">${escapeHtml(item.author)}</strong>
                ${item.role ? `<span style="color: ${s.roleColor || '#64748b'}; font-size: 0.9rem;"> — ${escapeHtml(item.role)}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;
  }

  _renderGallery(section) {
    const c = section.content || {};
    const s = section.styles || {};
    const cols = Math.min(c.columns || 3, 4);

    return `<section class="section" style="background: ${s.background || '#f8fafc'};">
      <div class="container">
        <h2 class="section-heading" style="color: ${s.headingColor};">${escapeHtml(c.heading)}</h2>
        ${c.subheading ? `<p class="section-subheading">${escapeHtml(c.subheading)}</p>` : ''}
        <div class="grid grid-${cols}">
          ${(c.items || []).map(item => `
            <div style="border-radius: ${s.imageBorderRadius || '8px'}; overflow: hidden;">
              ${item.src ? `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" style="width: 100%; height: 250px; object-fit: cover;">` : `<div style="width: 100%; height: 250px; background: #e2e8f0; display: flex; align-items: center; justify-content: center; color: #94a3b8;">🖼️ ${escapeHtml(item.alt)}</div>`}
              ${item.caption ? `<p style="padding: 12px; text-align: center; color: ${s.captionColor || '#64748b'}; font-size: 0.9rem;">${escapeHtml(item.caption)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;
  }

  _renderServices(section) {
    const c = section.content || {};
    const s = section.styles || {};
    const cols = Math.min(c.columns || 2, 4);

    return `<section class="section" style="background: ${s.background || '#ffffff'};">
      <div class="container">
        <h2 class="section-heading" style="color: ${s.headingColor};">${escapeHtml(c.heading)}</h2>
        ${c.subheading ? `<p class="section-subheading">${escapeHtml(c.subheading)}</p>` : ''}
        <div class="grid grid-${cols}">
          ${(c.items || []).map(item => `
            <div style="background: ${s.cardBackground || '#f8fafc'}; border-radius: ${s.cardBorderRadius || '12px'}; padding: 32px; text-align: center;">
              <div style="width: 64px; height: 64px; background: ${s.iconColor || 'var(--primary)'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #fff; font-size: 1.5rem;">✦</div>
              <h3 style="font-size: 1.15rem; margin-bottom: 8px; color: ${s.headingColor};">${escapeHtml(item.title)}</h3>
              <p style="color: ${s.textColor}; font-size: 0.95rem;">${escapeHtml(item.description)}</p>
              ${item.price ? `<div style="margin-top: 12px; font-weight: 700; color: ${s.iconColor || 'var(--primary)'};">${escapeHtml(item.price)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </section>`;
  }

  _exportAsReact(site) {
    const sections = (site.sections || []).map((sec, i) => ({
      type: sec.type,
      content: sec.content,
      styles: sec.styles,
    }));

    return {
      format: 'react',
      componentName: `${site.name.replace(/[^a-zA-Z0-9]/g, '')}Page`,
      sections,
      imports: [
        "import React from 'react';",
        "import './site-styles.css';",
      ].join('\n'),
      styles: site.styles,
    };
  }

  // Internal
  _save() {
    // placeholder for save after section regen
    const site = this.store.get(this._currentId);
    if (site) this.store.set(site.id, site);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

function getManager() {
  if (!instance) {
    instance = new SiteManager();
  }
  return instance;
}

module.exports = { SiteManager, getManager };
