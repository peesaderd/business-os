import React from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Image, Video, Share2,
  ShoppingCart, ClipboardList, CalendarDays, CreditCard,
  Globe, Quote, Settings, LogOut, Sun, Moon, PanelRightOpen,
  Bot, Palette, Users, Store, 
} from 'lucide-react';
import useAuthStore from '../store/auth';
import useAppStore from '../store/app';

const navItems = [
  { id: '', label: 'ภาพรวม', icon: LayoutDashboard, color: '#6366f1' },
  { id: 'chat', label: 'AI แชท', icon: MessageSquare, color: '#22c55e' },
  { id: 'design', label: 'AI ออกแบบ', icon: Palette, color: '#a855f7' },
  { id: 'image', label: 'สร้างรูป', icon: Image, color: '#ec4899' },
  { id: 'video', label: 'สร้างวิดีโอ', icon: Video, color: '#f43f5e' },
  { id: 'social', label: 'โพสต์โซเชียล', icon: Share2, color: '#3b82f6' },
  { id: 'queue', label: 'ระบบคิว', icon: ClipboardList, color: '#10b981' },
  { id: 'pos', label: 'หน้าร้าน (POS)', icon: ShoppingCart, color: '#f59e0b' },
  { id: 'booking', label: 'ระบบจอง', icon: CalendarDays, color: '#8b5cf6' },
  { id: 'website', label: 'สร้างเว็บไซต์', icon: Globe, color: '#06b6d4' },
  { id: 'wordpress', label: 'WordPress', icon: Quote, color: '#2563eb' },
  { id: 'payment', label: 'การเงิน', icon: CreditCard, color: '#14b8a6' },
  { id: 'settings', label: 'ตั้งค่า', icon: Settings, color: '#6b7280' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const currentPath = location.pathname.replace('/app/', '') || '';

  const handleNav = (id) => {
    navigate(id ? `/app/${id}` : '/app');
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-secondary"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <PanelRightOpen size={20} />
          </button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/app')}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Bot size={18} className="text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg hidden sm:block">Business OS</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:block">
            {user?.name || 'ผู้ใช้'}
          </span>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-secondary transition"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="p-2 rounded-lg hover:bg-secondary transition text-destructive"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className="absolute left-0 top-14 bottom-0 w-64 bg-card border-r border-border overflow-y-auto animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="p-2 space-y-0.5">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                    currentPath === item.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <item.icon size={18} style={{ color: item.color }} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-14 bottom-0 w-56 bg-card border-r border-border z-30">
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                currentPath === item.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-secondary text-foreground'
              }`}
            >
              <item.icon size={18} style={{ color: item.color }} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Users size={14} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || 'ผู้ใช้'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email || ''}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-56 p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto animate-fade-in">
          <Outlet />
        </div>
      </main>

      {/* Taskbar */}
      <div className="taskbar">
        <button
          onClick={() => navigate('/app')}
          className={`taskbar-item ${currentPath === '' ? 'active' : ''}`}
        >
          <LayoutDashboard size={16} />
          <span className="hidden sm:inline">หน้าหลัก</span>
        </button>
        {['chat', 'social', 'pos'].map((id) => {
          const item = navItems.find(n => n.id === id);
          if (!item) return null;
          return (
            <button
              key={id}
              onClick={() => handleNav(id)}
              className={`taskbar-item ${currentPath === id ? 'active' : ''}`}
            >
              <item.icon size={16} />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground px-2">
          v1.0
        </span>
      </div>
    </div>
  );
}
