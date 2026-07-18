# 📋 Task Board — Master List

> ห้ามลบ task ใดๆ ออกจาก list นี้เด็ดขาด แม้จะทำเสร็จแล้ว  
> แค่เปลี่ยน status จาก `🔄` → `✅`  
> ต้องให้ user บอกว่า "เอาออกได้" ถึงจะลบได้

---

## 🏪 Queue Management

- [ ] 🔄 **Configure LINE credentials** — ใส่ `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_CHANNEL_SECRET` ใน `.env`
- [ ] 🔄 **Configure real phone provider** — เลือก Twilio หรือ VAPI สำหรับ AI voice call
- [ ] 🔄 **Review kiosk-view.html** — เช็ครายละเอียด Kiosk self check-in UI
- [ ] 🔄 **Deploy queue service** — ขึ้น production (PM2 + nginx route)
- [ ] 🔄 **Clean up duplicate** — `services/queue/` (standalone copy เก่า, ตัดทิ้งหรือ merge)

## 💬 Multi-Channel Messaging Platform

- [ ] 🔄 **Commit code** — `messaging-platform/` ยังไม่ได้ commit
- [ ] 🔄 **Push to GitHub** — หลังจาก commit
- [ ] 🔄 **Real user test** — ส่ง LINE ไปที่ @138rbuez แล้วดูว่าตอบกลับไหม
- [ ] 🔄 **Telegram adapter** — ใส่ bot token เมื่อได้
- [ ] 🔄 **WhatsApp adapter** — ใส่ WhatsApp Cloud API credentials
- [ ] 🔄 **LINE @440kwftx Access Token** — User ต้องหา token จาก LINE OA Manager UI ใหม่
- [ ] 🔄 **LINE @440kwftx webhook test** — ทดสอบ webhook บน m2igen.com

## 🎬 UGC Pipeline (TikTok)

- [ ] 🔄 **Restart prompt-builder-service** — หลังจาก commit 15s recipes
- [ ] 🔄 **Remove Fal.ai** — ลบ `fal_client.py` (x2), `VideoProvider.FAL` ใน `video_gen.py` ใช้ Prodia อย่างเดียว
- [ ] 🔄 **Migrate TTS** — จาก Fal.ai MiniMax → Google AI Studio (Gemini key)
- [ ] 🔄 **Update model refs** — `gemini-2.0-flash` → `gemini-2.5-flash`
- [ ] 🔄 **Dedup prompt files** — รวมไฟล์ที่ซ้ำกันระหว่าง service / module / prompt-studio
- [ ] 🔄 **Delete dead prompt files**
- [ ] 🔄 **Merge script gen functions** — ย้าย `service's generate_script` → `modules/video/script_gen.py`

## 📦 Product Analysis + Auto Watch

- [ ] 🔄 **Populate variants column** — อัปเดต scrapers (`tiktok_shop.py`, `shopee.py`, `lazada.py`) ให้เขียน Product Options
- [ ] 🔄 **Get LINE @440kwftx token** — User ต้องกด Issue token ใน LINE OA Manager
- [ ] 🔄 **Test LINE product handlers** — ทดสอบ search / trending / stats / watch ผ่าน LINE

## ⚙️ Schema Engine

- [x] ✅ **Deployed** — PostgreSQL + PM2 + nginx + Gateway เรียบร้อย
- [x] ✅ **Committed + Pushed** — commit `c512f15`
- [x] ✅ **Tested CRUD** — ผ่าน public API ที่ `https://m2igen.com/api/schema/`
- [x] ✅ **Bugfix listRecords** — แก้ missing schema.id param
- [x] ✅ **Module Registry** — registered เป็น module #21
- [x] ✅ **Member + Reward Ledger modules** — #22, #23
- [ ] 🔄 **Keep ssh_helper.py** — เก็บไว้ใช้ SSH access ในอนาคต
- [ ] 🔄 **upload_b64.py** — helper สำหรับ file transfer

## 🧾 SuperAppsheet POS

- [x] ✅ **Fix /assets 502** — nginx ส่ง `/assets` ไป 54531 (dead) → เปลี่ยนเป็น 54532 (live), reload nginx แล้ว ✅
- [ ] 🔄 **Google Sheets re-auth** — OAuth `invalid_grant` ต้อง login browser ใหม่
- [ ] 🔄 **Google Sheets mock mode** — service account สร้าง Drive files ไม่ได้ (no Google Workspace quota)

## 🗂️ General / Housekeeping

- [ ] 🔄 **SSH helper files** — `ssh_debug.py`, `ssh_diag.mjs`, `ssh_helper.py`, `ssh_scan.mjs`, `test_e2e.mjs`, `upload_file.py` — ตัดสินใจว่าจะ commit หรือ archive
- [ ] 🔄 **ERP Core health check** — verify MCP tools working ที่ port 3000
- [ ] 🔄 **Commit 6 un-tracked files** — ถ้าจะเก็บไว้

---

## Legend

| Icon | Meaning |
|------|---------|
| 🔄 | กำลังทำ / รอทำ |
| ✅ | เสร็จแล้ว (รอ user บอกให้เอาออก) |
