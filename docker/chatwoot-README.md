# Chatwoot Deployment for Business OS

This Docker Compose setup deploys Chatwoot (customer support chat platform) with:
- **PostgreSQL 15** — database
- **Redis 7** — background jobs / cache
- **MailHog** — dev SMTP server (UI at http://localhost:8025)
- **Chatwoot latest** — main app at http://localhost:3000

## Quick Start

```bash
cd docker
docker compose -f chatwoot.yml up -d
```

Wait ~60 seconds for database migrations to complete, then visit:
- **Chatwoot Dashboard:** http://localhost:3000
- **MailHog UI:** http://localhost:8025

## First-Time Setup

1. Open http://localhost:3000
2. Create a super admin account (first signup becomes admin)
3. Go to **Settings → Inboxes → Add Inbox**
4. Choose **Website** or **API** as the channel type
5. Name your inbox (e.g., "AI Chat Support")

## Configure Webhook to AI Chat Bridge

1. In your inbox, go to **Settings → Inboxes → [your inbox] → Configuration**
2. Scroll to **Webhook URL**
3. Enter: `http://host.docker.internal:8108/api/chat/v1/message`
4. Save

The AI Chat Bridge (port 8108) will:
- `POST /api/chat/v1/message` — receive incoming chat messages, call ERP MCP ai_chat
- `POST /api/chat/v1/escalate` — notify human agent for escalation

## SMTP Configuration (Production)

For production, replace MailHog with a real SMTP provider:

```yaml
SMTP_ADDRESS: smtp.sendgrid.net
SMTP_PORT: 587
SMTP_DOMAIN: yourdomain.com
SMTP_USERNAME: apikey
SMTP_PASSWORD: SG.xxxxx
SMTP_AUTHENTICATION: login
SMTP_ENABLE_STARTTLS_AUTO: true
```

## Volumes

- `postgres_data` — database persistence
- `redis_data` — cache persistence
- `chatwoot_storage` — uploaded files / attachments

## Backup

```bash
docker compose -f chatwoot.yml exec postgres pg_dump -U chatwoot chatwoot > backup_$(date +%Y%m%d).sql
```
