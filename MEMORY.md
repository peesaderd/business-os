# MEMORY.md — Long-Term Memory

## OpenCode Go API (2026-06-18)
- **API key format**: `sk-LTP…ngi0` — stored in opencode config under `opencode-go` provider, also in auth.json as "openrouter"
- **Does NOT work with OpenRouter API**: Always 401 at `openrouter.ai/api/v1/chat/completions`
- **Does NOT expose OpenAI-compatible endpoints**: `api.opencode.ai/v1/chat/completions` returns 200 "Not Found"
- **Working method**: Use `opencode run` CLI with `--model opencode-go/deepseek-v4-flash` and `--dangerously-skip-permissions`
- **`opencode serve`** : Serves web UI HTML only (no OpenAI API)
- **`opencode acp`** : Agent Client Protocol server (not compatible with Aider directly)
- **Do NOT fight LiteLLM or direct API calls** with this key — use opencode CLI instead
- **OpenCode Proxy** (localhost:8777) — OpenAI-compatible proxy wrapping `opencode run`

## SAM3 Quality Gate (2026-06-18)
- Location: `/home/openhands/erp-stack/modules/product/sam3_quality_gate.py`
- Rule-based image quality checker (OpenCV+PIL, NO Prodia)
- Pre-filters scraped product images before Mistral vision analysis
- Integrated into `analyze_pipeline.py::_analyze_and_select_images()`
- Returns composite score 0-100 + `recommended` flag

## SuperAppsheet POS Fix (2026-07-14)
### What was fixed
1. **✅ ERP Client (`erp_client.py`)** — Removed auth/login flow that 404'd on `/api/auth/login` (ERP Core has no auth endpoints). Now calls MCP tools directly with `tenantId: "demo"`.
2. **✅ `list_categories` derived from products** — ERP Core MCP has no `list_categories` tool, so now derives from `list_products()` response.
3. **✅ AI Service (`ai_service.py`)** — Switched from Deepseek API (`sk-762b2...`) to Gemini API (`GEMINI_API_KEY` from .env, model `gemini-2.5-flash`) using google.genai SDK.
4. **✅ SQLite persistence (`pos_engine.py`)** — Orders stored in `data/pos.db` instead of in-memory dict. Survives API restarts. 25 existing orders migrated from JSON to SQLite.
5. **✅ Cleared `__pycache__`** on restart to pick up new code.

### Remaining issues
- 🔴 **Google Sheets mock mode** — Service account `super-appsheet@peteai-494609` can't create Drive files (no Google Workspace quota). OAuth token expired (`invalid_grant`). Needs browser OAuth re-login.
- 🟡 **ERP Core MCP missing `list_categories` tool** — Workaround: derive from products. Long-term: add the tool to ERP Core.

## exec tool root cause (2026-07-19)
- **spawn /bin/sh ENOENT** — container ไม่มี shell (`/bin/sh`, `/bin/bash`)
- OpenClaw exec tool spawns commands via `child_process.exec()` which needs `/bin/sh`
- ALL config changes (`tools.profile: "full"`, etc.) are irrelevant — shell doesn't exist
- Config with valid schema keys: `profile: "full"`, `elevated.enabled: true`, exec with `backgroundMs/timeoutSec/cleanupMs`
- Fix: install bash/sh in container Dockerfile or `apt-get install -y bash`

## 🚨 Critical Rules (2026-07-20)
1. **ทดสอบบน Web UI เท่านั้น** — ห้าม curl, ห้าม localhost, ต้องใช้หน้า Web UI จริงๆที่ m2igen.com เสมอ
2. **ถึง curl/localhost จะได้ผลลัพธ์ OK ก็ไม่ตรงกับความจริง** — ต้องลองผ่าน browser เท่านั้น

## 🚨 Critical Rules (2026-07-13)
1. **ทดสอบบน Live server เท่านั้น** — ห้าม curl localhost, ห้าม localhost:8105
2. **ทดสอบผ่าน Web UI เท่านั้น** — ห้าม CLI, ห้าม curl
3. **Live domain = m2igen.com** — ใช้ URLs บน m2igen.com เสมอ
4. **ก่อนบอกว่า API ไม่รองรับ** — ต้องเช็ค code บน server จริงก่อน ไม่ใช่เดา
5. **Nano Banana มี aspect_ratio** — ใช้ `"9:16"` ใน config
6. **Wan 2.7 sync API** — ใช้ `img2vid.v1` (async) กับ `duration`, `resolution` ใน config เช่นเดิม

