import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkHealth } from './services'

export default function ServicePage({ service }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await checkHealth(service)
    setStatus(result)
    setLoading(false)
  }, [service])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [refresh])

  const isOnline = status?.status === 'online'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <span className="text-4xl">{service.icon}</span>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{service.name}</h1>
          <p className="text-gray-500 mt-1">{service.description}</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm
                     hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24"
               stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* Status Card */}
      <div className={`rounded-xl border p-6 mb-6 ${
        loading
          ? 'bg-gray-900 border-gray-800'
          : isOnline
            ? 'bg-green-900/20 border-green-800/30'
            : 'bg-red-900/20 border-red-800/30'
      }`}>
        <div className="flex items-center gap-4">
          <span className={`w-4 h-4 rounded-full ${
            loading
              ? 'bg-gray-600 animate-pulse'
              : isOnline
                ? 'bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.5)]'
                : 'bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.5)]'
          }`} />
          <div>
            <div className="text-lg font-semibold text-white">
              {loading ? 'Checking...' : isOnline ? 'Online' : 'Offline'}
            </div>
            <div className="text-sm text-gray-500">
              {loading ? 'Connecting...' : isOnline ? 'Service is responding normally' : 'Service is unreachable'}
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wide">Port</div>
          <div className="text-xl font-bold text-white mt-1 font-mono">{service.port}</div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wide">Health Endpoint</div>
          <div className="text-sm font-mono text-gray-300 mt-1 break-all">
            /api/{service.slug}/v1/health
          </div>
        </div>
      </div>

      {/* Response Data */}
      {status?.data && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-3">Response</div>
          <pre className="text-sm text-gray-300 font-mono bg-gray-950 rounded-lg p-4 overflow-x-auto">
            {JSON.stringify(status.data, null, 2)}
          </pre>
        </div>
      )}

      {status?.status === 'error' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-3">Error</div>
          <div className="text-red-400 text-sm">
            HTTP {status.statusCode} — The service returned an error status.
          </div>
        </div>
      )}

      {status?.status === 'offline' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-3">Connection Error</div>
          <div className="text-red-400 text-sm">
            {status.error || 'Could not connect to service. Make sure it is running.'}
          </div>
        </div>
      )}
    </div>
  )
}
