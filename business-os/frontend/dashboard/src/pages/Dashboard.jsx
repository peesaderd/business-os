import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Image, Share2, ShoppingCart, CalendarDays,
  Globe, CreditCard, Palette, Video, ClipboardList, Quote, Bot, ArrowRight,
  TrendingUp, Users, DollarSign, Activity
} from 'lucide-react';
import useAppStore from '../store/app';

const services = [
  { id: 'chat', label: 'AI แชท', desc: 'แชทกับ AI ช่วยตอบคำถามลูกค้า', icon: MessageSquare, color: '#22c55e', bg: 'bg-green-50 dark:bg-green-950/30' },
  { id: 'design', label: 'AI ออกแบบ', desc: 'ออกแบบ UI, กราฟิก, เอกสารด้วย AI', icon: Palette, color: '#a855f7', bg: 'bg-purple-50 dark:bg-purple-950/30' },
  { id: 'image', label: 'สร้างรูป', desc: 'สร้างภาพจากข้อความด้วย AI', icon: Image, color: '#ec4899', bg: 'bg-pink-50 dark:bg-pink-950/30' },
  { id: 'video', label: 'สร้างวิดีโอ', desc: 'สร้างวิดีโอจากข้อความ', icon: Video, color: '#f43f5e', bg: 'bg-rose-50 dark:bg-rose-950/30' },
  { id: 'social', label: 'โพสต์โซเชียล', desc: 'สร้างและตั้งเวลาโพสต์ Social Media', icon: Share2, color: '#3b82f6', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  { id: 'queue', label: 'ระบบคิว', desc: 'จัดการคิวหน้าร้าน', icon: ClipboardList, color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  { id: 'pos', label: 'หน้าร้าน POS', desc: 'รับออเดอร์และขายหน้าร้าน', icon: ShoppingCart, color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  { id: 'booking', label: 'ระบบจอง', desc: 'จัดการการจองนัดหมาย', icon: CalendarDays, color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  { id: 'website', label: 'สร้างเว็บไซต์', desc: 'สร้างเว็บไซต์ธุรกิจ', icon: Globe, color: '#06b6d4', bg: 'bg-cyan-50 dark:bg-cyan-950/30' },
  { id: 'wordpress', label: 'WordPress', desc: 'จัดการเว็บ WordPress', icon: Quote, color: '#2563eb', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  { id: 'payment', label: 'การเงิน', desc: 'รับชำระเงินและดูรายงาน', icon: CreditCard, color: '#14b8a6', bg: 'bg-teal-50 dark:bg-teal-950/30' },
  { id: 'settings', label: 'ตั้งค่า', desc: 'จัดการโปรไฟล์ และบัญชี', icon: Bot, color: '#6b7280', bg: 'bg-gray-50 dark:bg-gray-950/30' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { theme, toggleTheme, checkHealth } = useAppStore();

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="os-window p-6 bg-gradient-to-r from-primary/5 via-primary/10 to-transparent">
        <h1 className="text-2xl font-bold">ยินดีต้อนรับ</h1>
        <p className="text-muted-foreground mt-1">
          เลือกบริการที่ต้องการใช้งานด้านล่าง
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'บริการทั้งหมด', value: '12', icon: Activity, color: '#6366f1' },
          { label: 'แชทวันนี้', value: '—', icon: MessageSquare, color: '#22c55e' },
          { label: 'ยอดโพสต์', value: '—', icon: Share2, color: '#3b82f6' },
          { label: 'ยอดขาย', value: '฿0', icon: DollarSign, color: '#f59e0b' },
        ].map((stat) => (
          <div key={stat.label} className="os-window p-4 flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: stat.color + '15', color: stat.color }}
            >
              <stat.icon size={20} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-bold">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Service Grid */}
      <h2 className="text-lg font-semibold mt-8 mb-4">บริการทั้งหมด</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {services.map((svc) => (
          <button
            key={svc.id}
            onClick={() => navigate(`/app/${svc.id}`)}
            className="os-window p-5 text-left hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
          >
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: svc.color + '15', color: svc.color }}
              >
                <svc.icon size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">{svc.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {svc.desc}
                </p>
              </div>
              <ArrowRight size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition shrink-0 mt-1" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
