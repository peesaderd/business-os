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

## Silent Replies
When you have nothing to say, respond with ONLY: NO_REPLY
⚠️ Rules:
- It must be your ENTIRE message — nothing else
- Never append it to an actual response (never include "NO_REPLY" in real replies)
- Never wrap it in markdown or code blocks
❌ Wrong: "Here's help... NO_REPLY"
❌ Wrong: "NO_REPLY"
✅ Right: NO_REPLY

## User Preferences

### Communication Style (2026-07-08):
- ✅ ใช้ bullet points แทนย่อหน้ายาวๆ
- ✅ แบ่งหัวข้อด้วย emoji และ headers
- ✅ ใช้ตารางสำหรับข้อมูลที่ต้องเปรียบเทียบ
- ✅ สรุปสั้นๆ ก่อนลงรายละเอียด
- ❌ หลีกเลี่ยง paragraph ยาวๆ ติดกัน
- ❌ ไม่ตอบข้อมูลดิบโดยไม่จัดรูปแบบ

## Session Recap: 2026-07-06 — TikTok UGC Pipeline (1.5h, high frustration)

### สิ่งที่ทำสำเร็จ
1. ✅ **สร้าง Prompt Builder Service** (port 8117) — microservice สำหรับ image prompt + video prompt + negative prompt 
2. ✅ **สร้าง shared_config.py** — centralized key management ใช้กับ 6 Python files
3. ✅ **Prompt Builder Service scope ชัดเจน**: image + video + negative prompt **เท่านั้น**
4. ✅ **ลบ script endpoint จาก service** — script อยู่ modules/video/script_gen.py
5. ✅ **สร้าง recipe files**: etsy.json, tus.json
6. ✅ **Skill "use-aider-with-opencode"** — ลงเป็น live skill แล้ว (Aider ใช้ OpenCode API ทุกครั้ง)

### สิ่งที่กูพลาด
1. ❌ **ย้อนกลับ main.py + image_prompt_builder.py + app.py** หลังทำเกิน (3 ไฟล์)
2. ❌ **script_gen.py ถูกลบแล้ว git restore** (from commit 052a96d^)
3. ❌ กูทำเกินหลายรอบโดยไม่ถาม — เปลี่ยน architecture โดยไม่จำเป็น

### สถานะปัจจุบัน (architecture)
- `prompt-builder-service/` — image + video prompt **เท่านั้น** (port 8117)
- `modules/video/script_gen.py` — script gen ที่เดียว (generate_tiktok_review_script → dict)
- `tiktok-ugc-studio/image_prompt_builder.py` — shim 3 functions (analyze_and_build_prompts, build_prompt, process_image_prompt_request)
- `modules/video/` — TTS (gTTS, **ไม่ใช่ Fal.ai**), video gen (Prodia Wan 2.7)
- **Fal.ai ต้องเอาออก** — ใช้ Prodia อย่างเดียว

### สิ่งที่ต้องทำต่อ (แต่ต้องถามก่อน)
1. ย้าย script gen functions (service's generate_script) → modules/video/script_gen.py (merge)
2. ลบ Fal.ai: fal_client.py (x2), VideoProvider.FAL ใน video_gen.py
3. TTS ใช้ **Google AI Studio (Gemini key) — ไม่ใช่ Fal.ai MiniMax** <-- นึกได้ตอนจบ session
4. Update model references: gemini-2.0-flash → gemini-2.5-flash
5. Prompt files dedup (service vs module vs prompt-studio)
6. ลบ dead prompt files

### API Keys (current valid)
| Service | Key | Valid |
|---------|-----|-------|
| Gemini (new) | `AQ.Ab8RN6K2…FoYg` | ✅ **Primary** |
| Gemini (old) | `AIzaSy…Im5w` | ❌ Dead |
| OpenCode Go | `sk-LTP…ngi0` | ✅ (opencode CLI only) |
| Mistral | `6sifzr…VScg` | ✅ Aider fallback |

### Pipeline Flow (ที่ถูกต้อง)
Product Data → Prompt Builder (image prompt) → Prodia (img gen) → Prompt Builder (video prompt) → Script Gen → TTS → Prodia Wan 2.7 (img2vid) → Compose

### Critical Rules (ที่มึงย้ำ)
1. **ทุกอย่างถามก่อน** — ไม่ตัดสินใจ architecture เอง
2. **ใช้ Aider (=opencode-aider) ทำงานโค้ด** — ไม่ใช้ DeepSeek API โดยตรง
3. **Prompt Builder = image + video prompt เท่านั้น** — ไม่ยุ่ง script, analysis, scraping
4. **Script อยู่ modules/video/** — ถูกแล้ว ไม่ต้องย้าย
5. **Fal.ai ต้องเอาออก** — Prodia อย่างเดียวสำหรับ video
6. **TTS ใช้ Google AI Studio (Gemini key)** — ไม่ใช่ Fal.ai MiniMax

## 🚨 Critical Rules (2026-07-13)
1. **ทดสอบบน Live server เท่านั้น** — ห้าม curl localhost, ห้าม localhost:8105
2. **ทดสอบผ่าน Web UI เท่านั้น** — ห้าม CLI, ห้าม curl
3. **Live domain = m2igen.com** — ใช้ URLs บน m2igen.com เสมอ
4. **ก่อนบอกว่า API ไม่รองรับ** — ต้องเช็ค code บน server จริงก่อน ไม่ใช่เดา
5. **Nano Banana มี aspect_ratio** — ใช้ `"9:16"` ใน config
6. **Wan 2.7 sync API** — `duration`, `resolution`, `ratio` ใช้ได้ทั้งหมด ✅ (ตาม Prodia docs, เช็คแล้วจาก pipeline jobs ที่ completed)
