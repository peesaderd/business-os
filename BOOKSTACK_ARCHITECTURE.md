# BookStack Integration Architecture
## Central Knowledge Base for All Systems

> Last updated: 2026-07-22

---

## 1. Current System Landscape

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                          │
│  tus-frontend │ super-appsheet-frontend │ etsy-wizard       │
│  tiktok-ugc-studio │ ai-agent-company   │ pod-wizard        │
└──────────┬──────────────────────────────────────────────────┘
           │ HTTP/API
┌──────────▼──────────────────────────────────────────────────┐
│                     API / MODULE LAYER                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ ERP      │  │ ERP      │  │Schema    │  │Product   │    │
│  │ Modular  │  │ Core     │  │Engine    │  │Scraper   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │Image/    │  │Prompt    │  │ Passport │  │Scheduler │    │
│  │Video Gen │  │Builder   │  │ Module   │  │          │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└──────────┬──────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│                  INTEGRATION / MCP LAYER                    │
│  erp-mcp │ erp-modular │ etsy-mcp │ pos-mcp │ line-mcp     │
│  etsy-dev (external)   │ v0 (external) │ canva-dev (ext.)  │
└──────────┬──────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES                          │
│  AitoEarn (Docker 7 containers)                             │
│  BookStack (port 54515) ◄── NEW: CENTRAL MEMORY LAYER      │
│  SiYuan (port 6806)                                         │
│  Plane (project mgmt - 9 containers)                        │
│  OpenObserve (port 54514)                                   │
│  n8n-server (host)                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. BookStack Structure Proposal

### Books & Hierarchy

```
📚 ERP System
  ├── 📁 Modules Documentation
  │   ├── Accounting Setup & Usage
  │   ├── CRM Configuration
  │   ├── POS Operations
  │   └── Inventory Management
  ├── 📁 API Reference
  │   ├── ERP Modular API
  │   ├── ERP Core API
  │   └── Schema Engine API
  └── 📁 Deployment & Infra
      ├── PM2 Process Map
      ├── Docker Services
      └── Port Allocation

📚 Product & Content
  ├── 📁 Product Catalog
  │   ├── Product Schemas & Templates
  │   ├── POD Products (Printful)
  │   └── Etsy Listings
  ├── 📁 AI Content Pipeline
  │   ├── Prompt Templates
  │   ├── Video Generation Recipes
  │   └── Script Templates
  └── 📁 Pricing & Margins
      ├── Cost Calculations
      ├── Pricing Strategies
      └── Profit Analysis

📚 AI Agent Memory
  ├── 📁 Session Logs (auto-generated)
  │   ├── 2026-07-22: Workboard completion
  │   └── ...
  ├── 📁 Decisions & Rationale
  │   ├── Architecture Decisions
  │   └── Why-things-are-done-this-way
  └── 📁 System Knowledge
      ├── Agent Behavior Rules
      ├── Workflow Documentation
      └── Integration Patterns

📚 Business Operations
  ├── 📁 Customers & Clients
  ├── 📁 Sales & Marketing
  ├── 📁 Financial Records
  └── 📁 Reports & Analytics
```

---

## 3. How Each System Benefits from BookStack

### 3.1 OpenClaw Agents (Main Session)

| Feature | How BookStack Helps |
|---|---|
| **Session continuity** | Auto-write daily session summaries → read previous context |
| **Decision logging** | Record "why" behind changes (no more guessing) |
| **System knowledge** | Store port mappings, API keys location, deployment notes |
| **Cross-session memory** | MEMORY.md + BookStack = short + long term |

### 3.2 ERP Modular (Module System)

| Feature | How BookStack Helps |
|---|---|
| **Module docs auto-sync** | สร้าง page อัตโนมัติเมื่อ register module ใหม่ |
| **Schema documentation** | Schema Engine can auto-document each schema to BookStack |
| **Transaction logs** | สรุปยอดรายวัน/สัปดาห์ ลง BookStack เป็น report |
| **Error knowledge base** | Save error patterns + solutions for self-healing |

### 3.3 TikTok UGC Studio (Content Pipeline)

| Feature | How BookStack Helps |
|---|---|
| **Recipe library** | Store successful video recipes (prompts, images, durations) |
| **A/B test results** | Log which script variants performed best |
| **Brand guidelines** | Voice, tone, style guides |
| **Generation history** | Auto-log every generated script+image+video combo |

### 3.4 Etsy Connector

| Feature | How BookStack Helps |
|---|---|
| **Listing library** | Store successful listing templates + descriptions |
| **SEO keyword bank** | Collect keywords + tag strategies |
| **Performance analytics** | Log views, favorites, sales trends |
| **Compliance docs** | GPSR, return policy, trademark records (for EU compliance) |

### 3.5 Ai-Agent-Company (Business OS)

