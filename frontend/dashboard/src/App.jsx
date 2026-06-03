

import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useParams, useNavigate } from 'react-router-dom';

// ─── Service Registry ──────────────────────────────────────────────
const SERVICES = [
  { id: 'chat',    name: 'AI Chat Bridge', port: 8108, desc: 'Real-time chat via WebSocket, webhook receiver from Chatwoot, escalation to human agents', color: 'blue',     icon: '💬' },
  { id: 'image',   name: 'Image Gen',      port: 8110, desc: 'AI image generation via Replicate/SDXL with style presets and batch mode',          color: 'violet',   icon: '🖼️' },
  { id: 'video',   name: 'Video Gen',      port: 8116, desc: 'Multi-provider video generation with WaveSpeed, Minimax, Pika, Runway, Kling fallback', color: 'rose',    icon: '🎬' },
  { id: 'social',  name: 'Social Post',    port: 8122, desc: 'Schedule & auto-post to Facebook, Instagram, LinkedIn, Twitter/X',                 color: 'sky',      icon: '📱' },
  { id: 'queue',   name: 'Queue Kiosk',    port: 8124, desc: 'Virtual queue management with embedded kiosk display for customer check-in',        color: 'amber',    icon: '🎫' },
  { id: 'pos',     name: 'POS System',     port: 8126, desc: 'Point-of-sale with payment gateway integration and receipt generation',            color: 'emerald',  icon: '🧾' },
  { id: 'booking', name: 'Booking System', port: 8128, desc: 'Appointment scheduling with calendar sync, reminders, and availability slots',      color: 'cyan',     icon: '📅' },
  { id: 'website', name: 'Website Builder',port: 5579, desc: 'AI-powered drag-and-drop website builder with section editor & HTML export',        color: 'orange',   icon: '🌐' },
];

