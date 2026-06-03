'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const crypto = require('crypto');

const Scheduler = require('./scheduler');
const adapters = require('./platform-adapters');
const ContentAdapter = require('./content-adapter');

// ─── App Setup ────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 8112;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan(':method :url :status :response-time ms'));

// ─── Core Services ────────────────────────────────────────────

const contentAdapter = new ContentAdapter();
const scheduler = new Scheduler({ adapters, contentAdapter });
scheduler.start();

// ─── In-memory store for OAuth / account links ────────────────

const linkedAccounts = [];
const oauthStates = [];

// ─── Routes ───────────────────────────────────────────────────

// Health check
app.get('/api/social/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'social-post',
    version: '0.1.0',
    uptime: process.uptime(),
    scheduledPosts: scheduler.listScheduled('all').length,
    linkedAccounts: linkedAccounts.length,
    availablePlatforms: Object.keys(adapters),
  });
});

// Create and schedule a post
app.post('/api/social/v1/post', (req, res) => {
  const { platforms, content, media_urls, scheduled_at, language } = req.body;

  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: 'platforms must be a non-empty array' });
  }
  if (!content && (!media_urls || media_urls.length === 0)) {
    return res.status(400).json({ error: 'content or media_urls required' });
  }

  // Validate platforms exist
  const unknown = platforms.filter(p => !adapters[p]);
  if (unknown.length > 0) {
    return res.status(400).json({
      error: `Unknown platforms: ${unknown.join(', ')}`,
      available: Object.keys(adapters),
    });
  }

  // Validate scheduled time
  let scheduledAt = scheduled_at ? new Date(scheduled_at).getTime() : Date.now();
  if (isNaN(scheduledAt)) {
    return res.status(400).json({ error: 'Invalid scheduled_at date' });
  }

  const postData = { platforms, content, media_urls: media_urls || [], scheduled_at: scheduledAt, language };

  // If scheduled_at is in the past or now, publish immediately
  if (scheduledAt <= Date.now()) {
    const entry = scheduler.publishNow(postData);
    return res.status(201).json({
      message: 'Post publishing now',
      id: entry.id,
      status: entry.status,
      results: entry.results || null,
    });
  }

  const entry = scheduler.schedule(postData);
  res.status(201).json({
    message: 'Post scheduled',
    id: entry.id,
    scheduledAt: new Date(scheduledAt).toISOString(),
    status: entry.status,
  });
});

// Publish immediately
app.post('/api/social/v1/post/now', (req, res) => {
  const { platforms, content, media_urls, language } = req.body;

  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: 'platforms must be a non-empty array' });
  }
  if (!content && (!media_urls || media_urls.length === 0)) {
    return res.status(400).json({ error: 'content or media_urls required' });
  }

  const unknown = platforms.filter(p => !adapters[p]);
  if (unknown.length > 0) {
    return res.status(400).json({
      error: `Unknown platforms: ${unknown.join(', ')}`,
      available: Object.keys(adapters),
    });
  }

  const postData = { platforms, content, media_urls: media_urls || [], scheduled_at: Date.now(), language };
  const entry = scheduler.publishNow(postData);

  res.status(201).json({
    message: 'Post publishing now',
    id: entry.id,
    status: entry.status,
    results: entry.results || null,
  });
});

// Check post status
app.get('/api/social/v1/post/:id', (req, res) => {
  const entry = scheduler.getPost(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Post not found' });
  }
  res.json({
    id: entry.id,
    status: entry.status,
    platforms: entry.postData.platforms,
    scheduledAt: new Date(entry.scheduledAt).toISOString(),
    createdAt: new Date(entry.createdAt).toISOString(),
    completedAt: entry.completedAt ? new Date(entry.completedAt).toISOString() : null,
    retryCount: entry.retryCount,
    lastError: entry.lastError,
    results: entry.results || null,
  });
});

// List scheduled posts
app.get('/api/social/v1/schedule', (req, res) => {
  const filter = req.query.filter || 'pending'; // pending | all
  const posts = scheduler.listScheduled(filter);
  res.json({
    count: posts.length,
    posts: posts.map(e => ({
      id: e.id,
      status: e.status,
      platforms: e.postData.platforms,
      scheduledAt: new Date(e.scheduledAt).toISOString(),
      createdAt: new Date(e.createdAt).toISOString(),
      completedAt: e.completedAt ? new Date(e.completedAt).toISOString() : null,
      retryCount: e.retryCount,
      lastError: e.lastError,
    })),
  });
});

// Cancel a scheduled post
app.delete('/api/social/v1/post/:id', (req, res) => {
  const cancelled = scheduler.cancel(req.params.id);
  if (!cancelled) {
    return res.status(404).json({ error: 'Post not found or already published/cancelled' });
  }
  res.json({ message: 'Post cancelled', id: req.params.id });
});

