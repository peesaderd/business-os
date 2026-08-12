# GPS Queue System - Development Roadmap
**วันที่:** 2026-08-10
**สถานะ:** Backend พร้อม 100% | Integration ยังขาด

---

## ระบบปัจจุบัน

### Architecture
```
Customer (LINE/GPS/Voice)
    ↓
GPS Queue Service (8112) ←── Schema Engine (8100, PostgreSQL)
    ↑                        ↑
Voice Gateway (8113)      queue_ticket schema
    ↓                        location_log schema
Intent Detection
```

### ข้อมูลจริง
- **Queue tickets ปัจจุบัน:** 5 รายการ (เก่า 18-19 วัน)
- **Location logs:** 1 รายการ
- **Source types ที่รองรับ:** kiosk, staff, line, web, phone, line_preorder, gps, voice
- **GPS coordinates ร้าน:** 13.7563, 100.5018 (Bangkok)
- **Geofence:** arrived <1km, nearby <2km, approaching <3km

---

## Phase 1: Backend Fixes (ทำก่อน)
**เป้าหมาย:** ให้ GPS Queue สมบูรณ์ 100%

### 1.1 Implement `/gps/customer/:name`
- [ ] เพิ่ม GET handler ใน service.py
- [ ] Query location_log by customer_name
- [ ] Return GPS history + geofence status

### 1.2 Auto-cleanup Old Tickets
- [ ] เพิ่ม cron/cleanup function
- [ ] ลบ tickets ที่เก่า >7 วัน (status = waiting)
- [ ] Archive tickets ที่ completed แล้ว

### 1.3 API Consistency
- [ ] `/queue/call` ให้รับ ticket_number ได้ด้วย (ไม่ใช่แค่ UUID)
- [ ] `/queue/complete` ให้รับ ticket_number ได้ด้วย
- [ ] เพิ่ม error messages ที่ชัดเจนขึ้น

---

## Phase 2: LINE Bot Integration
**เป้าหมาย:** ลูกค้าสั่ง/เช็คอินผ่าน LINE ได้

### 2.1 Fix LINE Bot
- [ ] แก้ crash loop (133k restarts)
- [ ] ตรวจสอบ webhook URL configuration
- [ ] ทดสอบ receive message + reply

### 2.2 LINE → GPS Queue
- [ ] เชื่อม LINE message → GPS Queue check-in
- [ ] เชื่อม LINE flex message → queue status display
- [ ] ส่ง notification เมื่อถูกเรียก (queue/call)
- [ ] ส่ง notification เมื่อ ready (queue/complete)

### 2.3 LINE Rich Menu
- [ ] สร้าง Rich Menu สำหรับ queue operations
- [ ] "เช็คอิน" → GPS check-in
- [ ] "ดูคิว" → queue status
- [ ] "สั่งล่วงหน้า" → pre-order

---

## Phase 3: Frontend Dashboard
**เป้าหมาย:** หน้าจอ queue display สำหรับร้าน

### 3.1 Queue Display (TV/Tablet)
- [ ] หน้าจอแสดงคิวปัจจุบัน (real-time)
- [ ] แสดง ticket number, customer name, party size
- [ ] แสดง waiting time
- [ ] Auto-refresh ทุก 5 วินาที

### 3.2 Staff Panel
- [ ] ปุ่ม "เรียกคิวถัดไป" (call next)
- [ ] ปุ่ม "เสร็จ" (complete)
- [ ] แสดง queue statistics (avg wait, total served)
- [ ] จัดการ priority (VIP, walk-in)

### 3.3 Customer-Facing
- [ ] หน้าจอ "คิวของคุณ" ( QR code → web page)
- [ ] แสดง waiting time แบบ real-time
- [ ] Push notification เมื่อถูกเรียก

---

## Phase 4: POS Integration
**เป้าหมาย:** เชื่อม GPS Queue เข้ากับระบบ POS

### 4.1 Queue → POS Order
- [ ] เมื่อ check-in สำเร็จ → สร้าง draft order ใน POS
- [ ] pre-order items → POS order items
- [ ] ชำระเงินผ่าน POS → complete queue ticket

### 4.2 POS → Queue Display
- [ ] แสดง queue ใน POS interface
- [ ] Staff ดู/จัดการ queue จาก POS ได้

### 4.3 ERP Core Sync
- [ ] sync queue_ticket กับ ERP Core database
- [ ] sync customer data
- [ ] reporting + analytics

---

## Phase 5: Advanced Features
**เป้าหมาย:** ยกระดับระบบ

### 5.1 AI Queue Management
- [ ] ทำนาย waiting time แบบ ML (จาก historical data)
- [ ] Auto-recommend party จัดโต๊ะ
- [ ] Smart priority based on wait time + party size

### 5.2 Multi-Channel Integration
- [ ] Walk-in (kiosk) → auto queue
- [ ] Phone order → voice → queue
- [ ] Web booking → queue
- [ ] LINE → queue (Phase 2)

### 5.3 Analytics Dashboard
- [ ] Peak hours analysis
- [ ] Average wait time trends
- [ ] Customer retention (repeat visit)
- [ ] Revenue per queue ticket

---

## Priority Order (แนะนำ)

```
Phase 1 (1-2 วัน) → Phase 2 (2-3 วัน) → Phase 3 (3-5 วัน) → Phase 4 (5-7 วัน) → Phase 5 (ต่อเนื่อง)
```

### Quick Wins (ทำได้เลย)
1. ✅ Implement `/gps/customer/:name` (30 min)
2. ✅ Auto-cleanup old tickets (1 ชม.)
3. ✅ API consistency fix (1 ชม.)
4. ✅ Fix LINE Bot crash (2-3 ชม.)

### High Impact
1. 🔥 LINE Bot → GPS Queue integration (เปิด use case จริง)
2. 🔥 Frontend Dashboard (ใช้งานได้จริงในร้าน)
3. 🔥 POS Integration (ครบ loop)

---

## Technical Notes

### GPS Queue Data Flow
```
1. GPS Ping → location_log (Schema Engine)
2. Check-in → queue_ticket (Schema Engine)
3. Call → update queue_ticket status
4. Complete → update queue_ticket status + cleanup
```

### Schema Engine Schemas
- `queue_ticket`: ticket_number, customer_name, phone, party_size, status, source, gps_distance, etc.
- `location_log`: customer_name, phone, latitude, longitude, geofence_status, accuracy, source

### Voice Gateway Integration (ทำแล้ว)
- `QUEUE_SERVICE = "http://localhost:8112"`
- detect_intent() → queue_request → pre_order
- Voice can create queue tickets via pre-order endpoint

---

## Phase 1 完了 (2026-08-10 07:53 UTC)

### 完成した内容
1. ✅ `GET /gps/customer/:name` — 顾客GPS履歴 + active ticket取得
2. ✅ `GET /queue/cleanup?days=7` — 古いticket自动削除
3. ✅ `/queue/call` — ticket_number対応 (UUID不要)
4. ✅ `/queue/complete` — ticket_number対応 (UUID不要)
5. ✅ タイ文字URLエンコーディング対応
6. ✅ Fuzzy名前マッチング (URL encoding edge case対応)

### 変更ファイル
- `/home/openhands/erp-stack/modules/gps_queue/service.py`

### 次のステップ
- Phase 2: LINE Bot Integration (Card: 230fd93e)
- Phase 3: Frontend Dashboard (Card: a2672339)
