import React, { useState, useCallback } from 'react'
import axios from 'axios'
import SectionRenderer from './SectionRenderer.jsx'
import EditModal from './EditModal.jsx'

const API_BASE = '/api/website/v1'

const SECTION_TYPES = [
  { type: 'hero',     label: 'Hero',     icon: '🏠', defaultContent: { title: 'Welcome', subtitle: 'Your tagline here', cta: 'Get Started', bgColor: '#1e40af', textColor: '#ffffff', image: '' } },
  { type: 'features', label: 'Features', icon: '✨', defaultContent: { title: 'Features', subtitle: 'What we offer', items: ['Feature 1', 'Feature 2', 'Feature 3'], bgColor: '#f8fafc', textColor: '#1e293b' } },
  { type: 'pricing',  label: 'Pricing',  icon: '💰', defaultContent: { title: 'Pricing', subtitle: 'Choose your plan', plans: [{ name: 'Basic', price: '$9', features: ['Feature A', 'Feature B'] }, { name: 'Pro', price: '$29', features: ['Feature A', 'Feature B', 'Feature C'] }], bgColor: '#ffffff', textColor: '#1e293b' } },
  { type: 'about',    label: 'About',    icon: 'ℹ️', defaultContent: { title: 'About Us', description: 'Tell your story here...', image: '', bgColor: '#f1f5f9', textColor: '#1e293b' } },
  { type: 'contact',  label: 'Contact',  icon: '📧', defaultContent: { title: 'Contact Us', email: 'hello@example.com', phone: '+1 234 567 890', address: '123 Main St', bgColor: '#ffffff', textColor: '#1e293b' } },
  { type: 'footer',   label: 'Footer',   icon: '🔻', defaultContent: { text: '© 2026 Your Company. All rights reserved.', bgColor: '#1e293b', textColor: '#ffffff' } },
  { type: 'products', label: 'Products', icon: '🛍️', defaultContent: { title: 'Our Products', subtitle: 'Browse our collection', products: [{ name: 'Product 1', price: '$19.99', description: 'Great product' }, { name: 'Product 2', price: '$29.99', description: 'Even better' }], bgColor: '#f8fafc', textColor: '#1e293b' } },
]

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export default function Editor() {
  const [sections, setSections] = useState([])
  const [mode, setMode] = useState('edit') // 'edit' | 'preview'
  const [editingSection, setEditingSection] = useState(null)
  const [exportResult, setExportResult] = useState(null)
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const addSection = useCallback((sectionType) => {
    const sectionDef = SECTION_TYPES.find(s => s.type === sectionType)
    if (!sectionDef) return
    const newSection = {
      id: generateId(),
      type: sectionType,
      content: JSON.parse(JSON.stringify(sectionDef.defaultContent)),
    }
    setSections(prev => [...prev, newSection])
    showSuccess(`Added ${sectionDef.label} section`)
  }, [])

  const updateSection = useCallback((id, content) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, content } : s))
    setEditingSection(null)
    showSuccess('Section updated')
  }, [])

  const deleteSection = useCallback((id) => {
    setSections(prev => prev.filter(s => s.id !== id))
    if (editingSection?.id === id) setEditingSection(null)
    showSuccess('Section removed')
  }, [editingSection])

  const moveSection = useCallback((id, direction) => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id)
      if (idx === -1) return prev
      const newIdx = idx + direction
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const arr = [...prev]
      const [removed] = arr.splice(idx, 1)
      arr.splice(newIdx, 0, removed)
      return arr
    })
  }, [])

  const handleExport = useCallback(async () => {
    setLoading(true)
    setError(null)
    setExportResult(null)
    try {
      const payload = { sections: sections.map(s => ({ type: s.type, content: s.content })) }
      const res = await axios.post(`${API_BASE}/export`, payload, { timeout: 30000 })
      setExportResult(res.data)
      showSuccess('Export completed')
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Export failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [sections])

  const handleGenerate = useCallback(async () => {
    if (!generatePrompt.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post(`${API_BASE}/generate`, { prompt: generatePrompt }, { timeout: 60000 })
      const data = res.data
      if (data.sections && Array.isArray(data.sections)) {
        setSections(data.sections.map(s => ({
          id: generateId(),
          type: s.type || 'hero',
          content: s.content || SECTION_TYPES.find(t => t.type === (s.type || 'hero'))?.defaultContent || {},
        })))
        showSuccess('Site generated')
      } else {
        setError('Generate returned unexpected data')
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Generate failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [generatePrompt])

  const showSuccess = useCallback((msg) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 2000)
  }, [])

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-800">🛠️ Website Editor</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setMode('edit')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === 'edit' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === 'preview' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              👁️ Preview
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={loading || sections.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '⏳ Working...' : '📤 Export'}
          </button>
        </div>
      </header>

      {/* Notifications */}
      {success && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-bounce">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          ❌ {error}
          <button className="ml-3 text-white/80 hover:text-white" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="flex h-[calc(100vh-57px)]">
        {/* Left Sidebar - Section Palette */}
        {mode === 'edit' && (
          <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto shrink-0">
            <div className="p-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Section Types</h2>
              <div className="space-y-1.5">
                {SECTION_TYPES.map(st => (
                  <button
                    key={st.type}
                    onClick={() => addSection(st.type)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors text-left border border-transparent hover:border-indigo-200"
                  >
                    <span className="text-lg">{st.icon}</span>
                    <span className="font-medium">{st.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Panel */}
            <div className="border-t border-gray-200 p-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">🤖 AI Generate</h2>
              <div className="flex flex-col gap-2">
                <textarea
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  placeholder="Describe the website you want..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                />
                <button
                  onClick={handleGenerate}
                  disabled={loading || !generatePrompt.trim()}
                  className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? '⏳ Generating...' : '✨ Generate'}
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* Main Canvas */}
        <main className={`flex-1 overflow-y-auto ${mode === 'edit' ? 'bg-gray-50' : 'bg-white'}`}>
          {sections.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md px-6">
                <div className="text-5xl mb-4">🏗️</div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Your site is empty</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Click a section type from the left panel to start building, or use AI to generate a full site.
                </p>
                {mode === 'preview' && (
                  <p className="text-sm text-amber-600">Add sections in Edit mode first.</p>
                )}
              </div>
            </div>
          ) : (
            <div className={`${mode === 'preview' ? 'max-w-5xl mx-auto' : 'max-w-4xl mx-auto py-6 px-4'} space-y-4`}>
              {sections.map((section, index) => (
                <div key={section.id} className="relative group">
                  {mode === 'edit' && (
                    <>
                      {/* Section toolbar */}
                      <div className="absolute -top-3 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingSection({ ...section, index })}
                          className="px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white rounded-l-md hover:bg-indigo-700 transition-colors"
                          title="Edit section"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => moveSection(section.id, -1)}
                          disabled={index === 0}
                          className="px-2 py-1 text-xs bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveSection(section.id, 1)}
                          disabled={index === sections.length - 1}
                          className="px-2 py-1 text-xs bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => deleteSection(section.id)}
                          className="px-2.5 py-1 text-xs font-medium bg-red-600 text-white rounded-r-md hover:bg-red-700 transition-colors"
                          title="Delete section"
                        >
                          🗑️
                        </button>
                      </div>
                      {/* Edit indicator */}
                      <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </>
                  )}
                  <SectionRenderer
                    section={section}
                    isPreview={mode === 'preview'}
                  />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Export Result Modal */}
      {exportResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setExportResult(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">📤 Export Result</h2>
              <button onClick={() => setExportResult(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-4">
              <pre className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono">
                {JSON.stringify(exportResult, null, 2)}
              </pre>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(exportResult, null, 2))
                  showSuccess('Copied to clipboard')
                }}
                className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors"
              >
                📋 Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingSection && (
        <EditModal
          section={editingSection}
          onSave={updateSection}
          onClose={() => setEditingSection(null)}
        />
      )}
    </div>
  )
}