| Feature | How BookStack Helps |
|---|---|
| **Business memory** | Store client profiles, meeting notes, project status |
| **Report generation** | Auto-write business analysis reports |
| **Knowledge retrieval** | Read past analyses before making new decisions |
| **Multi-agent context** | Shared context across agent instances |

### 3.6 Product Scraper & POD Wizard

| Feature | How BookStack Helps |
|---|---|
| **Product catalog** | Store scraped product data with images |
| **Printful templates** | Mockup templates + placement configs |
| **Supplier database** | Keep track of print providers and pricing |

### 3.7 Scheduler & Automation

| Feature | How BookStack Helps |
|---|---|
| **Task audit trail** | Log scheduled task results |
| **Cron job docs** | Document what each scheduled job does |
| **Health check logs** | Weekly system health summaries |

---

## 4. Shared BookStack API Layer

### Current Tooling (ready to use)

มี `bookstack_client.py` อยู่แล้วใน:
- `/home/openhands/erp-stack/bookstack_client.py`
- `/home/openhands/brain-server/bookstack_client.py` (Brain Server โดนลบไปแล้ว)

ต้องสร้าง **unified client** ที่ทุก module ใช้ร่วมกัน:

**Proposed: `services/bookstack-client/`**
- REST API wrapper (create/read/update/delete pages, books, shelves)
- Authentication manager (auto-refresh token)
- Markdown ↔ HTML converter
- Search interface
- Auto-tagging system

### API Endpoints Needed

```python
# Read
GET  /bookstack/page/{id}          # Get page content
GET  /bookstack/search?q={query}   # Full-text search
GET  /bookstack/book/{slug}        # Get book structure

# Write  
POST /bookstack/page               # Create new page
PUT  /bookstack/page/{id}          # Update existing page
POST /bookstack/book               # Create new book

# System
GET  /bookstack/health             # Connection status
GET  /bookstack/token/status       # API token validity
```

---

## 5. Features to Build (Priority Order)

### Phase 1: Foundation (สัปดาห์นี้)
| # | Feature | System | Effort |
|---|---------|--------|--------|
| 1 | ✅ หา/สร้าง API token สำหรับ BookStack | — | เล็ก |
| 2 | ✅ unified BookStack client service (port 8130) | ใหม่ | กลาง |
| 3 | Auto-log session summaries → BookStack | OpenClaw Agent | เล็ก |
| 4 | Module auto-documentation on register | ERP Modular | เล็ก |

### Phase 2: Integration (สัปดาห์หน้า)
| # | Feature | System | Effort |
|---|---------|--------|--------|
| 5 | Schema Engine → auto document schemas | Schema Engine | กลาง |
| 6 | TikTok UGC recipe library | TikTok UGC Studio | กลาง |
| 7 | AI Agent Company → read/write business memory | ai-agent-company | เล็ก |
| 8 | Etsy listing templates → BookStack | Etsy MCP | กลาง |

### Phase 3: Intelligence (เดือนหน้า)
| # | Feature | System | Effort |
|---|---------|--------|--------|
| 9 | Cross-reference engine (links between systems) | BookStack + Schema Engine | ใหญ่ |
| 10 | Auto health reports (weekly system status) | Scheduler + BookStack | กลาง |
| 11 | Decision tree / why-log per change | OpenClaw Agent | กลาง |
| 12 | Multi-agent shared context (read before act) | All agents | ใหญ่ |

---

## 6. How We Use It Together — Diagram

```
                    ┌─────────────────────┐
                    │   OpenClaw Agent    │
                    │   (Main Session)    │
                    └──────────┬──────────┘
                               │ reads/writes session summaries
                               │ reads past context before tasks
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    BOOKSTACK                                 │
│                    (Central Memory)                          │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │Agent     │  │System    │  │Business  │  │Content   │    │
│  │Memory    │  │Knowledge │  │Records   │  │Library   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
           ▲            ▲            ▲            ▲
           │            │            │            │
     ┌─────┴──┐   ┌────┴───┐   ┌───┴────┐  ┌───┴────┐
     │ERP     │   │Schema  │   │ai-agent│  │TikTok  │
     │Modular │   │Engine  │   │-company│  │UGC     │
     └────────┘   └────────┘   └────────┘  └────────┘
```

### Key Principle

> **ทุก system อ่านได้ เขียนได้ เข้าใจ context เดียวกัน**
> ไม่มี system ไหนมี memory ของตัวเอง—ทุกอย่างไปที่ BookStack

---

## 7. Next Steps

1. ✅ **ค้นหา/สร้าง API token** สำหรับ BookStack ก่อน
2. ✅ **เขียน unified client service**
3. ✅ **เชื่อม OpenClaw Agent** ให้เขียน session summary ทุกครั้ง
4. ✅ **เชื่อม ai-agent-company**
5. ✅ **เชื่อม ERP Modular**

พร้อมเริ่มไหมครับ?
