export const services = [
  {
    id: 'ai-chat',
    name: 'AI Chat',
    port: 8108,
    icon: '🤖',
    slug: 'chat',
    description: 'AI-powered chat and customer support with knowledge base integration',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'image-gen',
    name: 'Image Gen',
    port: 8110,
    icon: '🖼️',
    slug: 'image',
    description: 'AI image generation, editing, and transformation services',
    color: 'from-violet-500 to-purple-600',
  },
  {
    id: 'video-gen',
    name: 'Video Gen',
    port: 8116,
    icon: '🎬',
    slug: 'video',
    description: 'AI video generation with audio and reference media support',
    color: 'from-rose-500 to-pink-600',
  },
  {
    id: 'social-post',
    name: 'Social Post',
    port: 8112,
    icon: '📱',
    slug: 'social',
    description: 'Multi-platform social media scheduling and posting',
    color: 'from-sky-500 to-blue-600',
  },
  {
    id: 'queue',
    name: 'Queue',
    port: 8113,
    icon: '🔢',
    slug: 'queue',
    description: 'Task queue management and async job processing',
    color: 'from-amber-500 to-orange-600',
  },
  {
    id: 'pos',
    name: 'POS',
    port: 8114,
    icon: '🏪',
    slug: 'pos',
    description: 'Point of sale system with inventory management',
    color: 'from-green-500 to-emerald-600',
  },
  {
    id: 'booking',
    name: 'Booking',
    port: 8115,
    icon: '📅',
    slug: 'booking',
    description: 'Appointment and resource booking management',
    color: 'from-cyan-500 to-teal-600',
  },
  {
    id: 'website-builder',
    name: 'Website Builder',
    port: 8120,
    icon: '🕸️',
    slug: 'website',
    description: 'Website builder and hosting management platform',
    color: 'from-indigo-500 to-violet-600',
  },
]

export async function checkHealth(service) {
  const url = `http://localhost:${service.port}/api/${service.slug}/v1/health`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { status: 'error', statusCode: res.status }
    const data = await res.json()
    return { status: 'online', data }
  } catch (err) {
    return { status: 'offline', error: err.message || 'Connection failed' }
  }
}
