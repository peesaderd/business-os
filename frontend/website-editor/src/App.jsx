


import React, { useState, useCallback, useEffect } from 'react';

// ─── Section Templates ────────────────────────────────────────────
const SECTION_DEFAULTS = {
  hero: {
    type: 'hero',
    title: 'Your Brand',
    subtitle: 'Tagline goes here',
    cta: 'Get Started',
    bgColor: '#0f172a',
    textColor: '#ffffff',
  },
  features: {
    type: 'features',
    title: 'Features',
    items: [
      { title: 'Fast', desc: 'Lightning quick performance' },
      { title: 'Reliable', desc: '99.9% uptime guaranteed' },
      { title: 'Secure', desc: 'Enterprise-grade security' },
    ],
    bgColor: '#1e293b',
    textColor: '#f1f5f9',
  },
  pricing: {
    type: 'pricing',
    title: 'Pricing Plans',
    plans: [
      { name: 'Starter', price: '$9', period: '/mo', features: ['Basic support', '1 project', '100MB storage'], cta: 'Get Started', featured: false },
      { name: 'Professional', price: '$29', period: '/mo', features: ['Priority support', '10 projects', '5GB storage', 'Analytics'], cta: 'Try Free', featured: true },
      { name: 'Enterprise', price: '$99', period: '/mo', features: ['Dedicated support', 'Unlimited projects', '100GB storage', 'Custom integrations', 'SLA'], cta: 'Contact Sales', featured: false },
    ],
    bgColor: '#0f172a',
    textColor: '#f1f5f9',
  },
  products: {
    type: 'products',
    title: 'Our Products',
    items: [
      { name: 'Product One', desc: 'A powerful solution for teams', price: '$19', image: '' },
      { name: 'Product Two', desc: 'Enterprise-ready platform', price: '$49', image: '' },
      { name: 'Product Three', desc: 'Simple and affordable', price: '$9', image: '' },
    ],
    bgColor: '#1e293b',
    textColor: '#f1f5f9',
  },
  about: {
    type: 'about',
    title: 'About Us',
    body: 'We are a team of passionate developers building the future of business automation. Our mission is to empower businesses with AI-driven tools that simplify operations and accelerate growth.',
    image: '',
    bgColor: '#0f172a',
    textColor: '#f1f5f9',
  },
  contact: {
    type: 'contact',
    title: 'Contact Us',
    email: 'hello@example.com',
    phone: '+1 (555) 000-0000',
    address: '123 Business St, City',
    bgColor: '#1e293b',
    textColor: '#f1f5f9',
  },
  footer: {
    type: 'footer',
    text: '© 2026 Business OS. All rights reserved.',
    links: [
      { label: 'Privacy', url: '#' },
      { label: 'Terms', url: '#' },
      { label: 'Contact', url: '#' },
    ],
    bgColor: '#020617',
    textColor: '#94a3b8',
  },
};

const SECTION_LABELS = {
  hero: 'Hero',
  features: 'Features',
  pricing: 'Pricing',
  products: 'Products',
  about: 'About',
  contact: 'Contact',
  footer: 'Footer',
};

