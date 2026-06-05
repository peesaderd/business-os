/**
 * WordPress REST API Client — Per-customer HTTP client
 */
const https = require('https');
const http = require('http');

class WordPressClient {
  constructor({ siteUrl, apiKey }) {
    this.siteUrl = siteUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.baseUrl = `${this.siteUrl}/wp-json`;
  }

  _get(url) {
    return this._request('GET', url);
  }

  _post(url, data) {
    return this._request('POST', url, data);
  }

  _request(method, path, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${path}`);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'X-WPilot-Key': this.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'WPilot-Engine/1.0',
        },
        timeout: 30000,
      };

      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 400) {
              reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            resolve(body);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });

      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  // ── Site Status ──
  async getStatus() {
    try {
      const info = await this._get('/wpilot/v1/status');
      return { connected: true, ...info };
    } catch (e) {
      // Fallback: try WP native REST API
      try {
        const info = await this._get('/wp/v2/');
        return { connected: true, siteName: info.name, wpVersion: '', plugins: [] };
      } catch (e2) {
        return { connected: false, error: e2.message };
      }
    }
  }

  // ── Plugin List ──
  async getPlugins() {
    return this._get('/wpilot/v1/plugins');
  }

  // ── Core Version ──
  async getCoreVersion() {
    return this._get('/wpilot/v1/core-version');
  }

  // ── Execute Command ──
  async executeCommand(command) {
    return this._post('/wpilot/v1/command', { command });
  }

  // ── Create Post ──
  async createPost({ title, content, status = 'draft', categories = [], featuredMedia = 0 }) {
    return this._post('/wp/v2/posts', { title, content, status, categories, featured_media: featuredMedia });
  }

  // ── Create Page ──
  async createPage({ title, content, status = 'draft' }) {
    return this._post('/wp/v2/pages', { title, content, status });
  }

  // ── Upload Media ──
  async uploadMedia(imageUrl) {
    // Download image first, then upload via REST API
    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = imageUrl.split('/').pop() || 'image.jpg';

    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}/wp/v2/media`);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'X-WPilot-Key': this.apiKey,
          'Content-Type': 'image/jpeg',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buffer.length,
          'User-Agent': 'WPilot-Engine/1.0',
        },
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error(body)); }
        });
      });
      req.on('error', reject);
      req.write(buffer);
      req.end();
    });
  }

  // ── Backup ──
  async createBackup() {
    return this._post('/wpilot/v1/backup', {});
  }

  // ── Restore ──
  async restoreBackup(backupId) {
    return this._post('/wpilot/v1/restore', { backupId });
  }
}

module.exports = WordPressClient;
