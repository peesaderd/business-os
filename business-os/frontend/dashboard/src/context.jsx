import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { services } from './services'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [statuses, setStatuses] = useState({})
  const [odAgents, setOdAgents] = useState(null)
  const [loading, setLoading] = useState(true)

  const checkHealth = useCallback(async () => {
    const results = {}
    const batch = services.map(async (svc) => {
      try {
        const res = await fetch(`/api/${svc.slug}/health`, { signal: AbortSignal.timeout(3000) })
        if (!res.ok) { results[svc.id] = 'degraded'; return }
        results[svc.id] = 'online'
      } catch {
        try {
          await fetch(`http://localhost:${svc.port}/health`, { signal: AbortSignal.timeout(2000) })
          results[svc.id] = 'online'
        } catch {
          results[svc.id] = 'offline'
        }
      }
    })
    // Design gets special check
    try {
      const res = await fetch('/api/design/api/agents', { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        results['design'] = 'online'
        const data = await res.json()
        setOdAgents(data?.agents || null)
      } else {
        results['design'] = 'degraded'
      }
    } catch {
      results['design'] = results['design'] || 'offline'
    }
    await Promise.all(batch)
    setStatuses(results)
    setLoading(false)
  }, [])

  useEffect(() => { checkHealth(); const iv = setInterval(checkHealth, 30000); return () => clearInterval(iv) }, [checkHealth])

  return (
    <AppContext.Provider value={{ services, statuses, odAgents, loading, refresh: checkHealth }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
