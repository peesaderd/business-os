import React from 'react';
import { CalendarDays, Plus, Clock, User, Phone } from 'lucide-react';

export default function Booking() {
  const [bookings] = React.useState([
    { id: 1, name: 'สมชาย ใจดี', service: 'ตัดผม', time: '10:00', date: '2026-06-06', phone: '081-234-5678', status: 'confirmed' },
    { id: 2, name: 'วิภา รักดี', service: 'นวดแผนไทย', time: '14:00', date: '2026-06-06', phone: '082-345-6789', status: 'pending' },
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">ระบบจอง</h2>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition">
          <Plus size={16} />
          จองใหม่
        </button>
      </div>
      <div className="os-window overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-3 font-medium">ชื่อ</th>
                <th className="text-left p-3 font-medium">บริการ</th>
                <th className="text-left p-3 font-medium">วันที่</th>
                <th className="text-left p-3 font-medium">เวลา</th>
                <th className="text-left p-3 font-medium">เบอร์โทร</th>
                <th className="text-left p-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium">{b.name}</td>
                  <td className="p-3">{b.service}</td>
                  <td className="p-3">{b.date}</td>
                  <td className="p-3">{b.time}</td>
                  <td className="p-3 text-muted-foreground">{b.phone}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      b.status === 'confirmed' ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' :
                      'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400'
                    }`}>
                      {b.status === 'confirmed' ? 'ยืนยันแล้ว' : 'รอ確認'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
