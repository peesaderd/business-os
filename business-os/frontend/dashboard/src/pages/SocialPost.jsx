import React from 'react';
import { Share2, Send, Clock, Camera, MessageCircle, Image as ImageIcon, ThumbsUp, Music } from 'lucide-react';
import api from '../lib/api';

const platforms = [
  { id: 'facebook', label: 'Facebook', icon: ThumbsUp, color: '#1877F2' },
  { id: 'instagram', label: 'Instagram', icon: Camera, color: '#E4405F' },
  { id: 'line', label: 'LINE', icon: MessageCircle, color: '#06C755' },
  { id: 'tiktok', label: 'TikTok', icon: Music, color: '#000000' },
];

export default function SocialPost() {
  const [content, setContent] = React.useState('');
  const [selectedPlatforms, setSelectedPlatforms] = React.useState([]);
  const [scheduledTime, setScheduledTime] = React.useState('');
  const [mediaUrl, setMediaUrl] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [posts, setPosts] = React.useState([]);

  const togglePlatform = (id) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() || selectedPlatforms.length === 0) return;
    setSending(true);
    setResult(null);

    try {
      const payload = {
        content: content.trim(),
        platforms: selectedPlatforms,
        scheduledAt: scheduledTime || null,
        mediaUrl: mediaUrl || null,
      };
      const res = await api.post('/social/post', payload);
      setResult({ type: 'success', message: 'โพสต์ถูกสร้างเรียบร้อย!' });
      setContent('');
      setMediaUrl('');
      setScheduledTime('');
      loadPosts();
    } catch (err) {
      setResult({
        type: 'error',
        message: err.response?.data?.error || 'ไม่สามารถสร้างโพสต์ได้ โปรดลองอีกครั้ง'
      });
    }
    setSending(false);
  };

  const loadPosts = async () => {
    try {
      const res = await api.get('/social/posts');
      setPosts(res.data?.posts || res.data || []);
    } catch {}
  };

  React.useEffect(() => { loadPosts(); }, []);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Left - Create Post */}
      <div>
        <h2 className="text-lg font-semibold mb-4">สร้างโพสต์ใหม่</h2>
        <form onSubmit={handleSubmit} className="os-window p-5 space-y-4">
          {/* Content */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">เนื้อหา</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="พิมพ์ข้อความที่ต้องการโพสต์..."
              rows={5}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">{content.length} ตัวอักษร</p>
          </div>

          {/* Media URL */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">ลิงก์รูปภาพ (ไม่บังคับ)</label>
            <div className="flex gap-2">
              <ImageIcon size={16} className="absolute mt-3 ml-3 text-muted-foreground" />
              <input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
            </div>
          </div>

          {/* Platforms */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">แพลตฟอร์ม</label>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${
                    selectedPlatforms.includes(p.id)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:border-primary/50'
                  }`}
                >
                  <p.icon size={16} style={{ color: p.color }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">ตั้งเวลาโพสต์ (ไม่บังคับ)</label>
            <div className="flex gap-2 items-center">
              <Clock size={16} className="text-muted-foreground" />
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={sending || !content.trim() || selectedPlatforms.length === 0}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <>
                <Send size={18} />
                โพสต์{selectedPlatforms.length > 0 ? ` (${selectedPlatforms.length} แพลตฟอร์ม)` : ''}
              </>
            )}
          </button>

          {result && (
            <div className={`p-3 rounded-lg text-sm ${
              result.type === 'success'
                ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
            }`}>
              {result.message}
            </div>
          )}
        </form>
      </div>

      {/* Right - Post History */}
      <div>
        <h2 className="text-lg font-semibold mb-4">ประวัติโพสต์</h2>
        <div className="os-window p-5">
          {posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Share2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">ยังไม่มีโพสต์</p>
              <p className="text-xs mt-1">สร้างโพสต์แรกของคุณเลย!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 border border-border text-sm">
                  <p className="line-clamp-2">{post.content}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    {post.platforms?.map(p => <span key={p} className="px-1.5 py-0.5 rounded bg-background">{p}</span>)}
                    {post.scheduledAt && <span><Clock size={12} className="inline mr-1" />{new Date(post.scheduledAt).toLocaleString('th-TH')}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
