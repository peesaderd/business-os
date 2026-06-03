'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'schedule_queue.json');

class Scheduler {
  constructor(options = {}) {
    this.adapters = options.adapters || {};
    this.contentAdapter = options.contentAdapter || null;
    this.intervalMs = options.intervalMs || 60_000;
    this._timer = null;
    this._queue = [];
    this._load();
  }

  // ─── Public API ─────────────────────────────────────────────

  schedule(postData) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const entry = {
      id,
      status: 'scheduled',
      postData,
      scheduledAt: postData.scheduled_at || now,
      createdAt: now,
      retryCount: 0,
      maxRetries: 3,
      lastError: null,
      completedAt: null,
    };
    this._queue.push(entry);
    this._save();
    return entry;
  }

  publishNow(postData) {
    const id = crypto.randomUUID();
    const entry = {
      id,
      status: 'publishing',
      postData,
      scheduledAt: Date.now(),
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      lastError: null,
      completedAt: null,
    };
    this._queue.push(entry);
    this._save();
    // Kick off immediately
    setImmediate(() => this._publish(entry));
    return entry;
  }

  getPost(id) {
    return this._queue.find(e => e.id === id) || null;
  }

  listScheduled(filter) {
    let items = this._queue;
    if (filter === 'pending') {
      items = items.filter(e => e.status === 'scheduled');
    } else if (filter === 'all') {
      // no filter
    }
    return items.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  cancel(id) {
    const idx = this._queue.findIndex(e => e.id === id);
    if (idx === -1) return false;
    const entry = this._queue[idx];
    if (entry.status === 'published' || entry.status === 'failed') return false;
    entry.status = 'cancelled';
    entry.completedAt = Date.now();
    this._save();
    return true;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), this.intervalMs);
    // Also do an immediate check
    setImmediate(() => this._tick());
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // ─── Internal ───────────────────────────────────────────────

  _tick() {
    const now = Date.now();
    const due = this._queue.filter(
      e => e.status === 'scheduled' && e.scheduledAt <= now
    );
    for (const entry of due) {
      entry.status = 'publishing';
      this._save();
      this._publish(entry);
    }
  }

  async _publish(entry) {
    const { postData } = entry;
    const { platforms = [], content = '', media_urls = [], language } = postData;

    const results = [];
    let overallOk = true;

    for (const platform of platforms) {
      const adapter = this.adapters[platform];
      if (!adapter) {
        results.push({ platform, status: 'error', error: `No adapter for ${platform}` });
        overallOk = false;
        continue;
      }

      try {
        // Optionally adapt content for this platform
        let adaptedContent = content;
        let adaptedMedia = media_urls;
        if (this.contentAdapter) {
          const adapted = await this.contentAdapter.adapt(content, platform, media_urls, language);
          adaptedContent = adapted.content;
          adaptedMedia = adapted.media_urls;
        }

        // Validate
        const validation = adapter.validate({ content: adaptedContent, media_urls: adaptedMedia });
        if (!validation.valid) {
          results.push({ platform, status: 'error', error: validation.error });
          overallOk = false;
          continue;
        }

        // Publish
        const publishResult = await adapter.publish({ content: adaptedContent, media_urls: adaptedMedia });
        results.push({ platform, status: 'published', result: publishResult });
      } catch (err) {
        results.push({ platform, status: 'error', error: err.message });
        overallOk = false;
      }
    }

    const allOk = results.every(r => r.status === 'published');
    entry.status = allOk ? 'published' : results.some(r => r.status === 'published') ? 'partial' : 'failed';
    if (entry.status === 'failed' && entry.retryCount < entry.maxRetries) {
      entry.retryCount += 1;
      entry.status = 'scheduled';
      entry.scheduledAt = Date.now() + (entry.retryCount * 60_000); // backoff
      entry.lastError = results.find(r => r.status === 'error')?.error || null;
    } else if (entry.status === 'failed') {
      entry.lastError = results.map(r => r.error).filter(Boolean).join('; ');
    }
    entry.completedAt = Date.now();
    entry.results = results;
    this._save();
  }

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    try {
      const data = JSON.stringify(this._queue, null, 2);
      fs.writeFileSync(DB_PATH, data, 'utf-8');
    } catch (err) {
      console.error('[scheduler] Failed to save queue:', err.message);
    }
  }

  _load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        this._queue = JSON.parse(raw);
      }
    } catch (err) {
      console.error('[scheduler] Failed to load queue, starting fresh:', err.message);
      this._queue = [];
    }
  }
}

module.exports = Scheduler;
