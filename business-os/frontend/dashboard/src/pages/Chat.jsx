import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Trash2 } from 'lucide-react';
import api from '../lib/api';

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'สวัสดีครับ! ผม AI Assistant ของ Business OS สอบถามอะไรก็ได้เลยครับ' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('opencode-go/deepseek-v4-flash');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      const res = await api.post('/chat/send', { message: text, model });
      const reply = res.data?.reply || res.data?.response || res.data?.text || 'ไม่ได้รับคำตอบ';
      setMessages((prev) => [...prev, { role: 'ai', text: reply }]);
    } catch (err) {
      const detail = err.response?.data?.error || err.message;
      // Fallback: use Open Design API directly
      try {
        const odRes = await api.post('/design/runs', {
          agentId: 'opencode',
          model: 'opencode-go/deepseek-v4-flash',
          message: text,
        });
        const runId = odRes.data?.runId;
        if (runId) {
          // Wait a bit and check
          await new Promise(r => setTimeout(r, 5000));
          const events = await api.get(`/design/runs/${runId}/events`);
          const lines = events.data?.split?.('\n') || [];
          let reply = '';
          for (const line of lines) {
            try {
              const d = JSON.parse(line.replace(/^data:/, '').trim());
              if (d.data?.type === 'text_delta') reply += d.data.delta;
            } catch {}
          }
          setMessages((prev) => [...prev, { role: 'ai', text: reply || 'ตอบเสร็จแล้ว (ดูใน Open Design)' }]);
        }
      } catch (odErr) {
        setMessages((prev) => [...prev, {
          role: 'ai',
          text: `API ไม่พร้อมใช้งานชั่วคราว (${detail})`
        }]);
      }
    }
    setLoading(false);
  };

  const clear = () => {
    setMessages([{ role: 'ai', text: ' clearedแล้ว พร้อมเริ่มใหม่!' }]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Header */}
      <div className="os-window-header shrink-0">
        <span className="os-window-dot red" />
        <span className="os-window-dot yellow" />
        <span className="os-window-dot green" />
        <span className="text-sm font-medium ml-2">AI Assistant</span>
        <div className="flex-1" />
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="text-xs bg-background border border-input rounded px-2 py-1"
        >
          <option value="opencode-go/deepseek-v4-flash">DeepSeek V4 Flash</option>
          <option value="opencode-go/deepseek-v4-pro">DeepSeek V4 Pro</option>
          <option value="opencode/claude-sonnet-4-5">Claude Sonnet 4.5</option>
          <option value="opencode/gpt-5.5">GPT 5.5</option>
        </select>
        <button onClick={clear} className="p-1.5 rounded hover:bg-secondary">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'ai' && (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] p-3 rounded-xl text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted rounded-bl-md'
              }`}
            >
              {msg.text}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <User size={16} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot size={16} className="text-primary" />
            </div>
            <div className="bg-muted p-3 rounded-xl rounded-bl-md">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border p-4 bg-card/50">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="พิมพ์ข้อความที่นี่..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
