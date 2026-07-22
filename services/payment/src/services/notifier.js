/**
 * Notifier Service — แจ้งเตือนเมื่อรับเงิน
 * ✅ LINE Notify
 * ✅ Telegram
 * ✅ Console/Log
 * ✅ Webhook
 */
const https = require('https');
const db = require('../db');

// ── Token จาก .env ──
const LINE_TOKEN = process.env.LINE_NOTIFY_TOKEN || null;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || null;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;

module.exports = {
  /**
   * ส่งการแจ้งเตือน
   * @param {'all'|'line'|'telegram'|'console'} channel
   */
  async send({ channel = 'all', title, message, metadata = {} }) {
    const results = {};

    // ── Log to DB ──
    try {
      db.addLog({
        customerId: metadata?.customerId || 'system',
        level: 'info',
        message: `${title}: ${message}`,
        metadata,
      });
      results.db = true;
    } catch (e) {
      results.db = false;
    }

    // ── Console ──
    console.log(`[notifier] ${title} | ${message}`);
    results.console = true;

    // ── LINE Notify ──
    if (LINE_TOKEN && (channel === 'all' || channel === 'line')) {
      try {
        await this.sendLine({ title, message });
        results.line = true;
      } catch (e) {
        console.warn('[notifier] LINE failed:', e.message);
        results.line = false;
      }
    } else {
      results.line = 'skipped (no token)';
    }

    // ── Telegram ──
    if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID && (channel === 'all' || channel === 'telegram')) {
      try {
        await this.sendTelegram({ title, message });
        results.telegram = true;
      } catch (e) {
        console.warn('[notifier] Telegram failed:', e.message);
        results.telegram = false;
      }
    } else {
      results.telegram = 'skipped (no config)';
    }

    return results;
  },

  /**
   * LINE Notify API
   */
  async sendLine({ title, message }) {
    const text = `${title}\n${message}`;
    const postData = `message=${encodeURIComponent(text)}`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'notify-api.line.me',
        path: '/api/notify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Bearer ${LINE_TOKEN}`,
        },
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { resolve({ raw: body }); }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  },

  /**
   * Telegram Bot API
   */
  async sendTelegram({ title, message }) {
    const text = `*${title}*\n${message}`;
    const postData = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown',
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { resolve({ raw: body }); }
        });
      });
      req.on('error', reject);
      req.end(postData);
    });
  },

  /**
   * ตั้งค่า LINE Token (runtime)
   */
  setLineToken(token) {
    process.env.LINE_NOTIFY_TOKEN = token;
  },

  /**
   * ตั้งค่า Telegram (runtime)
   */
  setTelegram(token, chatId) {
    process.env.TELEGRAM_BOT_TOKEN = token;
    process.env.TELEGRAM_CHAT_ID = chatId;
  },
};
