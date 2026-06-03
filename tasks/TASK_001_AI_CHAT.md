# Task #001: AI Chat Service
## Business OS — Phase 1 Build

### Objective
Build an AI Chat Support service that uses Chatwoot as the frontend + ERP MCP ai_chat as the backend LLM bridge.

### Architecture
```
User → Chatwoot Widget (embedded in client apps) 
     → Chatwoot Server (Docker) 
     → Business OS Chat Bridge (new service, port 8108)
     → ERP MCP ai_chat (existing tool)
     → OpenAI/DeepSeek LLM
```

### Requirements

#### 1. Chat Bridge Service (port 8108)
Node.js/Express service with:
- `POST /api/chat/v1/message` — receive message from Chatwoot webhook, call ERP MCP ai_chat, return response
- `GET /api/chat/v1/health` — health check
- `POST /api/chat/v1/escalate` — escalate to human agent
- Integrate with existing Notification system (erp-mcp__send_notification)

#### 2. Chatwoot Docker Setup
Create `docker-compose.yml` for Chatwoot with PostgreSQL + Redis
- Chatwoot API + Dashboard
- Webhook configured to send to Chat Bridge

#### 3. ERP MCP Integration
- Use `erp-mcp__ai_chat` tool for AI responses (tenantId, sessionId, message, customerId, language)
- Use `erp-mcp__list_kb_collections` + `erp-mcp__list_kb_documents` for knowledge base
- Use `erp-mcp__create_kb_document` to save new KB entries from chat
- Use `erp-mcp__get_customer` to pull customer context

#### 4. Multi-Channel Support (Design Only)
- Line OA webhook adapter
- Facebook Messenger webhook adapter  
- Website embed widget

### Existing Infrastructure
- ERP MCP at `/home/openhands/erp-core/erp-core/packages/server/dist/mcp/server.js`
- OpenClaw Gateway at port 18789
- PM2 ecosystem for process management
- nginx reverse proxy (via existing config)

### Files to Create
```
services/ai-chat/
├── package.json
├── server.js          — Main Express server (port 8108)
├── chat-bridge.js     — Chatwoot ↔ ERP MCP bridge logic
├── chatwoot.yml       — Docker Compose for Chatwoot
├── .env.example
└── README.md
```

### Acceptance Criteria
- [ ] Chat Bridge health check returns 200
- [ ] Message sent to Chatwoot → received by Bridge → LLM response returned
- [ ] KB context injected into LLM prompt
- [ ] Escalation flow sends notification
- [ ] PM2 process starting/stopping works

### Implementation Notes
- Use existing `/api/chat/v1/message` pattern from Prompt Studio
- Follow same Express structure as etsy-wizard (port 8104)
- Don't modify existing services
- Use async/await, proper error handling
- Add logging with the project's logger pattern
