## OpenHands Task Batch: Business OS Phase 2 (Items 2-5)

You have already built the API Gateway for us (thank you!). Now please complete the following tasks. Create ALL files under /openhands/code/business-os/ in your workspace (I will copy them to the host).

---

### TASK A: Chatwoot Docker Deployment
Create /openhands/code/business-os/docker/chatwoot.yml:
- Deploy Chatwoot (chatwoot/chatwoot:latest) with PostgreSQL and Redis
- Port: 3000 (Chatwoot dashboard)
- Configure webhook to POST to http://host.docker.internal:8108/api/chat/v1/message
- Include env vars for SMTP (use MailHog for dev)
- Include a README explaining how to set up the inbox and webhook

The AI Chat Bridge already exists at port 8108 with:
- POST /api/chat/v1/message - receives webhooks, calls ERP MCP ai_chat
- POST /api/chat/v1/escalate - notifies human agent

---

### TASK B: Video Gen Provider Fix
The video-gen service at /openhands/code/business-os/services/video-gen/ exists but shows "providers: 0" in health check.

Read the current code and fix:
1. The video-engine.js should properly initialize providers on startup
2. The health endpoint should show actual provider count
3. Add fallback chain logic (WaveSpeed, Minimax, Pika, Runway, Kling)
4. Make sure all routes work
5. After fixing, run with: cd /path && node server.js (test at :8116)

---

### TASK C: Frontend Admin Dashboard
Create a modern admin dashboard at /openhands/code/business-os/frontend/dashboard/

Tech stack: React 18 + Vite + Tailwind CSS v4 + Inter font

Requirements:
1. Dashboard layout with sidebar navigation (8 services)
2. Each service shows: name, port, status (online/offline), description
3. Quick health check via Gateway at http://localhost:8088
4. Stats overview (total services online, total endpoints)
5. Service cards with colored status indicators (green=online, red=offline)
6. Responsive: mobile sidebar collapses to hamburger

Pages:
- / -> Dashboard overview with all service status cards
- /chat -> Chat service info
- /image -> Image gen info
- /video -> Video gen info
- /social -> Social post info
- /queue -> Queue info (embed kiosk iframe)
- /pos -> POS info
- /booking -> Booking info
- /website -> Website builder info

Include package.json with all deps. Use: npm create vite@latest dashboard -- --template react

---

### TASK D: AI Website Builder Frontend Component
Create a simple section editor at /openhands/code/business-os/frontend/website-editor/

Tech stack: React 18 + Vite + Tailwind CSS v4

Features:
1. Section palette (Hero, Features, Pricing, About, Contact, Footer, Products)
2. Click section to add to canvas
3. Each section shows editable fields (title, description, images)
4. Preview mode
5. Export button -> calls POST /api/website/v1/export
6. Generate button -> calls POST /api/website/v1/generate with prompt

---

IMPORTANT:
- Write ALL code complete, no stubs
- npm install should work without errors
- Create files in your workspace at /openhands/code/business-os/
- I will copy them to the host filesystem
- Return "DONE" and a summary when all tasks are complete
