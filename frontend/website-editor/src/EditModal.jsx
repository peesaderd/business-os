import React, { useState, useEffect, useRef } from 'react'

function guessFieldType(key, value, parentKey) {
  // Color field
  if (key === 'bgColor' || key === 'textColor' || key === 'color') return 'color'
  // Image URL
  if (key === 'image' || key === 'logo' || key === 'icon') return 'text'
  // Numeric
  if (typeof value === 'number') return 'number'
  return 'text'
}

function isArrayOfObjects(val) {
  return Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && !Array.isArray(val[0])
}

function isArrayOfStrings(val) {
  return Array.isArray(val) && (val.length === 0 || typeof val[0] === 'string')
}

function SimpleField({ label, key: fieldKey, value, onChange }) {
  const fieldType = guessFieldType(fieldKey, value)
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
        {fieldKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
      </label>
      {fieldType === 'color' ? (
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={value || '#000000'}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="w-10 h-10 rounded border border-gray-300 cursor-pointer p-0.5"
          />
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
          />
        </div>
      ) : (
        <input
          type={fieldType}
          value={value ?? ''}
          onChange={(e) => onChange(fieldKey, fieldType === 'number' ? Number(e.target.value) : e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
      )}
    </div>
  )
}

function TextareaField({ label, key: fieldKey, value, onChange }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
        {fieldKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
      </label>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
      />
    </div>
  )
}

function SimpleArrayEditor({ label, items, onChange }) {
  const addItem = () => onChange([...items, ''])
  const updateItem = (idx, val) => {
    const next = [...items]
    next[idx] = val
    onChange(next)
  }
  const removeItem = (idx) => onChange(items.filter((_, i) => i !== idx))

  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</label>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex gap-1">
            <input
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder={`${label} ${i + 1}`}
            />
            <button onClick={() => removeItem(i)} className="px-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded text-sm">
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addItem}
        className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        + Add {label}
      </button>
    </div>
  )
}

function ObjectArrayEditor({ label, items, fields, onChange }) {
  const addItem = () => {
    const empty = {}
    fields.forEach(f => { empty[f] = '' })
    onChange([...items, empty])
  }

  const updateField = (idx, field, val) => {
    const next = [...items]
    next[idx] = { ...next[idx], [field]: val }
    onChange(next)
  }

  const removeItem = (idx) => onChange(items.filter((_, i) => i !== idx))

  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</label>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">{label} #{i + 1}</span>
              <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
            </div>
            {fields.map(field => {
              if (Array.isArray(item[field])) {
                return (
                  <SimpleArrayEditor
                    key={field}
                    label={field}
                    items={item[field]}
                    onChange={(val) => updateField(i, field, val)}
                  />
                )
              }
              return (
                <div key={field} className="mb-2">
                  <label className="block text-xs text-gray-500 mb-0.5 capitalize">{field}</label>
                  <input
                    value={item[field] ?? ''}
                    onChange={(e) => updateField(i, field, e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <button onClick={addItem} className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
        + Add {label}
      </button>
    </div>
  )
}

const SECTION_LABELS = {
  hero: 'Hero Section',
  features: 'Features Section',
  pricing: 'Pricing Section',
  about: 'About Section',
  contact: 'Contact Section',
  footer: 'Footer Section',
  products: 'Products Section',
}

export default function EditModal({ section, onSave, onClose }) {
  const [content, setContent] = useState(() => JSON.parse(JSON.stringify(section.content)))
  const modalRef = useRef(null)

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const updateField = (key, value) => {
    setContent(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    onSave(section.id, content)
  }

  const typeName = SECTION_LABELS[section.type] || section.type

  // Build editor fields dynamically from content
  const renderFields = () => {
    const fields = []
    for (const [key, value] of Object.entries(content)) {
      if (key === 'id') continue

      if (isArrayOfObjects(value)) {
        // Determine fields from first item
        const fieldsList = value.length > 0 ? Object.keys(value[0]) : []
        fields.push(
          <ObjectArrayEditor
            key={key}
            label={key}
            items={value}
            fields={fieldsList}
            onChange={(val) => updateField(key, val)}
          />
        )
      } else if (isArrayOfStrings(value)) {
        fields.push(
          <SimpleArrayEditor
            key={key}
            label={key}
            items={value}
            onChange={(val) => updateField(key, val)}
          />
        )
      } else if (typeof value === 'string' && value.length > 60) {
        fields.push(
          <TextareaField
            key={key}
            label={key}
            value={value}
            onChange={updateField}
          />
        )
      } else {
        fields.push(
          <SimpleField
            key={key}
            label={key}
            value={value}
            onChange={updateField}
          />
        )
      }
    }
    return fields
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">✏️ Edit {typeName}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Section #{section.index + 1}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderFields()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex gap-2 justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            💾 Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
