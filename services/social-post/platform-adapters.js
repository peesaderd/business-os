'use strict';

/**
 * Platform Adapters for Social Media Auto Post Service
 *
 * Each adapter exposes:
 *   - publish(postData)       → { success, platformPostId, url, raw }
 *   - validate(content)       → { valid, error? }
 *   - getLimits()             → { maxChars, maxMedia, maxMediaSizeMB, supportedTypes }
 *
 * All API calls are stubbed — replace with real HTTP calls when tokens are configured.
 */

// ─── Shared Helpers ───────────────────────────────────────────

function stubApiCall(platform, endpoint, payload) {
  console.log(`[${platform}] STUB: POST ${endpoint}`, JSON.stringify(payload).slice(0, 200));
  return {
    success: true,
    platformPostId: `${platform}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url: `https://${platform}.com/stub-post/${Date.now()}`,
    raw: { simulated: true },
  };
}

function defaultValidate(content, limits) {
  const errors = [];
  if (!content || !content.content) {
    errors.push('Content text is required');
  } else if (content.content.length > limits.maxChars) {
    errors.push(`Content exceeds ${limits.maxChars} character limit (${content.content.length})`);
  }
  if (content.media_urls && content.media_urls.length > limits.maxMedia) {
    errors.push(`Media count exceeds ${limits.maxMedia}`);
  }
  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors.join('; ') : null,
  };
}

// ─── Facebook ─────────────────────────────────────────────────

const facebook = {
  name: 'facebook',
  label: 'Facebook Pages',

  getLimits() {
    return {
      maxChars: 63206,
      maxMedia: 10,
      maxMediaSizeMB: 100,
      supportedTypes: ['image', 'video', 'link', 'text'],
      maxHashtags: 30,
    };
  },

  validate(postData) {
    return defaultValidate(postData, this.getLimits());
  },

  async publish(postData) {
    // Facebook Graph API: POST /{page-id}/feed
    // Or POST /{page-id}/photos, /{page-id}/videos for media
    const payload = {
      message: postData.content,
      ...(postData.media_urls?.length && { attached_media: postData.media_urls }),
      published: true,
    };
    return stubApiCall('facebook', '/{page-id}/feed', payload);
  },
};

// ─── Instagram ────────────────────────────────────────────────

const instagram = {
  name: 'instagram',
  label: 'Instagram Business',

  getLimits() {
    return {
      maxChars: 2200,
      maxMedia: 10,  // carousel
      maxMediaSizeMB: 100,
      supportedTypes: ['image', 'video', 'carousel'],
    };
  },

  validate(postData) {
    const base = defaultValidate(postData, this.getLimits());
    if (!postData.media_urls || postData.media_urls.length === 0) {
      return { valid: false, error: 'Instagram posts require at least one media attachment' };
    }
    return base;
  },

  async publish(postData) {
    // Instagram Content Publishing API
    // 1. POST /{ig-user-id}/media (create media container)
    // 2. POST /{ig-user-id}/media_publish (publish)
    return stubApiCall('instagram', '/{ig-user-id}/media_publish', {
      caption: postData.content,
      media_type: postData.media_urls.length > 1 ? 'CAROUSEL' : 'IMAGE',
      media_urls: postData.media_urls,
    });
  },
};

// ─── TikTok ───────────────────────────────────────────────────

const tiktok = {
  name: 'tiktok',
  label: 'TikTok',

  getLimits() {
    return {
      maxChars: 2200,
      maxMedia: 1,
      maxMediaSizeMB: 500,
      supportedTypes: ['video'],
      maxDurationSec: 600,
      minDurationSec: 3,
    };
  },

  validate(postData) {
    const base = defaultValidate(postData, this.getLimits());
    if (!postData.media_urls || postData.media_urls.length === 0) {
      return { valid: false, error: 'TikTok posts require a video' };
    }
    return base;
  },

  async publish(postData) {
    // TikTok Direct Post API v2
    // POST /v2/video/upload/init → upload → POST /v2/video/publish/
    return stubApiCall('tiktok', '/v2/video/publish/', {
      caption: postData.content,
      source_info: { source: 'PULL_FROM_URL', video_url: postData.media_urls?.[0] },
    });
  },
};

