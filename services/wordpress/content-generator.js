/**
 * Content Generator — AI-powered WordPress content creation
 *
 * Uses DeepSeek/OpenAI via ERP MCP to generate blog posts, pages,
 * rewrites, and translations. Integrates with Image Gen for featured images.
 */

const https = require('https');
const http = require('http');

const AI_API_URL = process.env.AI_API_URL || 'http://localhost:18789';
const AI_MODEL = process.env.AI_MODEL || 'deepseek/deepseek-chat';
const AI_TEMP = parseFloat(process.env.AI_TEMPERATURE || '0.7');
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '4096', 10);
const IMAGE_GEN_URL = process.env.IMAGE_GEN_URL || 'http://localhost:8110/api/image/v1';

// ── AI Completion via ERP MCP ─────────────────────────────────────

function aiComplete(prompt, systemPrompt = 'You are a professional content writer.') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`${AI_API_URL.replace(/\/+$/, '')}/api/ai/chat`);
    const body = JSON.stringify({
      tenantId: process.env.ERP_TENANT_ID || 'default',
      sessionId: `wp-content-${Date.now()}`,
      message: prompt,
      system: systemPrompt,
      model: AI_MODEL,
      temperature: AI_TEMP,
      maxTokens: AI_MAX_TOKENS,
    });

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 18789,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-API-Key': process.env.ERP_INTERNAL_KEY || 'bos-internal-dev-key-2026',
      },
      timeout: 60000,
    };

    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response || parsed.message || parsed.text || data);
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('AI timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Generate Image via Image Gen Service ─────────────────────────

function generateImage(prompt, style = 'product') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`${IMAGE_GEN_URL}/generate`);
    const body = JSON.stringify({
      prompt,
      style: style || 'product',
      tenantId: process.env.ERP_TENANT_ID || 'default',
      size: '1024x1024',
    });

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 8110,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-API-Key': process.env.ERP_INTERNAL_KEY || 'bos-internal-dev-key-2026',
      },
      timeout: 30000,
    };

    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ url: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Content Generation Functions ──────────────────────────────────

async function generatePost({ topic, keywords, tone, category, template, featuredImage, wpClient }) {
  // 1. Generate content via AI
  const systemPrompt = `You are a professional content writer. Write in a ${tone} tone. 
Format your response as valid JSON with these fields:
- title: An SEO-optimized title
- content: HTML content with proper heading hierarchy (h2, h3), paragraphs, and lists
- excerpt: A 2-3 sentence summary
- metaDescription: SEO meta description (max 160 chars)`;

  const prompt = `Write a blog post about: "${topic}"
${keywords.length ? `Include these keywords: ${keywords.join(', ')}` : ''}
${category ? `Category: ${category}` : ''}
${template ? `Style template: ${template}` : ''}`;

  const rawContent = await aiComplete(prompt, systemPrompt);
  let content;

  try {
    // Try to parse as JSON first
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    content = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      title: topic,
      content: rawContent,
      excerpt: rawContent.substring(0, 200),
    };
  } catch (e) {
    content = { title: topic, content: rawContent, excerpt: rawContent.substring(0, 200) };
  }

  // 2. Generate featured image if requested
  let imageId = null;
  if (featuredImage !== false && wpClient) {
    try {
      const imagePrompt = featuredImage || `Professional image for: ${topic}`;
      const imgResult = await generateImage(imagePrompt);
      if (imgResult && imgResult.url) {
        const media = await wpClient.importMediaFromUrl(imgResult.url, content.title);
        if (media && media.id) imageId = media.id;
      }
    } catch (e) {
      console.warn(`[content-gen] Featured image skipped: ${e.message}`);
    }
  }

  // 3. Create the post in WordPress
  if (wpClient) {
    const postData = {
      title: content.title || topic,
      content: content.content || rawContent,
      excerpt: content.excerpt || '',
      status: 'publish',
      categories: category ? [category] : [],
      tags: keywords || [],
      meta: {
        _ai_generated: true,
        _ai_source: topic,
        _meta_description: content.metaDescription || '',
      },
    };

    if (imageId) {
      postData.featured_media = imageId;
    }

    const post = await wpClient.createPost(postData);
    return {
      success: true,
      post,
      generated: { title: content.title, excerpt: content.excerpt, imageGenerated: !!imageId },
    };
  }

  return { success: true, content };
}

async function generatePage({ title, sections, tone, wpClient }) {
  const systemPrompt = `You are a professional web content writer. Create page content in a ${tone} tone.
Format as JSON: { "content": "HTML content", "metaDescription": "..." }`;

  const prompt = `Write content for a page titled "${title}".
${sections.length ? `Include these sections: ${sections.join(', ')}` : 'Create appropriate sections.'}`;

  const rawContent = await aiComplete(prompt, systemPrompt);
  let content;

  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    content = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: rawContent };
  } catch (e) {
    content = { content: rawContent };
  }

  if (wpClient) {
    const page = await wpClient.createPage({
      title,
      content: content.content,
      status: 'publish',
      meta: { _ai_generated: true },
    });
    return { success: true, page };
  }

  return { success: true, content: content.content };
}

async function rewritePost(postId, tone, wpClient) {
  if (!wpClient) throw new Error('WordPress client required');

  const post = await wpClient.getPost(postId);
  const prompt = `Rewrite the following content in a ${tone} tone. Keep all key information but improve the style.
  
Title: ${post.title?.rendered || ''}
Content: ${post.content?.rendered || ''}

Format as JSON: { "title": "new title", "content": "HTML content", "excerpt": "summary" }`;

  const rawContent = await aiComplete(prompt);
  let newContent;

  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    newContent = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: rawContent };
  } catch (e) {
    newContent = { content: rawContent };
  }

  const updated = await wpClient.updatePost(postId, {
    title: newContent.title || post.title?.rendered,
    content: newContent.content || rawContent,
    excerpt: newContent.excerpt || '',
    meta: { _ai_rewritten: true, _ai_rewrite_date: new Date().toISOString() },
  });

  return { success: true, post: updated };
}

async function translatePost(postId, language, wpClient) {
  if (!wpClient) throw new Error('WordPress client required');

  const post = await wpClient.getPost(postId);
  const prompt = `Translate the following content to ${language}. Keep all HTML formatting.
  
Title: ${post.title?.rendered || ''}
Content: ${post.content?.rendered || ''}

Return ONLY the translated content as JSON: { "title": "...", "content": "..." }`;

  const rawContent = await aiComplete(prompt);
  let translated;

  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    translated = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: rawContent };
  } catch (e) {
    translated = { content: rawContent };
  }

  const updated = await wpClient.updatePost(postId, {
    title: translated.title || post.title?.rendered,
    content: translated.content,
    meta: { _ai_translated: true, _ai_translated_lang: language },
  });

  return { success: true, language, post: updated };
}

module.exports = { generatePost, generatePage, rewritePost, translatePost, aiComplete, generateImage };