## Wizard Flow Fix (2026-07-13)
### สิ่งที่แก้
1. ✅ **เพิ่ม step `print_info` ใน frontend** — ระหว่าง variant กับ artwork
2. ✅ **`handle_step_print_info` รับ `**kwargs`** — ไม่ crash เมื่อโดนส่ง extra data
3. ✅ **`handle_step_variant` next_step → `print_info`** (จากเดิม `artwork`) — flow ถูกต้อง
4. ✅ **เพิ่ม endpoint `GET /pod/print-info/{product_id}`** — standalone endpoint ดึง Printful template data (placements, print_area dimensions, recommended_size)
5. ✅ **ลบ `get_mockup_prompt()` dead code** — ใช้ Printful Mockup API แทน AI prompt mockup
6. ✅ **เพิ่ม `get_printful_api` import** ใน `pod_wizard.py` — แก้ NameError
7. ✅ **Frontend STEPS = 11 steps** — เพิ่ม print_info meta + HTML render + data collection

### Wizard Flow ที่ถูกต้อง
`provider(0) → category(1) → product(2) → variant(3) → print_info(4) → artwork(5) → mockup(6) → content(7) → pricing(8) → summary(9)`

## Schema Engine (2026-07-18)
### What was built
- **Location**: `services/schema-engine/` — Node.js Express, port 8100
- **6 files**, 1980 lines total

### Core Components
| File | Lines | Purpose |
|------|-------|---------|
| `server.js` | 522 | Express server + all API routes + startup |
| `schema-manager.js` | 204 | Schema CRUD (create/list/get/update/delete/toggle) |
| `data-manager.js` | 422 | Dynamic data CRUD + JSONB validation + ERP field resolution + query builder |
| `template-registry.js` | 585 | 5 pre-built templates (member, queue_ticket, booking_slot, pos_order, reward_ledger) |
| `db.js` | 136 | PostgreSQL pool + auto-migration (creates schemas + records tables + GIN index) |
| `erp-client.js` | 111 | ERP Core MCP client (read members, rewards, products) |

### 🔥 Bug Fix: `text ~~* uuid` ILIKE crash
- **Root cause**: `buildWhereClause()` in `data-manager.js` started parameter `idx` at 1, but `listRecords()` always uses `$1` for `schema_id`. PostgreSQL inferred `$1` as UUID type (from `schema_id = $1` column), so `data->>'field' ILIKE $1` failed because ILIKE only accepts text/text operands.
- **Fix**: Changed `let idx = 1` → `let idx = 2` to reserve `$1` for `schema_id`.
- **Symptoms**: `?search=` on any schema crashed with 500 `operator does not exist: text ~~* uuid`.

## Prodia Wan 2.7 Video Gen (2026-07-18) 🔥
### API Endpoint
- **job_type**: `inference.wan2-7.img2vid.v1` (async API only — `txt2img.v1` is sync-only and 404s)
- **Parameters** (in config dict):
  - `prompt` (required)
  - `duration` — 2–15s (default 5), actual output ~10.3s for `duration: 15`
  - `resolution` — `"720P"` (default) or `"1080P"`
  - **DO NOT** use `negative_prompt` — Prodia rejects it in config
  - **DO NOT** use `ratio` for img2vid (txt2vid only)
  - Prodia auto-adds: `seed`, `prompt_extend: true`, `negative_prompt: ""`
- **Pricing**: Flat $0.03 per job (regardless of duration 2-15s)

### Pipeline Integration
- `pipeline_affiliate.py::generate_video()` calls `client.generate_video(job_type, prompt, input_image, duration, resolution, negative_prompt)`
- `prodia_client.py::generate_video()` puts `duration` + `resolution` in config dict
- **Pipeline cost**: $0.069 total ($0.03 image + $0.03 video + $0.009 TTS/gemini)
- **Pipeline time**: ~130-157s for full 6-scene TUS recipe

### Actual Video Duration vs Requested
| Requested | Actual Produced | File Size |
|-----------|----------------|-----------|
| 8s | 7.979s | 4.9 MB |
| 15s | 10.368s | 6.5 MB (final compose) |

### Key Lesson
- Prodia Wan 2.7 accepts `duration: 15` in config but model generates ~10s
- `duration: 16` triggers JSON Schema rejection ("additional properties not allowed")
- `duration: 8` produces 7.979s (acceptable)
- **Multi-scene video**: pipeline currently hardcoded to 1 scene only (Step 8 comment: `# 1 scene only — ใช้ prompt แรก (Hook) + duration เต็ม`)

## POS /assets 502 Fix (2026-07-18)
- **Problem**: nginx ส่ง `/assets` ไป port 54531 (ซึ่งไม่ทำงานแล้ว) → 502
- **Fix**: เปลี่ยน `/assets` proxy_pass จาก `127.0.0.1:54531` เป็น `127.0.0.1:54532`

## Silent Replies
Nothing to say: entire reply exactly NO_REPLY
Never append to real response or wrap in Markdown/code.