// ─── Render Sections ──────────────────────────────────────────────
function HeroPreview({ s }) {
  return (
    <section className="py-20 md:py-28 px-6 text-center" style={{ background: s.bgColor, color: s.textColor }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">{s.title}</h1>
        {s.subtitle && <p className="text-lg md:text-xl opacity-80 mb-8">{s.subtitle}</p>}
        {s.cta && <button className="px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:opacity-90 transition">{s.cta}</button>}
      </div>
    </section>
  );
}

function FeaturesPreview({ s }) {
  return (
    <section className="py-16 px-6" style={{ background: s.bgColor, color: s.textColor }}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-10">{s.title}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {s.items.map((item, i) => (
            <div key={i} className="p-6 rounded-xl bg-white/5 border border-white/10">
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-sm opacity-70 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingPreview({ s }) {
  return (
    <section className="py-16 px-6" style={{ background: s.bgColor, color: s.textColor }}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-10">{s.title}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {s.plans.map((p, i) => (
            <div key={i} className={`p-6 rounded-xl border ${p.featured ? 'border-blue-500 bg-blue-500/10 scale-105' : 'border-white/10 bg-white/5'} flex flex-col`}>
              {p.featured && <span className="text-xs font-semibold text-blue-400 mb-1">POPULAR</span>}
              <h3 className="text-xl font-bold">{p.name}</h3>
              <p className="mt-2"><span className="text-3xl font-bold">{p.price}</span><span className="text-sm opacity-60">{p.period}</span></p>
              <ul className="mt-4 space-y-2 text-sm flex-1">
                {p.features.map((f, j) => <li key={j} className="flex items-center gap-2"><span className="text-blue-400">✓</span>{f}</li>)}
              </ul>
              <button className={`mt-6 w-full py-2 rounded-lg font-semibold text-sm ${p.featured ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20'} transition`}>{p.cta}</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductsPreview({ s }) {
  return (
    <section className="py-16 px-6" style={{ background: s.bgColor, color: s.textColor }}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-10">{s.title}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {s.items.map((p, i) => (
            <div key={i} className="p-6 rounded-xl bg-white/5 border border-white/10 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-white/10 flex items-center justify-center text-2xl">📦</div>
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="text-sm opacity-70 mt-1">{p.desc}</p>
              <p className="text-xl font-bold mt-3">{p.price}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutPreview({ s }) {
  return (
    <section className="py-16 px-6" style={{ background: s.bgColor, color: s.textColor }}>
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-6">{s.title}</h2>
        <p className="text-base leading-relaxed opacity-80">{s.body}</p>
        {s.image && <img src={s.image} alt="About" className="mt-8 rounded-xl mx-auto max-h-64 object-cover" />}
      </div>
    </section>
  );
}

function ContactPreview({ s }) {
  return (
    <section className="py-16 px-6" style={{ background: s.bgColor, color: s.textColor }}>
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-6">{s.title}</h2>
        <div className="space-y-3 text-base">
          {s.email && <p>✉️ <a href={`mailto:${s.email}`} className="opacity-80 hover:opacity-100">{s.email}</a></p>}
          {s.phone && <p>📞 <span className="opacity-80">{s.phone}</span></p>}
          {s.address && <p>📍 <span className="opacity-80">{s.address}</span></p>}
        </div>
      </div>
    </section>
  );
}

function FooterPreview({ s }) {
  return (
    <footer className="py-8 px-6 text-center text-sm" style={{ background: s.bgColor, color: s.textColor }}>
      <p>{s.text}</p>
      {s.links && s.links.length > 0 && (
        <div className="flex justify-center gap-4 mt-2">
          {s.links.map((l, i) => <a key={i} href={l.url} className="hover:underline opacity-70 hover:opacity-100">{l.label}</a>)}
        </div>
      )}
    </footer>
  );
}

function SectionPreview({ section }) {
  switch (section.type) {
    case 'hero': return <HeroPreview s={section} />;
    case 'features': return <FeaturesPreview s={section} />;
    case 'pricing': return <PricingPreview s={section} />;
    case 'products': return <ProductsPreview s={section} />;
    case 'about': return <AboutPreview s={section} />;
    case 'contact': return <ContactPreview s={section} />;
    case 'footer': return <FooterPreview s={section} />;
    default: return null;
  }
}

// ─── Section Editor Panel ─────────────────────────────────────────
function SectionEditor({ section, onChange, onDelete }) {
  const set = (key, val) => onChange({ ...section, [key]: val });

  const renderField = (key, value) => {
    if (key === 'bgColor' || key === 'textColor') {
      return (
        <div key={key}>
          <label className="block text-xs text-gray-500 mb-1">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</label>
          <div className="flex items-center gap-2">
            <input type="color" value={value} onChange={e => set(key, e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
            <input type="text" value={value} onChange={e => set(key, e.target.value)} className="flex-1 bg-gray-800 rounded px-2 py-1 text-xs font-mono" />
          </div>
        </div>
      );
    }
    if (typeof value === 'string') {
      return (
        <div key={key}>
          <label className="block text-xs text-gray-500 mb-1">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</label>
          <input type="text" value={value} onChange={e => set(key, e.target.value)} className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm" />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-3 p-4 bg-gray-800/40 rounded-xl border border-gray-700/50">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm capitalize">{section.type}</span>
        <button onClick={onDelete} className="text-red-400 hover:text-red-300 text-xs">✕ Remove</button>
      </div>
      <div className="space-y-2">
        {Object.entries(section).filter(([k]) => k !== 'type').map(([key, val]) => {
          if (Array.isArray(val)) {
            if (key === 'items' && section.type === 'features') {
              return (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">Feature Items</label>
                  <div className="space-y-2">
                    {val.map((item, i) => (
                      <div key={i} className="bg-gray-900/60 rounded-lg p-2 space-y-1">
                        <input type="text" value={item.title} onChange={e => { const n = [...val]; n[i] = { ...n[i], title: e.target.value }; set(key, n); }} placeholder="Title" className="w-full bg-gray-800 rounded px-2 py-1 text-xs" />
                        <input type="text" value={item.desc} onChange={e => { const n = [...val]; n[i] = { ...n[i], desc: e.target.value }; set(key, n); }} placeholder="Description" className="w-full bg-gray-800 rounded px-2 py-1 text-xs" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            if (key === 'plans' && section.type === 'pricing') {
              return (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">Pricing Plans</label>
                  <div className="space-y-2">
                    {val.map((plan, i) => (
                      <div key={i} className="bg-gray-900/60 rounded-lg p-2 space-y-1">
                        <div className="flex gap-1">
                          <input type="text" value={plan.name} onChange={e => { const n = [...val]; n[i] = { ...n[i], name: e.target.value }; set(key, n); }} placeholder="Plan name" className="flex-1 bg-gray-800 rounded px-2 py-1 text-xs" />
                          <input type="text" value={plan.price} onChange={e => { const n = [...val]; n[i] = { ...n[i], price: e.target.value }; set(key, n); }} placeholder="$0" className="w-14 bg-gray-800 rounded px-2 py-1 text-xs" />
                        </div>
                        <textarea value={plan.features.join('\n')} onChange={e => { const n = [...val]; n[i] = { ...n[i], features: e.target.value.split('\n').filter(Boolean) }; set(key, n); }} placeholder="One feature per line" className="w-full bg-gray-800 rounded px-2 py-1 text-xs h-16" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            if (key === 'items' && section.type === 'products') {
              return (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">Product Items</label>
                  <div className="space-y-2">
                    {val.map((item, i) => (
                      <div key={i} className="bg-gray-900/60 rounded-lg p-2 space-y-1">
                        <input type="text" value={item.name} onChange={e => { const n = [...val]; n[i] = { ...n[i], name: e.target.value }; set(key, n); }} placeholder="Name" className="w-full bg-gray-800 rounded px-2 py-1 text-xs" />
                        <input type="text" value={item.desc} onChange={e => { const n = [...val]; n[i] = { ...n[i], desc: e.target.value }; set(key, n); }} placeholder="Description" className="w-full bg-gray-800 rounded px-2 py-1 text-xs" />
                        <input type="text" value={item.price} onChange={e => { const n = [...val]; n[i] = { ...n[i], price: e.target.value }; set(key, n); }} placeholder="$19" className="w-full bg-gray-800 rounded px-2 py-1 text-xs" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            if (key === 'links' && section.type === 'footer') {
              return (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">Footer Links</label>
                  <div className="space-y-1">
                    {val.map((link, i) => (
                      <div key={i} className="flex gap-1">
                        <input type="text" value={link.label} onChange={e => { const n = [...val]; n[i] = { ...n[i], label: e.target.value }; set(key, n); }} placeholder="Label" className="flex-1 bg-gray-800 rounded px-2 py-1 text-xs" />
                        <input type="text" value={link.url} onChange={e => { const n = [...val]; n[i] = { ...n[i], url: e.target.value }; set(key, n); }} placeholder="#" className="flex-1 bg-gray-800 rounded px-2 py-1 text-xs" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
          }
          return renderField(key, val);
        })}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [sections, setSections] = useState([]);
  const [preview, setPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('website-editor-sections');
      if (saved) setSections(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('website-editor-sections', JSON.stringify(sections));
  }, [sections]);

  const addSection = (type) => {
    setSections(prev => [...prev, { ...SECTION_DEFAULTS[type], id: Date.now() }]);
    setMessage({ type: 'info', text: `Added ${SECTION_LABELS[type]} section` });
    setTimeout(() => setMessage(null), 2000);
  };

  const updateSection = (id, updated) => {
    setSections(prev => prev.map(s => s.id === id ? updated : s));
  };

  const deleteSection = (id) => {
    setSections(prev => prev.filter(s => s.id !== id));
  };

  const moveSection = (id, dir) => {
    setSections(prev => {
      const i = prev.findIndex(s => s.id === id);
      if (i === -1) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const buildHTML = useCallback(() => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    ${sections.map(s => `[data-section="${s.id}"] { background: ${s.bgColor}; color: ${s.textColor}; }`).join('\n    ')}
  </style>
</head>
<body>
${sections.map(s => {
  const inner = document.getElementById('preview-render')?.innerHTML || '';
  return `<div data-section="${s.id}">${inner}</div>`;
}).join('\n')}
</body>
</html>`;
  }, [sections]);

  const handleExport = async () => {
    setExporting(true);
    const html = buildHTML();
    try {
      const res = await fetch('/api/website/v1/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, sections }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Website exported successfully' });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.error || 'Export failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Export endpoint unavailable. HTML copied to clipboard.' });
      // Fallback: download the HTML
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'website.html';
      a.click();
      URL.revokeObjectURL(url);
    }
    setTimeout(() => setMessage(null), 3000);
    setExporting(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/website/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Generate a website', sections }),
      });
      const data = await res.json();
      if (res.ok && data.sections) {
        setSections(prev => data.sections.map((s, i) => ({ ...SECTION_DEFAULTS[s.type], ...s, id: prev[i]?.id || Date.now() + i })));
        setMessage({ type: 'success', text: 'Website generated successfully' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Generation failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Generate endpoint unavailable' });
    }
    setTimeout(() => setMessage(null), 3000);
    setGenerating(false);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold">Website Builder</h1>
          <span className="text-xs text-gray-500">{sections.length} sections</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreview(p => !p)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${preview ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
            {preview ? '✕ Close Preview' : '👁 Preview'}
          </button>
          <button onClick={handleGenerate} disabled={generating} className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg transition">
            {generating ? '⟳ Generating...' : '✨ Generate'}
          </button>
          <button onClick={handleExport} disabled={exporting} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition">
            {exporting ? '⟳ Exporting...' : '⬇ Export'}
          </button>
        </div>
      </header>

      {/* Toast */}
      {message && (
        <div className={`px-4 py-2 text-sm text-center ${message.type === 'success' ? 'bg-emerald-600/20 text-emerald-400' : message.type === 'error' ? 'bg-red-600/20 text-red-400' : 'bg-blue-600/20 text-blue-400'}`}>
          {message.text}
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Section palette */}
        <div className="w-40 lg:w-48 bg-gray-900/80 border-r border-gray-800 overflow-y-auto p-2 shrink-0 space-y-1">
          <p className="text-[10px] uppercase text-gray-600 font-semibold tracking-wider px-2 pb-1">Add Section</p>
          {Object.entries(SECTION_LABELS).map(([type, label]) => (
            <button key={type} onClick={() => addSection(type)} className="w-full text-left px-2.5 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition">
              + {label}
            </button>
          ))}
          {sections.length > 0 && (
            <>
              <div className="border-t border-gray-800 my-2" />
              <p className="text-[10px] uppercase text-gray-600 font-semibold tracking-wider px-2 pb-1">Sections</p>
              {sections.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-800/50 rounded-lg">
                  <span className="truncate flex-1 capitalize">{s.type}</span>
                  <button onClick={() => moveSection(s.id, -1)} disabled={i === 0} className="p-0.5 hover:text-white disabled:opacity-30">↑</button>
                  <button onClick={() => moveSection(s.id, 1)} disabled={i === sections.length - 1} className="p-0.5 hover:text-white disabled:opacity-30">↓</button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Content */}
        {preview ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              {sections.length === 0 ? (
                <div className="py-20 text-center text-gray-500">
                  <p className="text-4xl mb-2">🌐</p>
                  <p className="text-sm">Add sections to preview your website</p>
                </div>
              ) : (
                sections.map(s => <SectionPreview key={s.id} section={s} />)
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sections.length === 0 ? (
              <div className="py-16 text-center text-gray-500">
                <p className="text-4xl mb-2">🪄</p>
                <p className="text-sm">Click a section on the left to begin</p>
              </div>
            ) : (
              sections.map(s => (
                <div key={s.id} className="flex gap-3">
                  <div className="flex-1 min-w-0">
                    <SectionEditor section={s} onChange={(u) => updateSection(s.id, u)} onDelete={() => deleteSection(s.id)} />
                  </div>
                  <div className="w-48 hidden lg:block bg-gray-900/60 rounded-xl border border-gray-800 overflow-hidden">
                    <div className="scale-[0.3] origin-top-left" style={{ width: 480, height: 320 }}>
                      <SectionPreview section={s} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}


