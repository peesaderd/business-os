/**
 * Website Templates
 * Pre-defined layouts and color schemes for rapid site generation.
 */

const TEMPLATES = {
  'business-landing': {
    name: 'Business Landing Page',
    description: 'Professional landing page for businesses with hero, features, about, and contact sections.',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    fontFamily: 'Inter, system-ui, sans-serif',
    headingFont: 'Inter, system-ui, sans-serif',
    borderRadius: '8px',
    layout: 'centered',
    sections: ['hero', 'features', 'about', 'contact', 'footer'],
  },
  'portfolio': {
    name: 'Portfolio',
    description: 'Creative portfolio for designers, photographers, and artists.',
    primaryColor: '#7c3aed',
    secondaryColor: '#5b21b6',
    fontFamily: '"Playfair Display", Georgia, serif',
    headingFont: '"Playfair Display", Georgia, serif',
    borderRadius: '4px',
    layout: 'full-width',
    sections: ['hero', 'about', 'gallery', 'contact', 'footer'],
  },
  'ecommerce': {
    name: 'E-Commerce Store',
    description: 'Online store with product listings, categories, cart, and checkout.',
    primaryColor: '#059669',
    secondaryColor: '#047857',
    fontFamily: 'Inter, system-ui, sans-serif',
    headingFont: 'Inter, system-ui, sans-serif',
    borderRadius: '12px',
    layout: 'full-width',
    sections: ['hero', 'products', 'features', 'pricing', 'about', 'contact', 'footer'],
  },
  'saas': {
    name: 'SaaS / Service',
    description: 'SaaS product page with features, pricing tiers, and testimonials.',
    primaryColor: '#0891b2',
    secondaryColor: '#0e7490',
    fontFamily: 'Inter, system-ui, sans-serif',
    headingFont: 'Inter, system-ui, sans-serif',
    borderRadius: '8px',
    layout: 'centered',
    sections: ['hero', 'features', 'pricing', 'testimonials', 'about', 'contact', 'footer'],
  },
  'service': {
    name: 'Service Provider',
    description: 'For consultants, agencies, and service professionals.',
    primaryColor: '#ca8a04',
    secondaryColor: '#a16207',
    fontFamily: '"Source Sans Pro", system-ui, sans-serif',
    headingFont: '"Source Sans Pro", system-ui, sans-serif',
    borderRadius: '6px',
    layout: 'centered',
    sections: ['hero', 'about', 'services', 'testimonials', 'contact', 'footer'],
  },
};

/**
 * Get a template by key, or return default (business-landing).
 */
function getTemplate(key) {
  return TEMPLATES[key] || TEMPLATES['business-landing'];
}

/**
 * List all available templates.
 */
function listTemplates() {
  const list = [];
  for (const [key, tmpl] of Object.entries(TEMPLATES)) {
    list.push({ key, ...tmpl });
  }
  return list;
}

module.exports = { TEMPLATES, getTemplate, listTemplates };
