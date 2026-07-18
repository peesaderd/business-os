import React from 'react';
import { User, Mail, Building2, Phone, Save, Key, Bell } from 'lucide-react';

export default function Settings() {
  const [profile, setProfile] = React.useState({
    name: localStorage.getItem('bos_user') ? JSON.parse(localStorage.getItem('bos_user'))?.name || '' : '',
    email: localStorage.getItem('bos_user') ? JSON.parse(localStorage.getItem('bos_user'))?.email || '' : '',
    business: '',
    phone: '',
  });
  const [saved, setSaved] = React.useState(false);

  const updateField = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('bos_user') || '{}');
    localStorage.setItem('bos_user', JSON.stringify({ ...user, ...profile }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">ตั้งค่าโปรไฟล์</h2>
      
      <form onSubmit={handleSave} className="os-window p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
              <User size={14} className="text-muted-foreground" /> ชื่อ
            </label>
            <input
              value={profile.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
              <Mail size={14} className="text-muted-foreground" /> อีเมล
            </label>
            <input
              value={profile.email}
              onChange={(e) => updateField('email', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
              <Building2 size={14} className="text-muted-foreground" /> ชื่อธุรกิจ
            </label>
            <input
              value={profile.business}
              onChange={(e) => updateField('business', e.target.value)}
              placeholder="ชื่อร้าน/บริษัท"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
              <Phone size={14} className="text-muted-foreground" /> เบอร์โทร
            </label>
            <input
              value={profile.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="08X-XXX-XXXX"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition text-sm"
        >
          <Save size={16} />
          บันทึก
        </button>

        {saved && (
          <div className="text-sm text-green-600 dark:text-green-400">
            บันทึกเรียบร้อย
          </div>
        )}
      </form>

      {/* API Key Section */}
      <div className="os-window p-6">
        <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
          <Key size={14} /> คีย์ API
        </h3>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">API Key ของคุณ</label>
          <code className="px-3 py-2 rounded bg-muted text-xs block break-all">
            {localStorage.getItem('bos_token')?.substring(0, 20)}...
          </code>
        </div>
      </div>
    </div>
  );
}
