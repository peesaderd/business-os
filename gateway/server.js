

const express = require('express');
const morgan = require('morgan');
const { authMiddleware } = require('./auth');
const { apiLimiter } = require('./rate-limit');
const { getProxyMiddleware, proxyConfigs } = require('./proxy');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 8080;

// --- Global middleware ---
app.use(morgan('short'));
app.use(express.json());

// --- Health check (no auth, no rate limit) ---
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

// --- JWT authentication (skip /health only) ---
app.use((req, res, next) => {
  if (req.path === '/health') return next();
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

