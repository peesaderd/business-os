# 🏢 Business OS — System Blueprint

> **AI-Driven All-in-One Business Platform**  
> Version: 0.1.0 | Date: 2026-06-03  
> Author: OpenClaw R&D (supervised by Pete)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Service Specifications](#3-service-specifications)
4. [API Contracts](#4-api-contracts)
5. [ERP MCP Integration Map](#5-erp-mcp-integration-map)
6. [Data Flow](#6-data-flow)
7. [Deployment Guide](#7-deployment-guide)
8. [Security](#8-security)
9. [Scaling Strategy](#9-scaling-strategy)
10. [Development Roadmap](#10-development-roadmap)

---

## 1. System Overview

### 1.1 Vision
Business OS is a unified, AI-native platform that provides every tool a business needs — website, marketing, sales, operations, customer service — all in one app, driven by AI and connected through a central ERP MCP hub.

### 1.2 Core Principles
- **AI-Native**: Every feature leverages AI (LLM, image gen, video gen)
- **API-First**: All services communicate via REST APIs through a unified gateway
- **Microservice Architecture**: Each business domain = independent service
- **ERP MCP as Backbone**: 60+ MCP tools provide data and operations layer
- **Offline-First**: Critical services (POS, Queue) work without internet
- **Multi-Tenant**: Every service is tenant-scoped via ERP MCP

### 1.3 Feature Matrix

| # | Service | Status | Port | AI Feature | Offline | Multi-Tenant |
|---|---------|--------|------|------------|---------|-------------|
| 1 | AI Chat Support | ✅ Live | 8108 | LLM-powered responses | No | ✅ Via MCP |
| 2 | Image Generation | ✅ Live | 8110 | Fal.ai Flux + Templates | No | ✅ |
| 3 | Video Generation | ✅ Live | 8116 | 6 providers, fallback chain | No | ✅ |
| 4 | Social Auto Post | ✅ Live | 8112 | AI content adaptation | No | ✅ |
| 5 | Queue Management | ✅ Live | 8113 | Wait time AI estimation | ✅ In-memory | ✅ |
| 6 | POS System | ✅ Live | 8114 | Discount validation | ✅ Offline-sync | ✅ |
| 7 | Booking Engine | ✅ Live | 8115 | Smart slot suggestion | ✅ In-memory | ✅ |
| 8 | AI Website Builder | ✅ Live | 8120 | LLM-generated sites | No | ✅ |
| G | API Gateway | ✅ Live | 8088 | JWT auth, rate limiting | N/A | ✅ |

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        🌐 CLIENT LAYER                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Web App  │  │ Mobile   │  │ POS Term │  │ Kiosk    │            │
│  │ (React)  │  │ (PWA)    │  │ (PWA/EL) │  │ (HTML)   │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │             │             │             │                  │
├───────┼─────────────┼─────────────┼─────────────┼──────────────────┤
│       │             │             │             │                  │
│  ┌────▼─────────────▼─────────────▼─────────────▼────┐             │
│  │              🔐 API GATEWAY (port 8088)           │             │
│  │         JWT Auth · Rate Limit · Proxy Routing     │             │
│  └────┬─────────┬─────────┬─────────┬─────────┬──────┘             │
│       │         │         │         │         │                    │
├───────┼─────────┼─────────┼─────────┼─────────┼────────────────────┤
│       │         │         │         │         │                    │
│  ┌────▼──┐ ┌───▼───┐ ┌──▼───┐ ┌──▼───┐ ┌──▼───┐                 │
│  │ AI    │ │ Image │ │Video │ │Social│ │Queue │  ...more           │
│  │ Chat  │ │ Gen   │ │ Gen  │ │Post  │ │      │                   │
│  │ 8108  │ │ 8110  │ │ 8116 │ │8112  │ │8113  │                   │
│  └───┬───┘ └───┬───┘ └──┬───┘ └──┬───┘ └──┬───┘                 │
│      │         │        │        │        │                       │
├──────┼─────────┼────────┼────────┼────────┼───────────────────────┤
│      │         │        │        │        │                       │
│  ┌───▼─────────▼────────▼────────▼────────▼─────────────┐         │
│  │           ☁️ ERP MCP (Central Data Hub)               │         │
│  │   60+ Tools: Inventory · Orders · Customers · HR     │         │
│  │           Finance · Reports · Analytics               │         │
│  └────────────────────────┬──────────────────────────────┘         │
│                           │                                       │
├───────────────────────────┼───────────────────────────────────────┤
│                           │                                       │
│  ┌────────────────────────▼──────────────────────────────┐         │
│  │              🔌 EXTERNAL APIs & PROVIDERS              │         │
│  │                                                        │         │
│  │  OpenAI/DeepSeek   Fal.ai   WaveSpeed   Facebook      │         │
│  │  Stripe/PayPal     Google    LINE        TikTok        │         │
│  └────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Service Communication Pattern

```
Client → API Gateway (port 8088)
           ├── JWT Authentication
           ├── Rate Limiting (100 req/min/IP)
           └── Proxy to service by path prefix
                ├── /api/chat/*    → 8108
                ├── /api/image/*   → 8110
                ├── /api/video/*   → 8105
                ├── /api/social/*  → 8112
                ├── /api/queue/*   → 8113
                ├── /api/pos/*     → 8114
                ├── /api/booking/* → 8115
                └── /api/website/* → 8120

Service → ERP MCP (via REST HTTP to OpenClaw Gateway port 18789)
           └── Each service calls MCP tools as HTTP endpoints
```

### 2.3 Technology Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| **Gateway** | Express + http-proxy-middleware | ✅ |
| **Services** | Node.js + Express | ✅ |
| **AI/LLM** | OpenAI, DeepSeek (via ERP MCP) | ✅ |
| **Image Gen** | Fal.ai (Flux schnell) | ✅ |
| **Video Gen** | WaveSpeed→Minimax→Pika→Runway→Kling | ✅ |
| **Frontend** | React + Vite + Tailwind CSS v4 (planned) | 🔄 |
| **Mobile** | PWA / React Native (planned) | 📋 |
| **Database** | SQLite (dev) → PostgreSQL (prod) | 📋 |
| **Queue** | In-memory / SQLite → Redis/BullMQ | 📋 |
| **Realtime** | WebSocket / SSE (designed) | 📋 |
| **Auth** | JWT + OAuth2 | ✅ |
| **Monitoring** | PM2 (logs/metrics) | ✅ |
| **Deployment** | PM2 + nginx + Docker | ✅ |

---

## 3. Service Specifications

### 3.1 AI Chat Support (port 8108)
```
服务: AI Chat Support
端口: 8108
依赖: ERP MCP ai_chat, Chatwoot (optional)
核心功能:
  - POST /api/chat/v1/message — LLM customer support
  - POST /api/chat/v1/escalate — human agent escalation
  - GET /api/chat/v1/health — health check
架构: Chatwoot Webhook → Chat Bridge → ERP MCP ai_chat → LLM
```

### 3.2 Image Generation (port 8110)
```
服务: Image Generation
端口: 8110
依赖: Fal.ai, ERP MCP (products/categories/campaigns)
核心功能:
  - POST /api/image/v1/generate — text-to-image
  - POST /api/image/v1/edit — inpainting
  - POST /api/image/v1/remove-bg — background removal
  - POST /api/image/v1/upscale — ESRGAN upscale
  - POST /api/image/v1/brand/generate — brand assets
  - POST /api/image/v1/templates/render — template → image
  - POST /api/image/v1/batch — batch generation
模板: 10 built-in (product, social, banner, logo, flyer)
```

### 3.3 Video Generation (port 8116)
```
服务: Video Generation
端口: 8116
依赖: WaveSpeed/Minimax/Pika/Runway/Kling APIs
核心功能:
  - POST /api/video/v1/generate — text-to-video
  - POST /api/video/v1/image-to-video — image+prompt→video
  - GET /api/video/v1/status/:jobId — check progress
  - GET /api/video/v1/providers — list providers + costs
  - POST /api/video/v1/templates/render — script template→video
  - POST /api/video/v1/subtitles — auto-caption
架构: Fallback chain (try A → fail → B → fail → C)
```

### 3.4 Social Auto Post (port 8112)
```
服务: Social Auto Post
端口: 8112
依赖: Platform APIs (FB/IG/TikTok/LINE/LinkedIn/Twitter/YT)
核心功能:
  - POST /api/social/v1/post — schedule post
  - POST /api/social/v1/post/now — immediate publish
  - POST /api/social/v1/content/adapt — AI content adaptation
  - GET /api/social/v1/schedule — view schedule
  - POST /api/social/v1/accounts/link — OAuth connect
平台: Facebook, Instagram, TikTok, LINE, LinkedIn, Twitter/X, YouTube
```

### 3.5 Queue Management (port 8113)
```
服务: Queue Management
端口: 8113
依赖: None (in-memory + JSON persistence)
核心功能:
  - POST /api/queue/v1/join — customer joins
  - GET /api/queue/v1/status/:ticket — check position
  - POST /api/queue/v1/call/:ticket — staff calls
  - POST /api/queue/v1/skip/:ticket — skip
  - POST /api/queue/v1/complete/:ticket — served
  - GET /api/queue/v1/current — staff view
  - GET /api/queue/v1/stats — stats
  - GET /api/queue/v1/analytics — historical
特殊功能: VIP priority, no-show timeout, kiosk UI (/kiosk)
```

### 3.6 POS System (port 8114)
```
服务: POS System
端口: 8114
依赖: ERP MCP (12 tools), Stripe/PromptPay
核心功能:
  - POST /api/pos/v1/sale — multi-item sale
  - POST /api/pos/v1/refund — refund
  - GET /api/pos/v1/products — product search
  - GET /api/pos/v1/product/:barcode — barcode scan
  - POST /api/pos/v1/payment — process payment
  - GET /api/pos/v1/receipt/:saleId — receipt (ESC/POS/HTML/text)
  - POST /api/pos/v1/discount — apply discount
  - POST /api/pos/v1/hold — hold order
  - POST /api/pos/v1/discount — validate coupon
离线: IndexedDB-like queue + reconnect sync
```

### 3.7 Booking Engine (port 8115)
```
服务: Booking Engine
端口: 8115
依赖: ERP MCP (customers, orders, transactions)
核心功能:
  - POST /api/booking/v1/services — manage services
  - POST /api/booking/v1/slots — get available slots
  - POST /api/booking/v1/book — create booking
  - POST /api/booking/v1/cancel/:id — cancel
  - GET /api/booking/v1/bookings — list bookings
  - POST /api/booking/v1/check-availability — check slot
  - POST /api/booking/v1/waitlist — join waitlist
粒度: 15-min slot, business hours, staff breaks
```

### 3.8 AI Website Builder (port 8120)
```
服务: AI Website Builder
端口: 8120
依赖: LLM (via HTTP), ERP MCP (products)
核心功能:
  - POST /api/website/v1/generate — AI prompt → website
  - GET /api/website/v1/sites — list user sites
  - PUT /api/website/v1/sites/:id — update
  - POST /api/website/v1/sites/:id/publish — deploy
  - POST /api/website/v1/export — HTML/React export
模板: Landing page, Portfolio, E-commerce, Service
区块: Hero, Features, Pricing, About, Contact, Footer, Products
```

---

## 4. API Contracts

### 4.1 Gateway API

```
GET /health
  Response: { status, timestamp, uptime, routes }

All other routes:
  Header: Authorization: Bearer <JWT>
  Rate Limit: 100 req/min/IP
```

### 4.2 Common Response Format

```json
// Success
{ "status": "ok", "data": {}, "timestamp": "..." }

// Error
{ "error": "string", "message": "string", "code": 400 }

// Pagination
{ "data": [], "total": 100, "page": 1, "limit": 20 }
```

### 4.3 Full Route Map

| Method | Path | Service | Description |
|--------|------|---------|-------------|
| GET | /api/chat/v1/health | ai-chat | Health check |
| POST | /api/chat/v1/message | ai-chat | Send message |
| POST | /api/chat/v1/escalate | ai-chat | Escalate to human |
| GET | /api/image/v1/health | image-gen | Health check |
| POST | /api/image/v1/generate | image-gen | Generate image |
| POST | /api/image/v1/edit | image-gen | Edit image |
| POST | /api/image/v1/remove-bg | image-gen | Remove background |
| POST | /api/image/v1/upscale | image-gen | Upscale image |
| POST | /api/image/v1/brand/generate | image-gen | Brand asset |
| POST | /api/image/v1/templates/render | image-gen | Template render |
| GET | /api/video/v1/health | video-gen | Health check |
| POST | /api/video/v1/generate | video-gen | Generate video |
| POST | /api/video/v1/image-to-video | video-gen | Img2Video |
| GET | /api/video/v1/status/:jobId | video-gen | Job status |
| GET | /api/video/v1/providers | video-gen | List providers |
| GET | /api/social/v1/health | social-post | Health check |
| POST | /api/social/v1/post | social-post | Create post |
| POST | /api/social/v1/post/now | social-post | Post now |
| POST | /api/social/v1/content/adapt | social-post | Adapt content |
| GET | /api/queue/v1/health | queue | Health check |
| POST | /api/queue/v1/join | queue | Join queue |
| GET | /api/queue/v1/current | queue | Current queue |
| GET | /api/queue/v1/stats | queue | Today's stats |
| GET | /api/queue/v1/analytics | queue | Analytics |
| GET | /kiosk | queue | Kiosk UI (HTML) |
| GET | /api/pos/v1/health | pos | Health check |
| POST | /api/pos/v1/sale | pos | Create sale |
| POST | /api/pos/v1/refund | pos | Refund |
| GET | /api/pos/v1/products | pos | Search products |
| GET | /api/pos/v1/product/:barcode | pos | Barcode scan |
| POST | /api/pos/v1/payment | pos | Payment |
| GET | /api/pos/v1/receipt/:saleId | pos | Get receipt |
| GET | /api/booking/v1/health | booking | Health check |
| POST | /api/booking/v1/slots | booking | Available slots |
| POST | /api/booking/v1/book | booking | Create booking |
| GET | /api/booking/v1/bookings | booking | List bookings |
| GET | /api/website/v1/health | website | Health check |
| POST | /api/website/v1/generate | website | AI generate site |
| GET | /api/website/v1/sites | website | List sites |
| POST | /api/website/v1/export | website | Export site |

*Total: 40+ endpoints across 8 services*

---

## 5. ERP MCP Integration Map

### 5.1 Tools Used per Service

| ERP MCP Tool | Chat | Image | Video | Social | Queue | POS | Booking | Website |
|-------------|:----:|:-----:|:-----:|:------:|:----:|:---:|:-------:|:-------:|
| ai_chat | ✅ | | | | | | | |
| list_kb_collections | ✅ | | | | | | | |
| list_kb_documents | ✅ | | | | | | | |
| create_kb_document | ✅ | | | | | | | |
| get_customer | ✅ | | | | ✅ | ✅ | ✅ | |
| send_notification | ✅ | | | | ✅ | | ✅ | |
| get_product | | ✅ | ✅ | | | ✅ | | ✅ |
| update_product | | ✅ | | | | | | |
| list_categories | | ✅ | | | | | | |
| create_campaign | | ✅ | ✅ | | | | | |
| get_inventory | | | | | | ✅ | | |
| adjust_inventory | | | | | | ✅ | | |
| create_order | | | | | ✅ | ✅ | ✅ | |
| get_tax_rates | | | | | | ✅ | | |
| validate_discount | | | | | | ✅ | | |
| create_transaction | | | | | | ✅ | ✅ | |
| create_ar_invoice | | | | | | ✅ | | |
| record_payment | | | | | | ✅ | | |
| get_chart_of_accounts | | | | | | ✅ | | |
| get_customer_insights | | | | | | | | ✅ |

**Total: 21 ERP MCP tools integrated across 8 services**

### 5.2 Integration Pattern

```
Service → HTTP POST to OpenClaw Gateway (port 18789)
          Body: { tool: "erp-mcp__<tool_name>", args: {...} }
          Auth: Internal API Key (service-to-service)
```

---

## 6. Data Flow

### 6.1 Customer Support Flow
```
Customer → Website Chat Widget
         → Chatwoot Server (Docker)
         → Webhook → AI Chat Bridge (8108)
                    → Get KB Context (ERP MCP)
                    → Call erp-mcp__ai_chat (LLM)
                    → Format Response
                    → Return to Customer
         ← Escalation → erp-mcp__send_notification
                      → Human Agent takes over
```

### 6.2 POS Sale Flow
```
Cashier → Scan Items (barcode)
        → POS Engine (8114)
           → erp-mcp__get_product_by_barcode
           → erp-mcp__get_inventory (check stock)
           → Apply Discount
              → erp-mcp__validate_discount
           → Calculate Tax
              → erp-mcp__get_tax_rates
           → Process Payment (cash/card/promptpay)
           → erp-mcp__create_transaction
           → erp-mcp__adjust_inventory (deduct stock)
           → erp-mcp__create_order (sales order)
           → Generate Receipt (ESC/POS printer)
         ← Complete
```

### 6.3 AI Website Generation Flow
```
User → Prompt: "I need a coffee shop website"
     → Website Builder (8120)
        → Call LLM (via HTTP)
        → Generate Site Structure (JSON sections)
           [Hero, Menu, About, Location, Contact]
        → Generate Content per Section
        → erp-mcp__get_product (fetch menu items)
        → Build Complete Site JSON
        → Store Site
     ← User can edit/regenerate sections
     ← POST /api/website/v1/export → Static HTML
```

### 6.4 Queue + Booking Cross-Flow
```
Customer → Booking (8115) → Appointments scheduled
         OR
Customer → Queue (8113) → Walk-in queue
         
Both → erp-mcp__create_order (service order)
     → erp-mcp__get_customer (identify VIP)
     → erp-mcp__send_notification (reminder/SMS)
     
Integration: Booking → if customer late → Queue
             Queue → if customer books → remove from queue
```

---

## 7. Deployment Guide

### 7.1 Prerequisites
- Node.js 20+
- PM2
- nginx (for production routing)
- Docker (for Chatwoot)

### 7.2 Quick Start
```bash
# 1. Install all services
cd business-os
for dir in gateway services/*/; do
  cd $dir && npm install && cd -
done

# 2. Start all services with PM2
pm2 start gateway/server.js --name bos-gateway
pm2 start services/ai-chat/server.js --name bos-ai-chat
pm2 start services/image-gen/server.js --name bos-image-gen
pm2 start services/video-gen/server.js --name bos-video-gen
pm2 start services/social-post/server.js --name bos-social-post
pm2 start services/queue/server.js --name bos-queue
pm2 start services/pos/server.js --name bos-pos
pm2 start services/booking/server.js --name bos-booking
pm2 start services/website-builder/server.js --name bos-website

# 3. Save PM2 config
pm2 save

# 4. Verify all services
for port in 8088 8108 8110 8116 8112 8113 8114 8115 8120; do
  curl -s http://localhost:$port/api/*/v1/health || echo "Port $port: health N/A"
done
```

### 7.3 PM2 Process Management
```bash
pm2 list              # View all processes
pm2 logs bos-ai-chat  # View logs for a service
pm2 restart bos-pos   # Restart POS
pm2 stop bos-queue    # Stop queue
pm2 start bos-queue   # Start queue
pm2 save              # Persist process list
pm2 resurrect         # Restore after reboot
```

### 7.4 Production Deployment
```bash
# Environment variables per service
services/ai-chat/.env:
  PORT=8108
  ERP_MCP_URL=http://localhost:18789
  DEFAULT_TENANT_ID=default
  JWT_SECRET=change-me

# nginx reverse proxy
location /api/ {
  proxy_pass http://localhost:8088;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

### 7.5 Docker Services (Optional)
```bash
# Chatwoot (AI Chat frontend)
docker-compose -f services/ai-chat/docker-compose-chatwoot.yml up -d
```

---

## 8. Security

### 8.1 Authentication
- **External**: JWT tokens (Bearer auth via Gateway)
- **Internal**: Service-to-service API keys
- **ERP MCP**: Tenant-scoped access tokens

### 8.2 Rate Limiting
- **Gateway**: 100 req/min per IP
- **Image Gen**: 50 req/min (cost control)
- **Video Gen**: 10 req/min (cost control)
- **AI Chat**: 30 req/min per tenant

### 8.3 Data Protection
- No PII stored in services (all in ERP MCP)
- Receipt data: transient, stored per sale
- Queue data: in-memory + JSON file (PII minimal)

### 8.4 API Key Management
- **Fal.ai**: `FAL_KEY` in image-gen/.env
- **Platform APIs**: per-service .env files
- **ERP MCP**: accessed via localhost (internal)

---

## 9. Scaling Strategy

### 9.1 Current State (Dev)
- Single server, all services on one machine
- SQLite / in-memory storage
- PM2 auto-restart on crash

### 9.2 Phase 2 Scaling (Production)
```
- Each service → dedicated server/VPS
- Gateway → load balancer (nginx upstream)
- Storage → PostgreSQL (per service or shared)
- Queue → Redis/BullMQ
- Caching → Redis
- File storage → S3-compatible (MinIO)
```

### 9.3 Phase 3 Scaling (Enterprise)
```
- Kubernetes orchestration
- Horizontal pod autoscaling
- Service mesh (Istio/Linkerd)
- Distributed tracing (OpenTelemetry)
- CDN for media assets
```

---

## 10. Development Roadmap

### ✅ Phase 1: Foundation (Complete — 2026-06-03)
| # | Item | Status |
|---|------|--------|
| 1 | AI Chat Support | ✅ Built + Running |
| 2 | Image Generation | ✅ Built + Running |
| 3 | Video Generation | ✅ Built + Running* |
| 4 | Social Auto Post | ✅ Built + Running |
| 5 | Queue Management | ✅ Built + Running |
| 6 | POS System | ✅ Built + Running |
| 7 | Booking Engine | ✅ Built + Running |
| 8 | AI Website Builder | ✅ Built + Running |
| 9 | API Gateway | ✅ Built + Running |

*\*Video Gen partial build — providers need API key config*

### 🔄 Phase 2: Enhancement (In Progress)
| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Chatwoot Docker deployment | High | 📋 |
| 2 | Video Gen provider key setup | High | 📋 |
| 3 | Frontend Admin Dashboard | High | 📋 |
| 4 | Website Builder Frontend Editor | Medium | 📋 |
| 5 | Offline POS testing | Medium | 📋 |

### 📋 Phase 3: Production
| # | Item | Estimate |
|---|------|----------|
| 1 | PostgreSQL migration | 2 weeks |
| 2 | Redis/BullMQ queue | 1 week |
| 3 | Multi-tenant isolation hardening | 1 week |
| 4 | Monitoring (Prometheus/Grafana) | 1 week |
| 5 | Documentation & Deployment guide | 3 days |

### 🌟 Phase 4: Advanced
| # | Item | Notes |
|---|------|-------|
| 1 | Mobile App (React Native) | Full business on mobile |
| 2 | AI Workflow Automation | Connect services in flows |
| 3 | Marketplace (Plugins) | Third-party service extensions |
| 4 | Multi-language support | All services TH/EN/CN |
| 5 | White-label | Custom branding per tenant |

---

## Appendices

### A. Directory Structure
```
business-os/
├── gateway/                  # API Gateway (port 8088)
│   ├── server.js             # Express server
│   ├── proxy.js              # Route proxy config
│   ├── auth.js               # JWT middleware
│   └── rate-limit.js         # Rate limiter
├── services/
│   ├── ai-chat/              # AI Chat Support (port 8108)
│   │   ├── server.js
│   │   ├── chat-bridge.js
│   │   └── docker-compose-chatwoot.yml
│   ├── image-gen/            # Image Generation (port 8110)
│   │   ├── server.js
│   │   ├── image-engine.js
│   │   ├── template-manager.js
│   │   ├── brand-manager.js
│   │   └── data/templates/
│   ├── video-gen/            # Video Generation (port 8116)
│   │   ├── server.js
│   │   ├── video-engine.js
│   │   └── template-manager.js
│   ├── social-post/          # Social Auto Post (port 8112)
│   │   ├── server.js
│   │   ├── platform-adapters.js
│   │   ├── scheduler.js
│   │   └── content-adapter.js
│   ├── queue/                # Queue Management (port 8113)
│   │   ├── server.js
│   │   ├── queue-engine.js
│   │   └── kiosk-view.html
│   ├── pos/                  # POS System (port 8114)
│   │   ├── server.js
│   │   ├── pos-engine.js
│   │   ├── receipt-generator.js
│   │   └── offline-sync.js
│   ├── booking/              # Booking Engine (port 8115)
│   │   ├── server.js
│   │   └── booking-engine.js
│   └── website-builder/      # AI Website Builder (port 8120)
│       ├── server.js
│       ├── site-generator.js
│       └── site-manager.js
└── tasks/                    # OpenHands task specs
    └── TASK_001_AI_CHAT.md
```

### B. Port Allocation
```
8088  — API Gateway
8105  — TikTok UGC Studio (existing)
8108  — AI Chat Support
8110  — Image Generation
8112  — Social Auto Post
8113  — Queue Management
8114  — POS System
8115  — Booking Engine
8116  — Video Generation
8120  — AI Website Builder
```

### C. Environment Variables Template
```bash
# Per-service .env
PORT=NNNN
ERP_MCP_URL=http://localhost:18789
DEFAULT_TENANT_ID=default
JWT_SECRET=change-in-production

# Service-specific
FAL_KEY=...           # image-gen
TIKTOK_CLIENT_KEY=... # video-gen, social-post
FACEBOOK_APP_ID=...   # social-post
...
```

---

*Business OS — Blueprint v0.1.0*
*"One app. Every business tool. AI-powered. API-first."*