// OAuth link for a platform
app.post('/api/social/v1/accounts/link', (req, res) => {
  const { platform, oauth_token, oauth_verifier, redirect_uri } = req.body;

  if (!platform) {
    return res.status(400).json({ error: 'platform is required' });
  }
  if (!adapters[platform]) {
    return res.status(400).json({
      error: `Unknown platform: ${platform}`,
      available: Object.keys(adapters),
    });
  }

  // Simulate OAuth flow — in production, exchange token with platform
  const stateId = crypto.randomUUID();
  oauthStates.push({
    id: stateId,
    platform,
    createdAt: Date.now(),
    status: 'pending',
    redirect_uri: redirect_uri || null,
  });

  // If token provided, complete the link immediately
  if (oauth_token) {
    const account = {
      id: crypto.randomUUID(),
      platform,
      label: `${adapters[platform].label} Account`,
      platformAccountId: `${platform}_${Date.now()}`,
      linkedAt: new Date().toISOString(),
      status: 'active',
      token: `stub_${oauth_token.slice(0, 8)}`,
      meta: {},
    };
    linkedAccounts.push(account);
    return res.status(201).json({
      message: `Successfully linked ${platform} account`,
      account,
    });
  }

  // Return OAuth URL for the user to authorize
  const oauthUrl = `https://${platform}.com/oauth/authorize?state=${stateId}&redirect_uri=${encodeURIComponent(redirect_uri || 'http://localhost:8112/api/social/v1/accounts/callback')}`;
  res.json({
    message: `OAuth flow initiated for ${platform}`,
    state: stateId,
    oauth_url: oauthUrl,
  });
});

// List connected accounts
app.get('/api/social/v1/accounts', (req, res) => {
  const platform = req.query.platform;
  let accounts = linkedAccounts;
  if (platform) {
    accounts = accounts.filter(a => a.platform === platform);
  }
  res.json({
    count: accounts.length,
    accounts: accounts.map(a => ({
      id: a.id,
      platform: a.platform,
      label: a.label,
      status: a.status,
      linkedAt: a.linkedAt,
    })),
  });
});

// AI content adaptation
app.post('/api/social/v1/content/adapt', async (req, res) => {
  const { content, platforms, media_urls, language } = req.body;

  if (!content && (!media_urls || media_urls.length === 0)) {
    return res.status(400).json({ error: 'content or media_urls required' });
  }
  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: 'platforms must be a non-empty array' });
  }

  const unknown = platforms.filter(p => !adapters[p]);
  if (unknown.length > 0) {
    return res.status(400).json({
      error: `Unknown platforms: ${unknown.join(', ')}`,
      available: Object.keys(adapters),
    });
  }

  const results = {};
  for (const platform of platforms) {
    try {
      const adapted = await contentAdapter.adapt(content, platform, media_urls, language);
      const limits = adapters[platform].getLimits();
      results[platform] = {
        adapted_content: adapted.content,
        adapted_media_urls: adapted.media_urls,
        limits,
        within_limits: adapted.content.length <= limits.maxChars &&
          (adapted.media_urls?.length || 0) <= limits.maxMedia,
      };
    } catch (err) {
      results[platform] = { error: err.message };
    }
  }

  res.json({
    original_content: content,
    original_media_urls: media_urls || [],
    adaptations: results,
  });
});

// OAuth callback handler (for completeness)
app.get('/api/social/v1/accounts/callback', (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.status(400).json({ error: `OAuth error: ${error}` });
  }

  const oauthState = oauthStates.find(s => s.id === state);
  if (!oauthState) {
    return res.status(400).json({ error: 'Invalid OAuth state' });
  }

  // In production, exchange code for access token
  const account = {
    id: crypto.randomUUID(),
    platform: oauthState.platform,
    label: `${adapters[oauthState.platform].label} Account`,
    platformAccountId: `${oauthState.platform}_${Date.now()}`,
    linkedAt: new Date().toISOString(),
    status: 'active',
    token: `stub_${code?.slice(0, 8) || 'unknown'}`,
    meta: { oauthState: state },
  };
  linkedAccounts.push(account);
  oauthState.status = 'completed';

  res.json({
    message: `Successfully linked ${oauthState.platform} account`,
    account: {
      id: account.id,
      platform: account.platform,
      label: account.label,
      status: account.status,
    },
  });
});

// ─── Error handling ───────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[error]', err.stack || err.message || err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// ─── Start ────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Social Media Auto Post Service`);
  console.log(`   Running on :${PORT}`);
  console.log(`   Platforms:  ${Object.keys(adapters).join(', ')}`);
  console.log(`   Adapter A.I.: ${process.env.AI_PROVIDER_URL || 'disabled (using rules)'}`);
  console.log(`   Scheduler interval: ${scheduler.intervalMs / 1000}s\n`);
});

module.exports = app;
