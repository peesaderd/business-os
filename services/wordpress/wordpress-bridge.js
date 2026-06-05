/**
 * WordPress REST API Bridge
 *
 * Uses cookie-based authentication with WP nonces for reliable
 * service-to-service communication with WordPress.
 */

const http = require('http');
const https = require('https');
const querystring = require('querystring');

function createClient(wpUrl, adminUser, adminPass) {
  const baseUrl = wpUrl.replace(/\/+$/, '');
  const urlObj = new URL(baseUrl);
  const isHttps = baseUrl.startsWith('https');
  const lib = isHttps ? https : http;

  let cookies = '';
  let nonce = '';
  let lastAuth = 0;

  // ── HTTP Request ───────────────────────────────────────────────

  function httpRequest(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path.startsWith('http') ? path : `${urlObj.origin}${path}`);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Accept': 'application/json',
          ...headers,
        },
        timeout: 30000,
      };

      const req = lib.request(options, (res) => {
        let data = '';
        // Save cookies
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          cookies = setCookie.map(c => c.split(';')[0]).join('; ');
        }

        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode >= 400) {
              reject(Object.assign(new Error(parsed.message || `HTTP ${res.statusCode}`), {
                statusCode: res.statusCode,
                code: parsed.code,
                response: parsed,
              }));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  // ── Authenticate ───────────────────────────────────────────────

  async function authenticate() {
    // Step 1: Login to WordPress
    const loginUrl = `${urlObj.origin}/wp-login.php`;
    const loginData = querystring.stringify({
      log: adminUser,
      pwd: adminPass,
      wp_submit: 'Log In',
      redirect_to: '/wp-admin/',
      testcookie: '1',
    });

    await httpRequest('POST', loginUrl, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
    }, loginData);

    // Step 2: Get REST nonce
    const nonceResult = await httpRequest('GET', `${urlObj.origin}/wp-admin/admin-ajax.php?action=rest-nonce`, {
      'Cookie': cookies,
    });

    nonce = typeof nonceResult === 'string' ? nonceResult : (nonceResult || '');
    lastAuth = Date.now();

    return { authenticated: true, nonce: !!nonce };
  }

  // ── Authed request (auto-renews session) ───────────────────────

  async function authedRequest(method, endpoint, data = null, isFormData = false) {
    // Renew auth if older than 30 minutes
    if (Date.now() - lastAuth > 30 * 60 * 1000 || !nonce) {
      await authenticate();
    }

    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const fullPath = `${urlObj.origin}/wp-json/wp/v2${path}`;

    const headers = {
      'Cookie': cookies,
      'X-WP-Nonce': nonce,
    };

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      return await httpRequest(method, fullPath, headers, data);
    } catch (err) {
      // If auth expired, retry once
      if (err.statusCode === 401 || err.code === 'rest_cookie_invalid_nonce') {
        await authenticate();
        return await httpRequest(method, fullPath, {
          'Cookie': cookies,
          'X-WP-Nonce': nonce,
          'Content-Type': 'application/json',
        }, data);
      }
      throw err;
    }
  }

  // ── Health ──────────────────────────────────────────────────────

  async function health() {
    try {
      const result = await httpRequest('GET', `${urlObj.origin}/?rest_route=/`, {
        'Cookie': cookies,
      });
      return { status: 'connected', name: result.name || 'WordPress' };
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }

  // ── Posts ───────────────────────────────────────────────────────

  async function getPosts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return authedRequest('GET', `/posts?${query}`);
  }

  async function getPost(id) {
    return authedRequest('GET', `/posts/${id}`);
  }

  async function createPost(data) {
    return authedRequest('POST', '/posts', data);
  }

  async function updatePost(id, data) {
    return authedRequest('PUT', `/posts/${id}`, data);
  }

  async function deletePost(id, force = true) {
    return authedRequest('DELETE', `/posts/${id}?force=${force}`);
  }

  // ── Pages ───────────────────────────────────────────────────────

  async function getPages(params = {}) {
    const query = new URLSearchParams(params).toString();
    return authedRequest('GET', `/pages?${query}`);
  }

  async function getPage(id) {
    return authedRequest('GET', `/pages/${id}`);
  }

  async function createPage(data) {
    return authedRequest('POST', '/pages', data);
  }

  async function updatePage(id, data) {
    return authedRequest('PUT', `/pages/${id}`, data);
  }

  async function deletePage(id) {
    return authedRequest('DELETE', `/pages/${id}?force=true`);
  }

  // ── Media ───────────────────────────────────────────────────────

  async function getMedia(params = {}) {
    const query = new URLSearchParams(params).toString();
    return authedRequest('GET', `/media?${query}`);
  }

  async function importMediaFromUrl(imageUrl, title, alt = '') {
    // Download image
    const imgLib = imageUrl.startsWith('https') ? https : http;
    const buffer = await new Promise((resolve, reject) => {
      imgLib.get(imageUrl, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    });

    const contentType = 'image/png'; // Default
    const filename = `${title?.replace(/[^a-zA-Z0-9]/g, '_') || 'image'}.png`;

    // Upload via REST API with multipart
    const boundary = `----Boundary${Date.now()}`;
    const bodyParts = [];

    // File part
    bodyParts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    ));
    bodyParts.push(buffer);

    // Title part
    bodyParts.push(Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${title}\r\n`
    ));

    // Alt text part
    if (alt) {
      bodyParts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="alt_text"\r\n\r\n${alt}\r\n`
      ));
    }

    bodyParts.push(Buffer.from(`--${boundary}--\r\n`));

    const fullBody = Buffer.concat(bodyParts);

    // Renew auth if needed
    if (Date.now() - lastAuth > 30 * 60 * 1000 || !nonce) {
      await authenticate();
    }

    return httpRequest('POST', `${urlObj.origin}/wp-json/wp/v2/media`, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': fullBody.length,
      'Cookie': cookies,
      'X-WP-Nonce': nonce,
    }, fullBody);
  }

  // ── Categories & Tags ───────────────────────────────────────────

  async function getCategories() {
    return authedRequest('GET', '/categories?per_page=100');
  }

  async function createCategory(name, slug) {
    return authedRequest('POST', '/categories', { name, slug: slug || name.toLowerCase().replace(/\s+/g, '-') });
  }

  async function getTags() {
    return authedRequest('GET', '/tags?per_page=100');
  }

  // ── WP-CLI helper ───────────────────────────────────────────────

  async function wpCli(command) {
    const { execSync } = require('child_process');
    try {
      const output = execSync(
        `docker exec -u www-data wp-web wp ${command}`,
        { timeout: 30000, encoding: 'utf-8' }
      );
      return { success: true, output: output.trim() };
    } catch (e) {
      return { success: false, error: e.message, stderr: e.stderr?.toString() };
    }
  }

  return {
    authenticate,
    health,
    getPosts, getPost, createPost, updatePost, deletePost,
    getPages, getPage, createPage, updatePage, deletePage,
    getMedia, importMediaFromUrl,
    getCategories, createCategory,
    getTags,
    wpCli,
  };
}

module.exports = { createClient };
