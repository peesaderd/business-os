# Messaging Platform

Multi-channel messaging system connected to ERP Core MCP.
Supports LINE, Telegram, WhatsApp — with a single shared business logic core.

## Architecture

```
LINE Webhook ───→ line-adapter (8310) ──┐
Telegram Webhook → tg-adapter  (8320) ──┼──→ msg-core (8300) ──→ ERP Core MCP
WhatsApp Webhook → wa-adapter  (8330) ──┘       │
                                                └──→ SQLite (sessions, orders)
```

## Quick Start

```bash
pip3 install -r requirements.txt

# Start all services via PM2
pm2 start ecosystem.config.cjs

# Or run individually:
python3 -m core.server          # port 8300
python3 -m adapters.line_adapter # port 8310
```

## Environment

Create `.env` or set env vars in PM2 ecosystem:

| Variable | Required | Default |
|----------|----------|---------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE | — |
| `LINE_CHANNEL_SECRET` | LINE | — |
| `ERP_MCP_PATH` | yes | `/home/openhands/erp-core/build/index.js` |

## nginx Routing

```nginx
location /line/pos/ { rewrite ^/line/pos(/.*)$ /line$1 break; proxy_pass http://127.0.0.1:8310; }
location /tg/      { rewrite ^/tg(/.*)$ /tg$1 break;          proxy_pass http://127.0.0.1:8320; }
location /wa/      { rewrite ^/wa(/.*)$ /wa$1 break;          proxy_pass http://127.0.0.1:8330; }
```
