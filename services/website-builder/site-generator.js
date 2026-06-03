/**
 * site-generator.js — AI Website Generation Engine
 *
 * Takes a natural language prompt → generates a structured website (JSON sections).
 * Supports multiple template styles and re-generation of individual sections.
 */

const axios = require('axios');
const { getTemplate } = require('./templates');

// ─── Section Generators ───────────────────────────────────────────────────────

const SECTION_GENERATORS = {
  hero: ({ name, tagline, cta }) => ({
    type: 'hero',
    content: {
      heading: name || 'Welcome to Our Site',
      subheading: tagline || 'We build amazing things for amazing people.',
      ctaText: cta || 'Get Started',
      ctaUrl: '#contact',
      backgroundType: 'gradient', // gradient | image | solid
      backgroundValue: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
      height: 'full', // full | half | auto
      alignment: 'center',
    },
    styles: {
      padding: { top: 80, bottom: 80, left: 20, right: 20 },
      textColor: '#ffffff',
      headingSize: '3rem',
      overlay: true,
    },
  }),

  features: ({ features }) => ({
    type: 'features',
    content: {
      heading: 'Our Features',
      subheading: 'Everything you need to grow your business.',
      items: (features || ['Fast & Reliable', 'Easy to Use', '24/7 Support', 'Secure Platform']).map((title, i) => ({
        id: `feature-${i + 1}`,
        title,
        description: `Description for ${title.toLowerCase()}. We pride ourselves on delivering excellence in every aspect.`,
        icon: getDefaultIcon(i),
      })),
      columns: 3,
    },
    styles: {
      padding: { top: 60, bottom: 60, left: 20, right: 20 },
      background: '#f8fafc',
      cardBackground: '#ffffff',
      cardBorderRadius: '12px',
      cardShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
      headingColor: '#1e293b',
      textColor: '#475569',
    },
  }),

  pricing: ({ pricingTiers }) => ({
    type: 'pricing',
    content: {
      heading: 'Simple Pricing',
      subheading: 'Choose the plan that fits your needs.',
      items: (pricingTiers || [
        { name: 'Starter', price: '$9/mo', features: ['Basic features', '1 user', '5GB storage'], highlighted: false },
        { name: 'Professional', price: '$29/mo', features: ['All features', '10 users', '50GB storage', 'Priority support'], highlighted: true },
        { name: 'Enterprise', price: '$99/mo', features: ['Everything', 'Unlimited users', '500GB storage', 'Dedicated support', 'Custom integrations'], highlighted: false },
      ]),
    },
    styles: {
      padding: { top: 60, bottom: 60, left: 20, right: 20 },
      background: '#ffffff',
      cardBackground: '#ffffff',
      cardBorder: '1px solid #e2e8f0',
      highlightedCardBorder: '2px solid var(--primary)',
      headingColor: '#1e293b',
      textColor: '#475569',
      priceColor: 'var(--primary)',
    },
  }),

  about: ({ aboutText }) => ({
    type: 'about',
    content: {
      heading: 'About Us',
      body: aboutText || 'We are a passionate team dedicated to delivering excellence. Our mission is to help businesses thrive in the digital age through innovative solutions and exceptional service.',
      imageUrl: '',
      imagePosition: 'right',
    },
    styles: {
      padding: { top: 60, bottom: 60, left: 20, right: 20 },
      background: '#ffffff',
      headingColor: '#1e293b',
      textColor: '#475569',
      imageBorderRadius: '8px',
      maxWidth: '800px',
    },
  }),

  contact: ({ email, phone, address }) => ({
    type: 'contact',
    content: {
      heading: 'Get In Touch',
      subheading: "We'd love to hear from you. Reach out anytime.",
      email: email || 'hello@example.com',
      phone: phone || '+1 (555) 123-4567',
      address: address || '123 Main St, City, State 12345',
      showForm: true,
      formFields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'message', label: 'Message', type: 'textarea', required: true },
      ],
    },
    styles: {
      padding: { top: 60, bottom: 60, left: 20, right: 20 },
      background: '#f8fafc',
      headingColor: '#1e293b',
      textColor: '#475569',
      inputBorder: '1px solid #e2e8f0',
      inputBorderRadius: '8px',
      buttonColor: 'var(--primary)',
    },
  }),

  footer: ({ name, year }) => ({
    type: 'footer',
    content: {
      brandName: name || 'Business Name',
      tagline: 'Built with passion.',
      year: year || new Date().getFullYear().toString(),
      links: [
        { label: 'Privacy Policy', url: '#' },
        { label: 'Terms of Service', url: '#' },
        { label: 'FAQ', url: '#' },
      ],
      socialLinks: [
        { platform: 'twitter', url: '#' },
        { platform: 'facebook', url: '#' },
        { platform: 'instagram', url: '#' },
      ],
    },
    styles: {
      padding: { top: 40, bottom: 40, left: 20, right: 20 },
      background: '#1e293b',
      textColor: '#cbd5e1',
      linkColor: '#94a3b8',
      headingColor: '#f8fafc',
      dividerColor: '#334155',
    },
  }),

  products: ({ products }) => ({
    type: 'products',
    content: {
      heading: 'Our Products',
      subheading: 'Discover our carefully curated collection.',
      items: (products || [
        { name: 'Product 1', description: 'High-quality product designed for excellence.', price: '$49.99', imageUrl: '', category: 'Featured' },
        { name: 'Product 2', description: 'Premium solution for professionals.', price: '$79.99', imageUrl: '', category: 'Featured' },
        { name: 'Product 3', description: 'Essential tool for everyday use.', price: '$29.99', imageUrl: '', category: 'Popular' },
      ]),
      columns: 3,
      showPrices: true,
    },
    styles: {
      padding: { top: 60, bottom: 60, left: 20, right: 20 },
      background: '#f8fafc',
      cardBackground: '#ffffff',
      cardBorderRadius: '12px',
      cardShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
      headingColor: '#1e293b',
      textColor: '#475569',
      priceColor: 'var(--primary)',
    },
  }),

  testimonials: ({ testimonials }) => ({
    type: 'testimonials',
    content: {
      heading: 'What Our Clients Say',
      subheading: 'Trusted by businesses worldwide.',
      items: (testimonials || [
        { quote: 'This platform transformed our business. Highly recommended!', author: 'Jane Doe', role: 'CEO, TechCo', avatar: '' },
        { quote: 'Outstanding service and support. We saw results in days.', author: 'John Smith', role: 'Founder, StartupX', avatar: '' },
      ]),
      layout: 'grid', // grid | carousel
    },
    styles: {
      padding: { top: 60, bottom: 60, left: 20, right: 20 },
      background: '#ffffff',
      cardBackground: '#f8fafc',
      cardBorderRadius: '12px',
      quoteColor: '#1e293b',
      authorColor: 'var(--primary)',
      roleColor: '#64748b',
    },
  }),

  gallery: ({ images }) => ({
    type: 'gallery',
    content: {
      heading: 'Our Work',
      subheading: 'A showcase of our latest projects.',
      items: (images || [
        { src: '', alt: 'Project 1', caption: 'Brand Identity Design' },
        { src: '', alt: 'Project 2', caption: 'Web Application' },
        { src: '', alt: 'Project 3', caption: 'Mobile App' },
        { src: '', alt: 'Project 4', caption: 'UI/UX Design' },
        { src: '', alt: 'Project 5', caption: 'Marketing Campaign' },
        { src: '', alt: 'Project 6', caption: 'Product Photography' },
      ]),
      columns: 3,
    },
    styles: {
      padding: { top: 60, bottom: 60, left: 20, right: 20 },
      background: '#f8fafc',
      headingColor: '#1e293b',
      textColor: '#475569',
      imageBorderRadius: '8px',
      captionColor: '#64748b',
    },
  }),

  services: ({ services }) => ({
    type: 'services',
    content: {
      heading: 'Our Services',
      subheading: 'Comprehensive solutions tailored to your needs.',
      items: (services || [
        { title: 'Consulting', description: 'Strategic guidance to accelerate your growth.', icon: 'lightbulb', price: '' },
        { title: 'Development', description: 'Custom software and web development.', icon: 'code', price: '' },
        { title: 'Design', description: 'Beautiful, user-centered design solutions.', icon: 'palette', price: '' },
        { title: 'Marketing', description: 'Data-driven marketing strategies.', icon: 'chart', price: '' },
      ]),
      columns: 2,
    },
    styles: {
      padding: { top: 60, bottom: 60, left: 20, right: 20 },
      background: '#ffffff',
      cardBackground: '#f8fafc',
      cardBorderRadius: '12px',
      headingColor: '#1e293b',
      textColor: '#475569',
      iconColor: 'var(--primary)',
    },
  }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDefaultIcon(index) {
  const icons = ['zap', 'shield', 'headphones', 'globe', 'trending-up', 'star'];
  return icons[index % icons.length];
}

// ─── LLM Integration ──────────────────────────────────────────────────────────

/**
 * Call the configured LLM to generate website content from a prompt.
 * Falls back to deterministic generation if LLM is unreachable.
 */
async function callLLM(prompt, templateKey, businessType) {
  const llmUrl = process.env.LLM_API_URL || 'http://localhost:18789';
  const tenantId = process.env.DEFAULT_TENANT_ID || 'default';

  const systemPrompt = `You are a professional web design AI. Generate structured JSON for a website based on the user's description.
Template: ${templateKey}
Business Type: ${businessType || 'general'}

Return ONLY valid JSON matching this structure:
{
  "siteName": "string - business/website name",
  "tagline": "string - short tagline",
  "cta": "string - call to action text",
  "aboutText": "string - 2-3 sentence description",
  "email": "string - contact email",
  "phone": "string - contact phone",
  "address": "string - physical address",
  "features": ["array of 4-6 feature names as strings"],
  "pricingTiers": [
    { "name": "tier name", "price": "price string", "features": ["feature list"], "highlighted": boolean }
  ],
  "products": [
    { "name": "product name", "description": "short description", "price": "price string", "category": "category" }
  ],
  "testimonials": [
    { "quote": "testimonial text", "author": "name", "role": "title" }
  ],
  "services": [
    { "title": "service name", "description": "service description" }
  ],
  "primaryColor": "hex color",
  "secondaryColor": "hex color"
}`;

  try {
    const response = await axios.post(
      `${llmUrl}/v1/chat/completions`,
      {
        model: 'default',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Create a website for: ${prompt}` },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      },
      { timeout: 30000 }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (content) {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
    throw new Error('Could not parse LLM response as JSON');
  } catch (err) {
    console.warn('[SiteGenerator] LLM call failed, using fallback generation:', err.message);
    return null;
  }
}

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * Generate a complete website from a prompt.
 *
 * @param {string} prompt - Natural language description
 * @param {string} templateKey - Template key (business-landing, portfolio, etc.)
 * @param {string} businessType - Optional business type hint
 * @returns {Object} { name, sections, styles, meta }
 */
async function generateSite(prompt, templateKey = 'business-landing', businessType = '') {
  const template = getTemplate(templateKey);

  // Try to get AI-generated content
  let aiContent = null;
  try {
    aiContent = await callLLM(prompt, templateKey, businessType);
  } catch (e) {
    // fallback below handles this
  }

  // Build sections
  const sections = [];
  const sectionKeys = template.sections || ['hero', 'features', 'about', 'contact', 'footer'];

  // Determine site name
  const siteName = aiContent?.siteName || extractName(prompt);

  const ctx = {
    name: siteName,
    tagline: aiContent?.tagline || '',
    cta: aiContent?.cta || '',
    aboutText: aiContent?.aboutText || '',
    email: aiContent?.email || '',
    phone: aiContent?.phone || '',
    address: aiContent?.address || '',
    features: aiContent?.features,
    pricingTiers: aiContent?.pricingTiers,
    products: aiContent?.products,
    testimonials: aiContent?.testimonials,
    services: aiContent?.services,
    images: null,
  };

  for (const key of sectionKeys) {
    const generator = SECTION_GENERATORS[key];
    if (generator) {
      sections.push(generator(ctx));
    }
  }

  // Build global styles
  const globalStyles = {
    primaryColor: aiContent?.primaryColor || template.primaryColor,
    secondaryColor: aiContent?.secondaryColor || template.secondaryColor,
    fontFamily: template.fontFamily,
    headingFont: template.headingFont,
    borderRadius: template.borderRadius,
    bodyBackground: '#ffffff',
    bodyTextColor: '#334155',
    linkColor: template.primaryColor,
    headingColor: '#1e293b',
  };

  return {
    id: '', // assigned by site manager
    name: siteName,
    prompt,
    template: templateKey,
    businessType,
    sections,
    styles: globalStyles,
    meta: {
      generatedAt: Date.now(),
      version: '0.1.0',
      sectionCount: sections.length,
    },
  };
}

/**
 * Regenerate a single section by index.
 */
async function regenerateSection(site, sectionIndex, sectionPrompt) {
  if (sectionIndex < 0 || sectionIndex >= site.sections.length) {
    throw new Error(`Invalid section index: ${sectionIndex}`);
  }

  const section = site.sections[sectionIndex];
  const generator = SECTION_GENERATORS[section.type];
  if (!generator) {
    throw new Error(`No generator for section type: ${section.type}`);
  }

  // Parse the section prompt for context updates
  const updates = parseSectionUpdate(sectionPrompt, section.type);
  site.sections[sectionIndex] = generator({ ...extractContext(site), ...updates });
  site.meta.updatedAt = Date.now();

  return site.sections[sectionIndex];
}

/**
 * Regenerate the entire site (replaces sections). Preserves the site ID and name.
 */
async function regenerateSite(site, prompt) {
  const regenerated = await generateSite(prompt, site.template, site.businessType);
  regenerated.id = site.id;
  regenerated.name = site.name || regenerated.name;
  regenerated.meta.regeneratedAt = Date.now();
  return regenerated;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function extractName(prompt) {
  const words = prompt.split(/\s+/).filter(w => w.length > 2);
  if (words.length <= 3) return words.join(' ');
  // Try to extract a business name (capitalized phrase at start)
  const nameMatch = prompt.match(/(?:create|make|build|for)\s+(?:a\s+)?(?:website\s+)?(?:for\s+)?([A-Z][A-Za-z0-9\s&]{2,40}?)(?:\.|\,|\s+that|\s+with|\s+has|\s+and)/i);
  if (nameMatch) return nameMatch[1].trim();
  return words.slice(0, 3).join(' ');
}

function extractContext(site) {
  return {
    name: site.name,
    tagline: '',
    cta: '',
    aboutText: '',
    email: '',
    phone: '',
    address: '',
    features: null,
    pricingTiers: null,
    products: null,
    testimonials: null,
    services: null,
    images: null,
  };
}

function parseSectionUpdate(prompt, sectionType) {
  // Simple extraction from natural language
  const updates = {};
  if (prompt.length > 0) {
    // For hero: extract heading-like text
    if (sectionType === 'hero') {
      const firstLine = prompt.split('\n')[0].trim();
      if (firstLine) updates.name = firstLine;
      updates.tagline = prompt;
    }
    // For other sections, pass the prompt as content hint
    if (sectionType === 'about') updates.aboutText = prompt;
    if (sectionType === 'contact') {
      const emailMatch = prompt.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
      if (emailMatch) updates.email = emailMatch[0];
    }
  }
  return updates;
}

module.exports = { generateSite, regenerateSection, regenerateSite, SECTION_GENERATORS, getDefaultIcon };
