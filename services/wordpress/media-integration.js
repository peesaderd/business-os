/**
 * Media Integration — Connects WordPress with Image Gen and Video Gen services
 *
 * Routes: Image Gen (port 8110), Video Gen (port 8116)
 */

const https = require('https');
const http = require('http');

const IMAGE_GEN_URL = process.env.IMAGE_GEN_URL || 'http://localhost:8110/api/image/v1';
const VIDEO_GEN_URL = process.env.VIDEO_GEN_URL || 'http://localhost:8116/api/video/v1';
const API_KEY = process.env.ERP_INTERNAL_KEY || 'bos-internal-dev-key-2026';

// ── HTTP helper ───────────────────────────────────────────────────

function apiCall(baseUrl, path, body = null, method = 'POST') {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + (urlObj.search || ''),
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'Accept': 'application/json',
      },
      timeout: 60000,
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data }); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Generate Featured Image ───────────────────────────────────────

async function generateFeaturedImage(prompt, style = 'product', postId = null, wpClient = null) {
  const imgResult = await apiCall(IMAGE_GEN_URL, '/generate', {
    prompt,
    style: style || 'product',
    size: '1024x1024',
    tenantId: process.env.ERP_TENANT_ID || 'default',
  });

  let wpMedia = null;
  if (wpClient && imgResult.url) {
    wpMedia = await wpClient.importMediaFromUrl(
      imgResult.url,
      `Featured: ${prompt.substring(0, 50)}`,
      prompt
    );

    // Update post featured image if postId provided
    if (postId && wpMedia && wpMedia.id) {
      await wpClient.updatePost(postId, { featured_media: wpMedia.id });
    }
  }

  return {
    success: true,
    imageUrl: imgResult.url || imgResult.imageUrl,
    wpMedia,
    postId: postId || null,
  };
}

// ── Generate Product Image ────────────────────────────────────────

async function generateProductImage(productId, customPrompt = null) {
  // First try to get product data from ERP
  let productInfo = { name: 'Product' };
  try {
    const erpResponse = await apiCall(process.env.ERP_MCP_URL || 'http://localhost:18789', '/api/erp/product', {
      tenantId: process.env.ERP_TENANT_ID || 'default',
      productId,
    });
    if (erpResponse && erpResponse.name) productInfo = erpResponse;
  } catch (e) {
    // Continue without ERP data
  }

  const prompt = customPrompt || `Professional product photo of ${productInfo.name}, white background, studio lighting, 4k`;
  const imgResult = await apiCall(IMAGE_GEN_URL, '/generate', {
    prompt,
    style: 'product',
    size: '1024x1024',
    tenantId: process.env.ERP_TENANT_ID || 'default',
  });

  return {
    success: true,
    productId,
    productName: productInfo.name,
    imageUrl: imgResult.url || imgResult.imageUrl,
  };
}

// ── Generate Post Video ───────────────────────────────────────────

async function generatePostVideo(prompt, postId = null, wpClient = null) {
  const videoResult = await apiCall(VIDEO_GEN_URL, '/generate', {
    prompt,
    duration: 15,
    tenantId: process.env.ERP_TENANT_ID || 'default',
  });

  let wpMedia = null;
  if (wpClient && videoResult.url) {
    wpMedia = await wpClient.importMediaFromUrl(
      videoResult.url,
      `Video: ${prompt.substring(0, 50)}`,
      prompt
    );
  }

  return {
    success: true,
    videoUrl: videoResult.url || videoResult.videoUrl,
    jobId: videoResult.jobId || null,
    wpMedia,
    postId: postId || null,
  };
}

// ── Batch Generate ────────────────────────────────────────────────

async function batchGenerate(items = []) {
  const results = [];

  for (const item of items) {
    try {
      if (item.type === 'image') {
        const r = await apiCall(IMAGE_GEN_URL, '/generate', {
          prompt: item.prompt,
          style: item.style || 'product',
          size: item.size || '1024x1024',
        });
        results.push({ type: 'image', prompt: item.prompt, url: r.url, success: true });
      } else if (item.type === 'video') {
        const r = await apiCall(VIDEO_GEN_URL, '/generate', {
          prompt: item.prompt,
          duration: item.duration || 15,
        });
        results.push({ type: 'video', prompt: item.prompt, url: r.url || r.videoUrl, success: true });
      }
    } catch (e) {
      results.push({ type: item.type, prompt: item.prompt, error: e.message, success: false });
    }
  }

  return { success: true, total: items.length, completed: results.filter(r => r.success).length, results };
}

// ── Generate product gallery (multiple images) ────────────────────

async function generateProductGallery(productId, count = 4) {
  let productInfo = { name: 'Product' };
  try {
    const erpResponse = await apiCall(process.env.ERP_MCP_URL || 'http://localhost:18789', '/api/erp/product', {
      tenantId: process.env.ERP_TENANT_ID || 'default',
      productId,
    });
    if (erpResponse && erpResponse.name) productInfo = erpResponse;
  } catch (e) {}

  const prompts = [
    `Professional product photo of ${productInfo.name}, white background, studio lighting, front view`,
    `Professional product photo of ${productInfo.name}, white background, studio lighting, side angle`,
    `Professional product photo of ${productInfo.name}, lifestyle setting, natural lighting`,
    `Close-up detail shot of ${productInfo.name}, macro photography, sharp details`,
  ];

  const images = [];
  for (let i = 0; i < Math.min(count, prompts.length); i++) {
    try {
      const r = await apiCall(IMAGE_GEN_URL, '/generate', {
        prompt: prompts[i],
        style: 'product',
        size: '1024x1024',
      });
      if (r.url) images.push({ index: i, url: r.url, prompt: prompts[i] });
    } catch (e) {
      console.warn(`[media] Gallery image ${i} failed: ${e.message}`);
    }
  }

  return { success: true, productId, productName: productInfo.name, images };
}

module.exports = {
  generateFeaturedImage,
  generateProductImage,
  generatePostVideo,
  batchGenerate,
  generateProductGallery,
};
