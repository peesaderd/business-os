const { createProxyMiddleware } = require('http-proxy-middleware');

const proxyConfigs = [
  { prefix: '/api/chat', target: 'http://localhost:8108' },
  { prefix: '/api/image', target: 'http://localhost:8110' },
  { prefix: '/api/video', target: 'http://localhost:8116' },
  { prefix: '/api/social', target: 'http://localhost:8112' },
  { prefix: '/api/queue', target: 'http://localhost:8113' },
  { prefix: '/api/pos', target: 'http://localhost:8114' },
  { prefix: '/api/booking', target: 'http://localhost:8115' },
  { prefix: '/api/website', target: 'http://localhost:8120' },
  { prefix: '/api/wordpress', target: 'http://localhost:8109' },
  { prefix: '/api/wpilot', target: 'http://localhost:8118' },
  { prefix: '/api/payment', target: 'http://localhost:8122' },
  // Open Design — AI Design Generation Engine
  { prefix: '/api/design', target: 'http://localhost:7456' },
  // Schema Engine — Dynamic schema + data CRUD (PostgreSQL)
  { prefix: '/api/schema', target: 'http://localhost:8100' },
  // LINE Chat — LINE OA AI Chat Service
  { prefix: '/api/line', target: 'http://localhost:8124' },
];

const proxyMiddlewares = proxyConfigs.map((cfg) => ({
  prefix: cfg.prefix,
  target: cfg.target,
  middleware: createProxyMiddleware({
    target: cfg.target,
    changeOrigin: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('X-BOS-Gateway', 'true');
        proxyReq.setHeader('X-Forwarded-For', req.ip || req.connection.remoteAddress || '');
      },
      proxyRes: (proxyRes, req) => {
        // Pass through CORS headers
        proxyRes.headers['access-control-allow-origin'] = '*';
      },
      error: (err, req, res) => {
        console.error(`[gateway] ${req.method} ${req.path} -> ${cfg.target}: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Bad Gateway',
            message: err.message,
            upstream: cfg.target,
            service: cfg.prefix,
          }));
        }
      },
    },
  }),
}));

function getProxyMiddleware(req) {
  const matched = proxyMiddlewares.find((p) => req.path.startsWith(p.prefix));
  if (matched) {
    req.url = req.originalUrl;
    return matched.middleware;
  }
  return null;
}

module.exports = { proxyConfigs, proxyMiddlewares, getProxyMiddleware };
