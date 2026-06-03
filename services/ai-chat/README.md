# AI Chat Support Service

A Chatwoot ↔ ERP MCP bridge that provides AI-powered customer support using the Business OS ERP system.

## Architecture

```
Customer ←→ Chatwoot Widget ←→ Chatwoot Server (3000)
                                    │
                            POST webhook
                                    │
                                    ▼
                        AI Chat Bridge (8108)
                                    │
                        ┌───────────┼───────────┐
                        ▼           ▼           ▼
                   ERP MCP     ERP MCP     ERP MCP
                  ai_chat     list_kb     get_customer
                                    │
                                    ▼
                                 LLM
```

## Quick Start

### 1. Start Chatwoot (optional — use existing instance)

```bash
# Copy and customize env
cp .env.example .env

# Start Chatwoot + Postgres + Redis
docker compose -f docker-compose-chatwoot.yml up -d

# Wait for migrations (~60s), then visit http://localhost:3000
# Create your account and set up a webhook
```

### 2. Start AI Chat Bridge

```bash
# From the business-os root
npm run dev:ai-chat

# Or directly
cd services/ai-chat
npm start
```

### 3. Configure Chatwoot Webhook

1. In Chatwoot: Settings → Account → Integrations → Webhooks
2. Add webhook URL: `http://your-host:8108/api/chat/v1/chatwoot-webhook`
3. Enable `message_created` events

### 4. Test

```bash
# Health check
curl http://localhost:8108/api/chat/v1/health

# Send a test message
curl -X POST http://localhost:8108/api/chat/v1/message \
  -H "Content-Type: application/json" \
  -d '{"message": "What are your business hours?", "sessionId": "test-1"}'

# Search knowledge base
curl -X POST http://localhost:8108/api/chat/v1/kb/search \
  -H "Content-Type: application/json" \
  -d '{"query": "business hours"}'

# Escalate to human
curl -X POST http://localhost:8108/api/chat/v1/escalate \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-1", "message": "I need to speak to a human"}'
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/chat/v1/health` | Health check |
| POST | `/api/chat/v1/message` | Process customer message → AI response |
| POST | `/api/chat/v1/chatwoot-webhook` | Chatwoot webhook receiver |
| POST | `/api/chat/v1/escalate` | Escalate to human agent |
| GET | `/api/chat/v1/session/:id` | Get session history |
| POST | `/api/chat/v1/kb/search` | Search knowledge base |

## Configuration

See `.env.example` for all config options:

- `PORT` — AI Chat Bridge port (default: 8108)
- `ERP_MCP_URL` — ERP Core HTTP server URL (default: http://localhost:3000)
- `ERP_MCP_MODE` — Connection mode: `http`, `mcp-sse`, or `stdio` (default: http)
- `CHATWOOT_URL` — Chatwoot server URL for posting replies
- `CHATWOOT_API_KEY` — Chatwoot API key for posting messages back
- `DEFAULT_TENANT_ID` — Default ERP tenant ID (default: t_001)

## Integration with ERP MCP Tools

The bridge wraps the following MCP tools:

- **erp-mcp__ai_chat** — Core AI chat with LLM-powered responses
- **erp-mcp__list_kb_collections** — List KB collections for context
- **erp-mcp__list_kb_documents** — Search KB documents
- **erp-mcp__get_customer** — Fetch customer context
- **erp-mcp__send_notification** — Escalation notifications

## Backend Modes

The bridge supports three modes for calling ERP MCP tools:

1. **http** (default) — Calls `erp-core` HTTP `/mcp` endpoint (requires MODE=http or MODE=both in erp-core)
2. **mcp-sse** — Uses OpenClaw Gateway's MCP SSE endpoint
3. **stdio** — Spawns erp-core as child process in stdio mode (fallback)

## Security

- Webhook signature verification via `CHATWOOT_WEBHOOK_SECRET`
- All endpoints return `X-Request-Id` headers for tracing
- Session data auto-expires after 24 hours
- Customer context is not exposed in API responses
