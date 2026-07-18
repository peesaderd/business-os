

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const { authMiddleware } = require('./auth');
const { apiLimiter } = require('./rate-limit');
const { getProxyMiddleware, proxyConfigs } = require('./proxy');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 8080;

// --- Frontend static files (no auth needed) ---
const dashboardPath = path.join(__dirname, '..', 'frontend', 'dashboard', 'dist');
const editorPath = path.join(__dirname, '..', 'frontend', 'website-editor', 'dist');

// Serve shared assets from both dist folders (hash-based names = no conflicts)
app.use('/assets', express.static(path.join(dashboardPath, 'assets'), { maxAge: '1h' }));
app.use('/assets', express.static(path.join(editorPath, 'assets'), { maxAge: '1h' }));

// Serve frontend HTML entry points
app.use('/dashboard', express.static(dashboardPath, {
  maxAge: 0,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));
app.use('/editor', express.static(editorPath, {
  maxAge: 0,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

// SPA fallback: serve index.html for sub-paths
app.get('/dashboard/*', (req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});
app.get('/editor/*', (req, res) => {
  res.sendFile(path.join(editorPath, 'index.html'));
});

// --- Global middleware ---
app.use(morgan('short'));
app.use(express.json());

// --- Health check (no auth, no rate limit) ---
// Service health check proxy
app.get('/api/gateway/health/:service', async (req, res) => {
  const { service } = req.params;
  const cfg = proxyConfigs.find((c) => c.prefix === `/api/${service}`);
  if (!cfg) {
    return res.status(404).json({ error: 'Unknown service', service });
  }
  try {
    const proxyRes = await fetch(`${cfg.target}/health`, { signal: AbortSignal.timeout(5000) });
    if (!proxyRes.ok) {
      return res.status(proxyRes.status).json({ error: 'Service error', status: proxyRes.status, service });
    }
    const data = await proxyRes.json();
    res.json({ status: 'ok', service, data });
  } catch (err) {
    res.status(502).json({ error: 'Bad Gateway', message: err.message, service });
  }
});

app.get('/api/gateway/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    routes: proxyConfigs.map((c) => `${c.prefix} → ${c.target}`),
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    routes: proxyConfigs.map((c) => `${c.prefix} → ${c.target}`),
  });
});

// --- Rate limiting (applied after health, before auth) ---
app.use(apiLimiter);

// --- JWT authentication (skip /health + frontend only) ---
app.use((req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/dashboard') || req.path.startsWith('/editor')) {
    return next();
  }
  authMiddleware(req, res, next);
});

// --- Proxy routes ---
app.use((req, res, next) => {
  const proxy = getProxyMiddleware(req);
  if (proxy) {
    return proxy(req, res, next);
  }
  next();
});

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `No route configured for ${req.method} ${req.path}`,
  });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Business OS Gateway listening on port ${PORT}`);
  console.log(`Routes:`);
  proxyConfigs.forEach((c) => console.log(`  ${c.prefix}/* → ${c.target}`));
});

module.exports = app;

