import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { services, checkHealth } from './services'

export default function Dashboard() {
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const refresh = useCallback(async () => {
    setLoading(true)
    const results = {}
    const checks = services.map(async s => {
      results[s.id] = await checkHealth(s)
    })
    await Promise.allSettled(checks)
    setStatuses(results)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh])

  const online = Object.values(statuses).filter(s => s?.status === 'online').length
  const total = services.length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of all Business OS services</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wide">Total Services</div>
          <div className="text-3xl font-bold text-white mt-1">{total}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wide">Online</div>
          <div className="text-3xl font-bold text-green-400 mt-1">{online}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wide">Offline</div>
          <div className="text-3xl font-bold text-red-400 mt-1">{total - online}</div>
        </div>
      </div>

      {/* Refresh */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Services</h2>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm
                     hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {services.map(s => {
          const st = statuses[s.id]
          const isOnline = st?.status === 'online'

          return (
            <div
              key={s.id}
              onClick={() => navigate(`/service/${s.id}`)}
              className="group relative bg-gray-900 rounded-xl border border-gray-800 p-5
                         hover:border-gray-700 hover:bg-gray-800/80 transition-all cursor-pointer"
            >
              {/* Status dot */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    loading ? 'bg-gray-600 animate-pulse' : isOnline ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]'
                  }`}
                />
                <span className="text-xs text-gray-600">
                  {loading ? '...' : isOnline ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* Icon + Name */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{s.icon}</span>
                <h3 className="font-semibold text-white text-base">{s.name}</h3>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-500 leading-relaxed mb-4 line-clamp-2">
                {s.description}
              </p>

              {/* Port */}
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="font-mono bg-gray-800 px-2 py-0.5 rounded">:{s.port}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
