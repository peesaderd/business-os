'use strict';

const axios = require('axios');

/**
 * Content Adapter
 *
 * Adapts a single source post for each target platform:
 *   - Truncates/fits content to platform limits
 *   - Adjusts media count and format
 *   - Adds/removes hashtags per platform convention
 *   - Reformats text (bold, emoji handling, link wrapping)
 *
 * When AI_PROVIDER_URL is configured, it calls an LLM for smarter adaptation.
 * Falls back to rule-based adaptation.
 */

const AI_PROVIDER_URL = process.env.AI_PROVIDER_URL || '';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'deepseek/deepseek-chat';

// ─── Platform specs ───────────────────────────────────────────

const PLATFORM_SPECS = {
  facebook: {
    maxChars: 63206,
    maxMedia: 10,
    hashtagStyle: 'spaced',
    lineBreaks: true,
    linkPreview: true,
    emojiSupport: true,
  },
  instagram: {
    maxChars: 2200,
    maxMedia: 10,
    hashtagStyle: 'compact',  // all at bottom
    lineBreaks: true,
    linkPreview: false,       // links not clickable in caption
    emojiSupport: true,
    mediaRequired: true,
  },
  tiktok: {
    maxChars: 2200,
    maxMedia: 1,
    hashtagStyle: 'compact',
    lineBreaks: true,
    linkPreview: false,
    emojiSupport: true,
    mediaRequired: true,
  },
  line: {
    maxChars: 5000,
    maxMedia: 5,
    hashtagStyle: 'spaced',
    lineBreaks: true,
    linkPreview: true,
    emojiSupport: true,
  },
  linkedin: {
    maxChars: 3000,
    maxMedia: 9,
    hashtagStyle: 'compact',
    lineBreaks: true,
    linkPreview: true,
    emojiSupport: true,
  },
  twitter: {
    maxChars: 280,
    maxMedia: 4,
    hashtagStyle: 'compact',
    lineBreaks: false,
    linkPreview: true,
    emojiSupport: true,
    linkCost: 23,  // t.co wrapping
  },
  youtube: {
    maxChars: 5000,
    maxMedia: 1,
    hashtagStyle: 'compact',
    lineBreaks: true,
    linkPreview: true,
    emojiSupport: true,
    titleLength: 100,
    mediaRequired: true,
  },
};

// ─── Rule-based adaptation ────────────────────────────────────

function adaptByRules(content, mediaUrls, platform) {
  const spec = PLATFORM_SPECS[platform];
  if (!spec) return { content, media_urls: mediaUrls };

  let adapted = content || '';
  let adaptedMedia = [...(mediaUrls || [])];

  // 1. Truncate to maxChars (account for link wrapping)
  const linkCost = spec.linkCost || 0;
  const effectiveMax = spec.maxChars - (adapted.match(/https?:\/\/\S+/g) || []).length * linkCost;
  if (adapted.length > effectiveMax) {
    adapted = adapted.slice(0, effectiveMax - 3) + '...';
  }

  // 2. Handle hashtags
  // Instagram: move all hashtags to end
  if (platform === 'instagram' || platform === 'tiktok') {
    const hashtagRegex = /#\w+/g;
    const hashtags = adapted.match(hashtagRegex) || [];
    adapted = adapted.replace(hashtagRegex, '').replace(/\s+/g, ' ').trim();
    if (hashtags.length > 0) {
      adapted += '\n\n' + hashtags.join(' ');
    }
  }

  // 3. Handle line breaks (Twitter doesn't support them well)
  if (!spec.lineBreaks) {
    adapted = adapted.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 4. Trim media to platform limit
  if (adaptedMedia.length > spec.maxMedia) {
    adaptedMedia = adaptedMedia.slice(0, spec.maxMedia);
  }

  // 5. YouTube: ensure title is separate
  if (platform === 'youtube') {
    const lines = adapted.split('\n');
    if (lines.length > 1) {
      // Keep first line as title
      adapted = lines.slice(1).join('\n').trim();
    }
  }

  return { content: adapted, media_urls: adaptedMedia };
}

// ─── AI-powered adaptation ────────────────────────────────────

async function adaptByAI(content, mediaUrls, platform, language) {
  const spec = PLATFORM_SPECS[platform];
  if (!spec) return { content, media_urls: mediaUrls };

  let systemPrompt = `You are a social media content adaptation specialist. 
Adapt the given content for ${platform} following these constraints:
- Max characters: ${spec.maxChars}
- Max media attachments: ${spec.maxMedia}
- ${spec.lineBreaks ? 'Line breaks allowed' : 'No line breaks (single paragraph)'}
- ${spec.linkPreview ? 'Link previews supported' : 'No clickable links in captions'}
- Hashtag style: ${spec.hashtagStyle}
`;

  if (language) {
    systemPrompt += `\nProduce output in ${language} language.`;
  }

  systemPrompt += `\n\nReturn ONLY valid JSON: { "content": "adapted text", "media_urls": [...] }
Do not wrap in markdown code blocks.`;

  let userMessage = `Platform: ${platform}\n\nContent to adapt:${content}\n\nMedia URLs: ${JSON.stringify(mediaUrls || [])}`;

  try {
    const response = await axios.post(
      AI_PROVIDER_URL,
      {
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
        },
        timeout: 15000,
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    return {
      content: parsed.content || content,
      media_urls: parsed.media_urls || mediaUrls || [],
    };
  } catch (err) {
    console.warn(`[content-adapter] AI adaptation failed for ${platform}, falling back to rules:`, err.message);
    return adaptByRules(content, mediaUrls, platform);
  }
}

// ─── Public API ───────────────────────────────────────────────

class ContentAdapter {
  async adapt(content, platform, mediaUrls, language) {
    if (!content && (!mediaUrls || mediaUrls.length === 0)) {
      return { content: '', media_urls: [] };
    }

    if (AI_PROVIDER_URL) {
      return adaptByAI(content, mediaUrls, platform, language);
    }
    return adaptByRules(content, mediaUrls, platform);
  }

  getSpecs(platform) {
    return PLATFORM_SPECS[platform] || null;
  }

  getAllSpecs() {
    return PLATFORM_SPECS;
  }

  getTypedMedia(mediaUrls) {
    // Categorize media by type for platform-specific handling
    return {
      images: mediaUrls.filter(u => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(u)),
      videos: mediaUrls.filter(u => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(u)),
      other: mediaUrls.filter(u => !/\.(jpg|jpeg|png|gif|webp|bmp|svg|mp4|mov|avi|mkv|webm|m4v)$/i.test(u)),
    };
  }
}

module.exports = ContentAdapter;
