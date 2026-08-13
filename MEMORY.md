# MEMORY.md — Long-Term Memory

## 🚨 Critical Rules
1. **ทดสอบบน Live server เท่านั้น** — ห้าม curl localhost, ห้าม localhost:8105
2. **ทดสอบผ่าน Web UI เท่านั้น** — ห้าม CLI, ห้าม curl
3. **Live domain = m2igen.com** — ใช้ URLs บน m2igen.com เสมอ
4. **ก่อนบอกว่า API ไม่รองรับ** — เช็ค code บน server จริงก่อน ไม่ใช่เดา
5. **ถึง curl/localhost จะได้ผลลัพธ์ OK ก็ไม่ตรงกับความจริง** — ต้องลองผ่าน browser เท่านั้น

## OpenCode Go API
- **API key**: `sk-LTP…ngi0` — OpenCode Go provider, ใช้ `opencode run` CLI เท่านั้น
- **ไม่ใช้ OpenRouter API / OpenAI-compatible endpoints** — 401 / 404 ทั้งคู่
- **วิธีใช้**: `opencode run --model opencode-go/deepseek-v4-flash --dangerously-skip-permissions`
- **OpenCode Proxy**: localhost:8777 (OpenAI-compatible wrapper)

## SAM3 Quality Gate
- Location: `modules/product/sam3_quality_gate.py`
- Rule-based image quality checker (OpenCV+PIL, NO Prodia)
- Pre-filters product images before Mistral vision analysis
- Returns composite score 0-100 + `recommended` flag

## Schema Engine
- Location: `services/schema-engine/` — Node.js Express, port 8100
- Dynamic schema CRUD + JSONB validation + ERP field resolution
- **Bug ที่เคยแก้**: `text ~~* uuid` ILIKE crash — `buildWhereClause()` idx เริ่มที่ 2 แทน 1

## Prodia Wan 2.7 Video Gen
- **Job type**: `inference.wan2-7.img2vid.v1` (async เท่านั้น)
- **Parameters**: `prompt`, `duration` (2–15s), `resolution` (`"720P"`/`"1080P"`)
- **ห้ามใช้**: `negative_prompt`, `ratio` (สำหรับ img2vid)
- **Pricing**: Flat $0.03/job
- **ความจริง**: `duration: 15` → ได้ ~10s (model limitation) ต้อง loop ด้วย FFmpeg
- **Pipeline cost**: $0.069 ต่อ video (image + video + TTS/gemini)

## TUS Video Pipeline
- **Prompt cleaning**: ชื่อสินค้าไทยยาว → ลบ Thai chars, special chars, ตัด ~80 chars
- **Video duration loop**: FFmpeg `-stream_loop -1 -t {target}` ถ้า source สั้นกว่า target
- **Static URL**: ใช้ `/api/tiktok/static/...` (FastAPI mount) ไม่ใช่ `/static/video/` (nginx SPA fallback)
- **1 scene only**: ใช้ prompt แรก (Hook) + duration เต็ม

## SuperAppsheet POS Fix
- ERP Core ไม่มี auth endpoints — ใช้ MCP tools โดยตรงกับ `tenantId: "demo"`
- `list_categories` derive จาก products (ERP Core ไม่มี tool นี้)
- AI Service: ใช้ Gemini API (`gemini-2.5-flash`) แทน Deepseek
- **SQLite persistence**: Orders อยู่ใน `data/pos.db` (ไม่ใช่ in-memory dict)
- 🔴 **Google Sheets mock mode** — ต้อง re-login OAuth

## Wizard Flow (POD)
`provider(0) → category(1) → product(2) → variant(3) → print_info(4) → artwork(5) → mockup(6) → content(7) → pricing(8) → summary(9)`

## exec tool (2026-07-19)
- Container ไม่มี shell (`/bin/sh`) — ALL config changes ไม่ช่วย
- Fix: ติดตั้ง bash ใน Dockerfile

## Silent Replies
Nothing to say: entire reply exactly NO_REPLY
Never append to real response or wrap in Markdown/code.
