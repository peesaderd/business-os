

require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { authMiddleware, JWT_SECRET } = require('./auth');
const { apiLimiter } = require('./rate-limit');
const { getProxyMiddleware, proxyConfigs } = require('./proxy');

// --- Simple auth store (JSON file for persistence) ---
const AUTH_DB_PATH = path.join(__dirname, 'auth-users.json');
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(AUTH_DB_PATH, 'utf8')); }
  catch { return []; }
}
function saveUsers(users) {
  fs.writeFileSync(AUTH_DB_PATH, JSON.stringify(users, null, 2));
}

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

// --- Auth routes ---
app.post('/api/gateway/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const users = loadUsers();
    if (users.find((u) => u.email === email)) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: 'user_' + Date.now(),
      email,
      name: name || email.split('@')[0],
      password: hashedPassword,
      role: 'user',
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const { password: _, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/gateway/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const users = loadUsers();
    const user = users.find((u) => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const { password: _, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/gateway/auth/profile', authMiddleware, (req, res) => {
  const users = loadUsers();
  const user = users.find((u) => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

// --- Rate limiting (applied after health + auth, before proxy) ---
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

