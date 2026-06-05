require('dotenv').config();

module.exports = {
  port: parseInt(process.env.WPILOT_PORT || '8118'),
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6380'),
    password: process.env.REDIS_PASSWORD || 'password',
  },
  db: {
    path: process.env.DB_PATH || './data/wpilot.db',
  },
  gateway: {
    url: process.env.GATEWAY_URL || 'http://127.0.0.1:8088',
    apiKey: process.env.GATEWAY_API_KEY || '',
  },
  moduleApi: {
    url: process.env.MODULE_API_URL || 'http://127.0.0.1:8109',
  },
  workers: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
    pollIntervalMs: parseInt(process.env.WORKER_POLL_MS || '5000'),
  },
  defaultCustomer: {
    siteUrl: process.env.WP_SITE_URL || 'http://89.167.82.205:8086',
    apiKey: process.env.WP_API_KEY || 'wpi_950e74b2908d4c5e89e1a5b3c7f9d0e2',
    adminUser: process.env.WP_ADMIN_USER || 'admin',
    adminPass: process.env.WP_ADMIN_PASS || 'Admin@2026',
  },
};
