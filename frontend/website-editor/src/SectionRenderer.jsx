import React from 'react'

function HeroSection({ content, isPreview }) {
  const { title, subtitle, cta, bgColor, textColor, image } = content
  return (
    <section style={{ backgroundColor: bgColor || '#1e40af', color: textColor || '#ffffff' }} className="py-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        {image && (
          <img src={image} alt="" className="mx-auto mb-6 rounded-lg max-h-64 object-cover shadow-lg" />
        )}
        <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">{title || 'Hero Title'}</h1>
        <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">{subtitle || 'Subtitle goes here'}</p>
        {cta && (
          <span className="inline-block px-8 py-3 bg-white text-gray-900 font-semibold rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-default">
            {cta}
          </span>
        )}
      </div>
    </section>
  )
}

function FeaturesSection({ content, isPreview }) {
  const { title, subtitle, items, bgColor, textColor } = content
  const itemsArr = items || []
  return (
    <section style={{ backgroundColor: bgColor || '#f8fafc', color: textColor || '#1e293b' }} className="py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-2">{title || 'Features'}</h2>
        {subtitle && <p className="text-center opacity-70 mb-10">{subtitle}</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {itemsArr.map((item, i) => (
            <div key={i} className="bg-white/60 backdrop-blur rounded-xl p-6 shadow-sm border border-gray-200/50">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold mb-3">0{i + 1}</div>
              <h3 className="font-semibold text-lg">{item}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection({ content, isPreview }) {
  const { title, subtitle, plans, bgColor, textColor } = content
  const plansArr = plans || []
  return (
    <section style={{ backgroundColor: bgColor || '#ffffff', color: textColor || '#1e293b' }} className="py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-2">{title || 'Pricing'}</h2>
        {subtitle && <p className="text-center opacity-70 mb-10">{subtitle}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {plansArr.map((plan, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
              <div className="text-3xl font-bold text-indigo-600 mb-4">{plan.price}</div>
              <ul className="space-y-2 mb-6">
                {(plan.features || []).map((f, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <span className="block w-full text-center px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg cursor-default">
                Choose {plan.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AboutSection({ content, isPreview }) {
  const { title, description, image, bgColor, textColor } = content
  return (
    <section style={{ backgroundColor: bgColor || '#f1f5f9', color: textColor || '#1e293b' }} className="py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold mb-6">{title || 'About Us'}</h2>
        <div className="flex flex-col md:flex-row gap-8 items-center">
          {image && (
            <div className="md:w-1/2 shrink-0">
              <img src={image} alt="About" className="rounded-xl shadow-lg w-full h-64 object-cover" />
            </div>
          )}
          <div className={image ? 'md:w-1/2' : ''}>
            <p className="text-lg leading-relaxed opacity-80">{description || 'Tell your story here...'}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ContactSection({ content, isPreview }) {
  const { title, email, phone, address, bgColor, textColor } = content
  return (
    <section style={{ backgroundColor: bgColor || '#ffffff', color: textColor || '#1e293b' }} className="py-16 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-6">{title || 'Contact Us'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {email && (
            <div className="p-6 rounded-xl bg-gray-50 border border-gray-100">
              <div className="text-2xl mb-2">📧</div>
              <h3 className="font-semibold mb-1">Email</h3>
              <p className="opacity-70">{email}</p>
            </div>
          )}
          {phone && (
            <div className="p-6 rounded-xl bg-gray-50 border border-gray-100">
              <div className="text-2xl mb-2">📞</div>
              <h3 className="font-semibold mb-1">Phone</h3>
              <p className="opacity-70">{phone}</p>
            </div>
          )}
          {address && (
            <div className="p-6 rounded-xl bg-gray-50 border border-gray-100">
              <div className="text-2xl mb-2">📍</div>
              <h3 className="font-semibold mb-1">Address</h3>
              <p className="opacity-70">{address}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function FooterSection({ content, isPreview }) {
  const { text, bgColor, textColor } = content
  return (
    <footer style={{ backgroundColor: bgColor || '#1e293b', color: textColor || '#ffffff' }} className="py-8 px-4 text-center">
      <p className="opacity-70 text-sm">{text || '© 2026 Your Company. All rights reserved.'}</p>
    </footer>
  )
}

function ProductsSection({ content, isPreview }) {
  const { title, subtitle, products, bgColor, textColor } = content
  const productsArr = products || []
  return (
    <section style={{ backgroundColor: bgColor || '#f8fafc', color: textColor || '#1e293b' }} className="py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-2">{title || 'Our Products'}</h2>
        {subtitle && <p className="text-center opacity-70 mb-10">{subtitle}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {productsArr.map((product, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="h-40 bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                <span className="text-4xl">📦</span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
                <p className="text-indigo-600 font-bold text-xl mb-2">{product.price}</p>
                <p className="text-sm opacity-70">{product.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const RENDERERS = {
  hero: HeroSection,
  features: FeaturesSection,
  pricing: PricingSection,
  about: AboutSection,
  contact: ContactSection,
  footer: FooterSection,
  products: ProductsSection,
}

export default function SectionRenderer({ section, isPreview }) {
  const Renderer = RENDERERS[section.type]
  if (!Renderer) {
    return (
      <section className="py-12 px-4 bg-yellow-50 border-2 border-dashed border-yellow-300 rounded-xl">
        <p className="text-center text-yellow-700 font-medium">
          Unknown section type: <code>{section.type}</code>
        </p>
      </section>
    )
  }

  return (
    <div className={isPreview ? '' : 'rounded-lg overflow-hidden border border-gray-200 shadow-sm group/edit'}>
      <Renderer content={section.content} isPreview={isPreview} />
    </div>
  )
}
