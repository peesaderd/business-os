# Chatwoot Integration with AI Chat Service

Deploys [Chatwoot](https://www.chatwoot.com/) (open-source customer engagement platform) integrated with the ERP AI Chat Service at port 8108.

## Architecture

```
┌──────────────┐    webhook (inbound)      ┌────────────────────┐
│   Chatwoot   │  ──────────────────────►  │  AI Chat Service   │
│   :3000      │  POST /api/chat/v1/       │  :8108             │
│              │      message              │                    │
│   Inbox  ────┤                           │  ┌─ ai_chat (MCP) ─┤
│              │                           │  └─────────────────┘
└──────────────┘                           └────────────────────┘
```

- Chatwoot runs on port **3000**
- MailHog (dev email) on ports **1025** (SMTP) and **8025** (web UI)
- PostgreSQL and Redis run as companion containers
- Inbound messages from Chatwoot are forwarded via webhook to the AI Chat Service

## Prerequisites

- Docker and Docker Compose (v2)
- AI Chat Service already running on port 8108

## 1. Start Chatwoot

```bash
cd ~/.openclaw/workspace/business-os/docker
docker compose -f chatwoot.yml up -d
```

Wait for all services to be healthy (~30-60 seconds):

```bash
docker compose -f chatwoot.yml ps
```

You should see all 5 containers running: `postgres`, `redis`, `web`, `sidekiq`, `mailhog`.

## 2. Create the Admin Account

Run the setup rake task inside the web container:

```bash
docker exec -it chatwoot-web bundle exec rails r "
account = Account.create!(name: 'My Shop')
user = User.create!(email: 'admin@example.com', password: 'Password123!', name: 'Admin')
AccountUser.create!(account: account, user: user, role: 'administrator')
puts 'Account created: ' + account.id.to_s
puts 'Admin user created: admin@example.com / Password123!'
"
```

Or use the interactive setup:

```bash
docker exec -it chatwoot-web bundle exec rails console
```

Then inside the Rails console:

```ruby
account = Account.create!(name: 'My Shop')
user = User.create!(email: 'admin@example.com', password: 'Password123!', name: 'Admin')
AccountUser.create!(account: account, user: user, role: 'administrator')
```

**Note:** The first-run migration and seed may take ~30 seconds. If you see database errors, wait and retry.

## 3. Log In

Open http://localhost:3000 in your browser.

- **Email:** `admin@example.com`
- **Password:** `Password123!`

> If you changed the credentials above, use whatever you set.

## 4. Create an Inbox (Web Widget or API)

### Option A: Website/Web Widget Inbox (for direct front-end integration)

1. Go to **Settings → Inboxes → Add Inbox**
2. Choose **Website**
3. Name it (e.g. "Customer Chat")
4. Add your website domain (e.g. `localhost:3000`)
5. Save — you'll get a widget code snippet

### Option B: API Inbox (for programmatic use)

1. Go to **Settings → Inboxes → Add Inbox**
2. Choose **API**
3. Name it (e.g. "AI Chat Bridge")
4. Save — note the **Inbox ID** and **API Key** shown

## 5. Configure Webhook → AI Chat Service

1. Go to **Settings → Integrations → Webhook**
2. Click **Configure**
3. Set the webhook URL:

   ```
   http://host.docker.internal:8108/api/chat/v1/message
   ```

4. Enable at least: **Message Created**, **Message Updated**
5. Click **Create webhook**

### Why `host.docker.internal`?

`host.docker.internal` resolves to the Docker host from inside containers on Linux (via `extra_hosts` or Docker Compose's built-in DNS) and macOS/Windows natively. The AI Chat Service runs on the host at port 8108, so Chatwoot containers reach it through this special DNS name.

If your Docker version does not support `host.docker.internal` on Linux, add this to your `/etc/hosts`:

```bash
echo "127.0.0.1 host.docker.internal" | sudo tee -a /etc/hosts
```

Then restart Chatwoot:

```bash
docker compose -f chatwoot.yml restart
```

## 6. Verify Integration

### Check that Chatwoot is running

```bash
curl -s http://localhost:3000 | head -20
```

You should get HTML from the Chatwoot dashboard.

### Check that MailHog is running

Visit http://localhost:8025 — you should see the MailHog web UI.

### Test the webhook

Send a test POST directly to the AI Chat Service to verify it's reachable:

```bash
curl -X POST http://host.docker.internal:8108/api/chat/v1/message \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from Chatwoot test","conversation_id":"test-123","inbox_id":1}'
```

### End-to-end flow

1. Open Chatwoot at http://localhost:3000
2. Send a message from a visitor (via the widget) or create a conversation manually
3. The webhook fires → AI Chat Service receives it → `ai_chat` (MCP) processes it
4. The AI response should appear as a reply in the Chatwoot conversation

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Chatwoot doesn't start | DB migration needed | Run `docker exec chatwoot-web bundle exec rails db:seed` |
| Webhook returns 404 | AI Chat Service not running | Ensure port 8108 is up: `curl http://localhost:8108` |
| `host.docker.internal` unreachable | Docker version / Linux | Add to `/etc/hosts` (see step 5) |
| Emails not sending | MailHog not running | Check `docker compose ps` — mailhog should be up |
| Can't log in | Account not seeded | Run the setup command from step 2 |
| 502 Bad Gateway | Chatwoot still booting | Wait 30s and refresh |

## Useful Commands

```bash
# View logs
docker compose -f chatwoot.yml logs -f web

# Restart all services
docker compose -f chatwoot.yml restart

# Stop all services
docker compose -f chatwoot.yml down

# Stop and delete volumes (⚠️ destroys data)
docker compose -f chatwoot.yml down -v

# Scale sidekiq workers
docker compose -f chatwoot.yml up -d --scale sidekiq=3
```