// ─── Icons (simplified SVG) ───────────────────────────────────────
function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────
function Sidebar({ services, statuses, open, onClose }) {
  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-gray-700/60 text-white font-medium'
        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
    }`;

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onClose} />}
      <aside className={`fixed lg:sticky top-0 left-0 z-30 h-screen w-60 bg-gray-900/95 border-r border-gray-800 flex flex-col shrink-0 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800">
          <div>
            <h1 className="text-sm font-bold tracking-tight">Business OS</h1>
            <p className="text-[10px] text-gray-500">Admin Dashboard</p>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 hover:bg-gray-800 rounded"><CloseIcon /></button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <NavLink to="/" end className={navLinkClass}>
            <span className="text-base w-5 text-center">📊</span>
            <span>Overview</span>
          </NavLink>
          <div className="text-[10px] uppercase text-gray-600 font-semibold tracking-wider px-3 pt-4 pb-1">Services</div>
          {services.map((s) => {
            const st = statuses[s.id] || 'unknown';
            const dot = st === 'ok' ? '🟢' : st === 'degraded' ? '🟡' : '🔴';
            return (
              <NavLink key={s.id} to={`/${s.id}`} className={navLinkClass}>
                <span className="text-base w-5 text-center">{s.icon}</span>
                <span className="truncate flex-1">{s.name}</span>
                <span className="text-xs">{dot}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-800 text-[10px] text-gray-600 text-center">
          Business OS v1.0.0
        </div>
      </aside>
    </>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    ok:       { label: 'Online',   cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    degraded: { label: 'Degraded', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    error:    { label: 'Offline',  cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  };
  const entry = map[status] || { label: 'Unknown', cls: 'bg-gray-700/20 text-gray-400 border-gray-700' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md border ${entry.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'ok' ? 'bg-emerald-400' : status === 'degraded' ? 'bg-amber-400' : status === 'error' ? 'bg-red-400' : 'bg-gray-500'}`} />
      {entry.label}
    </span>
  );
}

// ─── Page Header ──────────────────────────────────────────────────
function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ─── Overview Page ────────────────────────────────────────────────
function Overview({ services, statuses, refresh }) {
  const online = services.filter((s) => statuses[s.id] === 'ok').length;
  const degraded = services.filter((s) => statuses[s.id] === 'degraded').length;
  const offline = services.filter((s) => statuses[s.id] === 'error').length;
  const unknown = services.filter((s) => !statuses[s.id] || statuses[s.id] === 'unknown').length;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard Overview" subtitle="Service health monitoring">
        <button onClick={refresh} className="px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">⟳ Refresh</button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Services', value: services.length, color: 'text-white' },
          { label: 'Online', value: online, color: 'text-emerald-400' },
          { label: 'Degraded', value: degraded, color: 'text-amber-400' },
          { label: 'Offline', value: offline, color: 'text-red-400' },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {services.map((s) => (
          <ServiceCard key={s.id} service={s} status={statuses[s.id] || 'unknown'} />
        ))}
      </div>
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────
function ServiceCard({ service, status }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/${service.id}`)}
      className="bg-gray-900/60 border border-gray-800 hover:border-gray-700/80 rounded-xl p-4 cursor-pointer transition-all hover:bg-gray-900/80"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{service.icon}</span>
          <div>
            <h3 className="font-semibold text-sm">{service.name}</h3>
            <p className="text-xs text-gray-500 font-mono">:{service.port}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{service.desc}</p>
    </div>
  );
}

// ─── Service Detail Page ──────────────────────────────────────────
function ServiceDetail({ services, statuses }) {
  const { id } = useParams();
  const service = services.find((s) => s.id === id);
  const navigate = useNavigate();

  if (!service) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-4xl mb-3">🔍</p>
        <p>Service not found</p>
        <button onClick={() => navigate('/')} className="mt-3 text-sm text-blue-400 hover:underline">Back to overview</button>
      </div>
    );
  }

  const st = statuses[id] || 'unknown';
  const statusLabel = st === 'ok' ? 'Online' : st === 'degraded' ? 'Degraded' : st === 'error' ? 'Offline' : 'Unknown';

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-500">&larr;</button>
        <span className="text-3xl">{service.icon}</span>
        <div>
          <h1 className="text-xl font-bold">{service.name}</h1>
          <p className="text-sm text-gray-500">
            <code className="text-gray-400">{service.id}</code> · Port <code className="text-gray-400">{service.port}</code>
          </p>
        </div>
        <StatusBadge status={st} />
      </div>

      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-300">Service Details</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Status', statusLabel],
            ['Port', service.port.toString()],
            ['Response', st === 'ok' ? '< 1s' : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between p-2 bg-gray-800/40 rounded-lg">
              <span className="text-gray-500">{k}</span>
              <span className="font-mono text-gray-300">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">{service.desc}</p>
      </div>

      {id === 'queue' && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-500 font-medium">Kiosk Preview</div>
          <iframe
            src={`http://localhost:${service.port}`}
            className="w-full h-96 border-0"
            title="Queue Kiosk"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────
export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statuses, setStatuses] = useState({});

  const checkHealth = useCallback(async () => {
    const results = {};
    for (const svc of SERVICES) {
      try {
        const res = await fetch(`http://localhost:${svc.port}/health`, { signal: AbortSignal.timeout(3000) });
        results[svc.id] = res.ok ? 'ok' : 'error';
      } catch {
        results[svc.id] = 'error';
      }
    }
    setStatuses(results);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar services={SERVICES} statuses={statuses} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top mobile bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-2.5 bg-gray-900/90 border-b border-gray-800">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 hover:bg-gray-800 rounded-lg">
            <HamburgerIcon />
          </button>
          <span className="text-sm font-bold">Business OS</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Routes>
            <Route path="/" element={<Overview services={SERVICES} statuses={statuses} refresh={checkHealth} />} />
            <Route path="/:id" element={<ServiceDetail services={SERVICES} statuses={statuses} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