// ─── LINE ─────────────────────────────────────────────────────

const line = {
  name: 'line',
  label: 'LINE Messaging',

  getLimits() {
    return {
      maxChars: 5000,
      maxMedia: 5,
      maxMediaSizeMB: 10,
      supportedTypes: ['text', 'image', 'video', 'sticker', 'flex'],
    };
  },

  validate(postData) {
    return defaultValidate(postData, this.getLimits());
  },

  async publish(postData) {
    // LINE Messaging API: POST /v2/bot/message/broadcast
    const messages = [];
    if (postData.content) {
      messages.push({ type: 'text', text: postData.content });
    }
    if (postData.media_urls) {
      for (const url of postData.media_urls) {
        messages.push({ type: 'image', originalContentUrl: url, previewImageUrl: url });
      }
    }
    return stubApiCall('line', '/v2/bot/message/broadcast', { messages });
  },
};

// ─── LinkedIn ─────────────────────────────────────────────────

const linkedin = {
  name: 'linkedin',
  label: 'LinkedIn Company Page',

  getLimits() {
    return {
      maxChars: 3000,
      maxMedia: 9,
      maxMediaSizeMB: 100,
      supportedTypes: ['image', 'video', 'article', 'text'],
    };
  },

  validate(postData) {
    return defaultValidate(postData, this.getLimits());
  },

  async publish(postData) {
    // LinkedIn Posts API (w_organization_social)
    // POST /rest/posts
    const author = 'urn:li:organization:{organizationId}';
    const payload = {
      author,
      lifecycleState: 'PUBLISHED',
      visibility: 'PUBLIC',
      commentary: postData.content,
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    };
    if (postData.media_urls?.length) {
      payload.content = {
        media: {
          id: postData.media_urls[0],
          title: postData.content?.slice(0, 200),
        },
      };
    }
    return stubApiCall('linkedin', '/rest/posts', payload);
  },
};

// ─── Twitter / X ──────────────────────────────────────────────

const twitter = {
  name: 'twitter',
  label: 'Twitter / X',

  getLimits() {
    return {
      maxChars: 280,
      maxMedia: 4,
      maxMediaSizeMB: 5,
      supportedTypes: ['image', 'video', 'gif', 'text', 'poll'],
      maxHashtags: 10,
    };
  },

  validate(postData) {
    const base = defaultValidate(postData, this.getLimits());
    return base;
  },

  async publish(postData) {
    // Twitter API v2: POST /2/tweets
    const payload = { text: postData.content };
    if (postData.media_urls?.length) {
      payload.media = { media_ids: postData.media_urls };
    }
    return stubApiCall('twitter', '/2/tweets', payload);
  },
};

// ─── YouTube ──────────────────────────────────────────────────

const youtube = {
  name: 'youtube',
  label: 'YouTube',

  getLimits() {
    return {
      maxChars: 5000,
      maxMedia: 1,
      maxMediaSizeMB: 256000,  // 256 GB for videos
      supportedTypes: ['video'],
      maxDurationSec: 43200,  // 12 hours
    };
  },

  validate(postData) {
    const errors = [];
    if (!postData.media_urls || postData.media_urls.length === 0) {
      errors.push('YouTube requires a video to publish');
    }
    if (!postData.content) {
      errors.push('Title/description is required');
    }
    return { valid: errors.length === 0, error: errors.length > 0 ? errors.join('; ') : null };
  },

  async publish(postData) {
    // YouTube Data API v3: POST /upload/youtube/v3/videos
    const payload = {
      snippet: {
        title: postData.content?.split('\n')[0]?.slice(0, 100) || 'Untitled',
        description: postData.content || '',
      },
      status: { privacyStatus: 'public' },
    };
    return stubApiCall('youtube', '/upload/youtube/v3/videos', payload);
  },
};

// ─── Exports ──────────────────────────────────────────────────

const adapters = {
  facebook,
  instagram,
  tiktok,
  line,
  linkedin,
  twitter,
  youtube,
};

module.exports = adapters;
