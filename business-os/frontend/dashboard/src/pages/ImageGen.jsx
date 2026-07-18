import React from 'react';
import { Image, Sparkles, Download, RefreshCw } from 'lucide-react';
import api from '../lib/api';

export default function ImageGen() {
  const [prompt, setPrompt] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [gallery, setGallery] = React.useState([]);
  const [model, setModel] = React.useState('default');

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setResult(null);
    try {
      const res = await api.post('/image/generate', { prompt: prompt.trim(), model });
      const url = res.data?.url || res.data?.image || res.data?.result;
      if (url) {
        setResult({ url, prompt: prompt.trim() });
      } else {
        setResult({ error: 'ไม่ได้รับลิงก์รูปภาพ' });
      }
    } catch (err) {
      setResult({ error: err.response?.data?.error || 'ไม่สามารถสร้างรูปได้' });
    }
    setGenerating(false);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Left - Generator */}
      <div>
        <h2 className="text-lg font-semibold mb-4">สร้างรูปภาพด้วย AI</h2>
        <div className="os-window p-5 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">คำอธิบายรูป</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="เช่น 'แมวไทยสีส้มนั่งอยู่บนโต๊ะไม้ สไตล์สมจริง'"
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">โมเดล</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            >
              <option value="default">Default</option>
              <option value="flux">Flux</option>
              <option value="sdxl">SDXL</option>
              <option value="dalle-3">DALL-E 3</option>
            </select>
          </div>

          <button
            onClick={generate}
            disabled={generating || !prompt.trim()}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                กำลังสร้าง...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                สร้างรูป
              </>
            )}
          </button>

          {result?.error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {result.error}
            </div>
          )}
        </div>
      </div>

      {/* Right - Result */}
      <div>
        <h2 className="text-lg font-semibold mb-4">ผลลัพธ์</h2>
        <div className="os-window p-5">
          {generating ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
              <p className="text-sm">กำลังสร้างภาพ...</p>
            </div>
          ) : result?.url ? (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden bg-muted">
                <img
                  src={result.url}
                  alt={result.prompt}
                  className="w-full h-auto"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<div class="p-8 text-center text-muted-foreground text-sm">ไม่สามารถโหลดรูปภาพได้</div>';
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{result.prompt}</p>
              <a
                href={result.url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 transition text-sm w-fit"
              >
                <Download size={16} />
                ดาวน์โหลด
              </a>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <Image size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">ยังไม่มีรูป</p>
              <p className="text-xs mt-1">ใส่คำอธิบายแล้วกดสร้าง</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
