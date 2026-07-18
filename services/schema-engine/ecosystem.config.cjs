module.exports = {
  apps: [
    {
      name: "schema-engine",
      cwd: __dirname,
      script: "server.js",
      interpreter: "node",
      env: {
        PORT: "8100",
        PGHOST: "localhost",
        PGPORT: "5432",
        PGDATABASE: "superapp_schema",
        PGUSER: "superapp",
        PGPASSWORD: "superapp",
        ERP_MCP_URL: "http://localhost:18789",
        DEFAULT_TENANT_ID: "default",
        SEED_TEMPLATES: "true",
        NODE_ENV: "production",
      },
      max_memory_restart: "300M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
