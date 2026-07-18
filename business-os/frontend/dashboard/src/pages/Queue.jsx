import React from 'react';
import {
  ClipboardList, Users, RefreshCw, Phone, SkipForward,
  CheckCircle, XCircle, ExternalLink, Settings, Clock,
  ArrowRight, Bell, MapPin, ChevronRight, ChevronLeft,
  Loader2, AlertTriangle,
} from 'lucide-react';

// ─── API Helper ────────────────────────────────────────────────────────────

const API = '/api/queue/v1';

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-Staff-Key': 'queue-staff-dev-key-2026' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'API error');
  return data;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts) {
  if (!ts) return '—';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'เมื่อครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  return `${Math.floor(mins / 60)} ชม. ${mins % 60} นาทีที่แล้ว`;
}

// ─── Status Badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    waiting:    'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
    called:     'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
    served:     'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400',
    no_show:    'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
    skipped:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  const labels = {
    waiting: 'รอคิว', called: 'เรียกแล้ว', served: 'เรียบร้อย',
    no_show: 'ไม่มา', skipped: 'ข้าม',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="os-window p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold">{value ?? '—'}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub != null && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function Queue() {
  const [state, setState] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [actionLoading, setActionLoading] = React.useState(null);
  const [showSettings, setShowSettings] = React.useState(false);
  const [smartConfig, setSmartConfig] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState('waiting'); // waiting | serving | history
  const pollingRef = React.useRef(null);

  // ── Load data ──
  const loadData = React.useCallback(async () => {
    try {
      const [queueData, statsData] = await Promise.all([
        api('/current'),
        api('/stats'),
      ]);
      setState(queueData);
      setStats(statsData.stats || statsData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
    pollingRef.current = setInterval(loadData, 5000);
    return () => clearInterval(pollingRef.current);
  }, [loadData]);

  // ── Actions ──
  const doAction = async (action, ticketNumber) => {
    setActionLoading(ticketNumber);
    try {
      await api(`/${action}/${ticketNumber}`, {
        method: 'POST',
        body: JSON.stringify({ counterId: 'counter-1' }),
      });
      await loadData();
    } catch (err) {
      alert(`ดำเนินการไม่สำเร็จ: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Load smart config ──
  const loadConfig = React.useCallback(async () => {
    try {
      const data = await api('/smart/config');
      setSmartConfig(data);
    } catch {}
  }, []);

  React.useEffect(() => {
    if (showSettings) loadConfig();
  }, [showSettings, loadConfig]);

  // ── Compute aggregate ──
  const waitingCount = state?.waiting?.length ?? 0;
  const servingCount = state?.serving?.length ?? 0;
  const servedToday = stats?.served ?? state?.totalServedToday ?? 0;
  const noShowCount = stats?.noShows ?? 0;
  const avgWait = stats?.averageWaitMinutes ?? '—';
  const totalJoined = state ? (waitingCount + servingCount + servedToday + noShowCount) : '—';

  // ── Render ──
  if (loading && !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle size={48} className="text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">ไม่สามารถเชื่อมต่อ Queue Service</h2>
        <p className="text-muted-foreground text-sm mb-4">{error}</p>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
          <RefreshCw size={16} />
          ลองอีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">ระบบคิว</h2>
          <p className="text-sm text-muted-foreground">จัดการคิวลูกค้าแบบเรียลไทม์</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">📡 auto-refresh 5s</span>
          <button
            onClick={loadData}
            className="p-2 rounded-lg hover:bg-secondary transition"
            title="รีเฟรช"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <a
            href="http://localhost:8113/kiosk"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition"
          >
            <ExternalLink size={14} />
            Kiosk
          </a>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition ${showSettings ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
            title="ตั้งค่า"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* ─── Settings Panel ─── */}
      {showSettings && (
        <div className="os-window p-4 space-y-3">
          <h3 className="font-medium text-sm flex items-center gap-2"><Settings size={14} /> ตั้งค่าระบบคิว</h3>
          {smartConfig ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">📍 ที่ตั้งร้าน</p>
                <p className="font-medium">{smartConfig.businessLocation?.name || '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {smartConfig.businessLocation?.lat?.toFixed(4)}, {smartConfig.businessLocation?.lng?.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">📏 ระยะ GPS</p>
                <p className="font-medium">{smartConfig.gpsRadiusMeters || '—'} ม.</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">💬 LINE</p>
                <p className={`font-medium ${smartConfig.line?.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {smartConfig.line?.enabled ? '✅ พร้อม' : '⏸️ ปิด'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">📞 โทรศัพท์ AI</p>
                <p className={`font-medium ${smartConfig.phone?.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {smartConfig.phone?.enabled ? '✅ พร้อม' : `🔧 ${smartConfig.phone?.provider || 'simulation'}`}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          )}
        </div>
      )}

      {/* ─── Stats Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Users} label="รอคิว" value={waitingCount} color="#3b82f6" />
        <StatCard icon={Bell} label="กำลังเรียก" value={servingCount} color="#f59e0b" />
        <StatCard icon={CheckCircle} label="เสร็จแล้ว" value={servedToday} color="#22c55e" />
        <StatCard icon={XCircle} label="ไม่มา" value={noShowCount} color="#ef4444" />
        <StatCard icon={Clock} label="รอเฉลี่ย" value={avgWait !== '—' ? `${avgWait} น.` : '—'} sub={`${totalJoined} รวมทั้งหมด`} color="#8b5cf6" />
      </div>

      {/* ─── Tab Bar ─── */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: 'waiting', label: 'รอคิว', count: waitingCount },
          { id: 'serving', label: 'กำลังเรียก', count: servingCount },
          { id: 'history', label: 'ประวัติวันนี้', count: servedToday },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-[1px] ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-muted text-xs">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Waiting Queue ─── */}
      {activeTab === 'waiting' && (
        <div className="os-window overflow-hidden">
          {waitingCount === 0 ? (
            <div className="text-center py-12">
              <ClipboardList size={48} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">ไม่มีคิวรออยู่</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-medium w-12">#</th>
                    <th className="text-left p-3 font-medium">เลขที่</th>
                    <th className="text-left p-3 font-medium">ชื่อ</th>
                    <th className="text-left p-3 font-medium">บริการ</th>
                    <th className="text-left p-3 font-medium">VIP</th>
                    <th className="text-left p-3 font-medium">รอมา</th>
                    <th className="text-left p-3 font-medium">ประมาณ</th>
                    <th className="text-right p-3 font-medium">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {state.waiting.map((t) => {
                    const waitTime = Math.round((Date.now() - t.joinedAt) / 60000);
                    return (
                      <tr key={t.ticketNumber} className="border-b border-border last:border-0 hover:bg-muted/30 group">
                        <td className="p-3 text-muted-foreground">{t.position}</td>
                        <td className="p-3 font-mono font-bold text-primary">{t.ticketNumber}</td>
                        <td className="p-3 font-medium">{t.customerName}</td>
                        <td className="p-3 text-muted-foreground">{t.serviceType}</td>
                        <td className="p-3">{t.isVip ? '⭐' : '—'}</td>
                        <td className="p-3 text-muted-foreground">{waitTime} น.</td>
                        <td className="p-3">
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            ~{t.estimatedWaitMinutes} น.
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => doAction('call', t.ticketNumber)}
                              disabled={actionLoading === t.ticketNumber}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-950/50 transition disabled:opacity-50"
                              title="เรียกคิว"
                            >
                              {actionLoading === t.ticketNumber ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                              เรียก
                            </button>
                            <button
                              onClick={() => doAction('skip', t.ticketNumber)}
                              disabled={actionLoading === t.ticketNumber}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-muted-foreground text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50"
                              title="ข้ามคิว"
                            >
                              <SkipForward size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Serving ─── */}
      {activeTab === 'serving' && (
        <div className="os-window overflow-hidden">
          {servingCount === 0 ? (
            <div className="text-center py-12">
              <Bell size={48} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">ไม่มีคิวที่กำลังเรียกอยู่</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-medium">เลขที่</th>
                    <th className="text-left p-3 font-medium">ชื่อ</th>
                    <th className="text-left p-3 font-medium">บริการ</th>
                    <th className="text-left p-3 font-medium">เรียกเมื่อ</th>
                    <th className="text-left p-3 font-medium">เคาน์เตอร์</th>
                    <th className="text-right p-3 font-medium">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {state.serving.map((t) => (
                    <tr key={t.ticketNumber} className="border-b border-border last:border-0 hover:bg-muted/30 group">
                      <td className="p-3 font-mono font-bold text-amber-600">{t.ticketNumber}</td>
                      <td className="p-3 font-medium">{t.customerName}</td>
                      <td className="p-3 text-muted-foreground">{t.serviceType}</td>
                      <td className="p-3 text-muted-foreground">{timeAgo(t.calledAt)}</td>
                      <td className="p-3">{t.counterId || '—'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => doAction('complete', t.ticketNumber)}
                          disabled={actionLoading === t.ticketNumber}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-950/50 transition ml-auto"
                        >
                          {actionLoading === t.ticketNumber ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          เสร็จเรียบร้อย
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── History (completed today) ─── */}
      {activeTab === 'history' && (
        <div className="os-window overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-medium">เวลา</th>
                  <th className="text-left p-3 font-medium">เลขที่</th>
                  <th className="text-left p-3 font-medium">ชื่อ</th>
                  <th className="text-left p-3 font-medium">บริการ</th>
                  <th className="text-left p-3 font-medium">รอจริง</th>
                  <th className="text-left p-3 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {state?.completed?.length === 0 && state?.skipped?.length === 0 && state?.noShowList?.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">ไม่มีประวัติวันนี้</td></tr>
                ) : (
                  <>
                    {state.completed?.map((t) => (
                      <tr key={`done-${t.ticketNumber}`} className="border-b border-border hover:bg-muted/30">
                        <td className="p-3 text-muted-foreground">{formatTime(t.servedAt)}</td>
                        <td className="p-3 font-mono">{t.ticketNumber}</td>
                        <td className="p-3">{t.customerName}</td>
                        <td className="p-3 text-muted-foreground">{t.serviceType}</td>
                        <td className="p-3">{t.actualWaitMinutes ? `${Math.round(t.actualWaitMinutes)} น.` : '—'}</td>
                        <td className="p-3"><StatusBadge status={t.status} /></td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Smart Notify ─── */}
      <details className="os-window p-3 text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
          🧠 Smart Queue (LINE, โทร, GPS)
        </summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            LINE และระบบโทรศัพท์ AI จะแจ้งเตือนลูกค้าอัตโนมัติเมื่อใกล้ถึงคิว
            (ต้องตั้งค่า API keys ใน .env ก่อน)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                try {
                  const res = await api('/smart/notify', { method: 'POST' });
                  alert(`ส่ง LINE: ${res.notified?.line?.sent || 0} ราย, โทร: ${res.notified?.phone?.calls || 0} ราย`);
                  await loadData();
                } catch (err) {
                  alert(`Error: ${err.message}`);
                }
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition"
            >
              <Bell size={14} />
              แจ้งเตือนตอนนี้
            </button>
            <button
              onClick={async () => {
                try {
                  await loadConfig();
                  alert(`📍 GPS: ${smartConfig?.businessLocation?.name || '—'}\n📏 รัศมี: ${smartConfig?.gpsRadiusMeters || '—'} ม.\n💬 LINE: ${smartConfig?.line?.enabled ? 'พร้อม' : 'ปิด'}\n📞 โทร: ${smartConfig?.phone?.provider || 'simulation'}`);
                } catch {}
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-secondary transition"
            >
              <MapPin size={14} />
              ตรวจสอบสถานะ
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
