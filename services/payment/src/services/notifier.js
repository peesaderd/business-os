/**
 * Notifier Service — แจ้งเตือนเมื่อรับเงิน
 * ✅ LINE Notify
 * ✅ Console/Log (ใน-app)
 * ✅ Webhook
 * ✅ (เตรียม) Telegram
 */
const http = require('http');
const https = require('https');
const db = require('../db');

// ── LINE Notify Token (ตั้งค่าใน .env) ──
const LINE_TOKEN = process.env.LINE_NOTIFY_TOKEN || null;

// ── Telegram Bot Token (ตั้งค่าใน .env) ──
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || null;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;

module.exports = {
  /**
   * ส่งการแจ้งเตือน
   * @param {Object} opts
   * @param {'all'|'line'|'telegram'|'console'} opts.channel
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {Object} opts.metadata
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

    // ── Console (in-app) ──
    console.log(`[notifier] ${title} | ${message}`);
    results.console = true;

    // ── LINE Notify ──
    if (LINE_TOKEN && (channel === 'all' || channel === 'line')) {
      try {
        await this.sendLine({ title, message, metadata });
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
        await this.sendTelegram({ title, message, metadata });
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
  async sendLine({ title, message, metadata }) {
    return new Promise((resolve, reject) => {
      const text = `${title}\n${message}`;
      const postData = `message=${encodeURIComponent(text)}`;

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
  async sendTelegram({ title, message, metadata }) {
    const text = `*${title}*\n${message}`;
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      });

      https.request({
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
      }).end(postData);
    });
  },

  /**
   * ตั้งค่า LINE Token
   */
  setLineToken(token) {
    process.env.LINE_NOTIFY_TOKEN = token;
  },

  /**
   * ตั้งค่า Telegram
   */
  setTelegram(token, chatId) {
    process.env.TELEGRAM_BOT_TOKEN = token;
    process.env.TELEGRAM_CHAT_ID = chatId;
  },
};
