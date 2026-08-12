# 🎯 POS Intelligence System — Master Plan

> **Vision**: ร้านที่รู้จักลูกค้าทุกคนเหมือนเพื่อนเก่า 30 ปี — ผ่านระบบ POS + Voice + GPS + Queue + Agent

---

## สรุป Architecture ก่อนเริ่ม

```
┌─────────────────────────────────────────────────────────────┐
│                         End Users                            │
│   📱 LINE/App         🎤 Voice Call          🚶 Walk-in     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Agent (OpenClaw)                           │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │ POS MCP  │  │ Queue    │  │ Voice    │  │ GPS      │   │
│   │ Service  │  │ MCP      │  │ MCP      │  │ MCP      │   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Data Layer                                  │
│   ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│   │ Schema Engine   │  │  BookStack     │  │ Cloudflare   │  │
│   │ (structured)   │  │ (context/narr.)│  │ AI (Voice)   │  │
│   └────────────────┘  └────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Customer Memory Foundation
**Status**: ✅ Complete (2026-07-22) | **Duration**: ~1 session | **Dependencies**: POS MCP (has)

### 1.1 Schema: `customer_profile`
สร้าง schema ใหม่ใน Schema Engine:
```
customer_profile
├── phone (string, required) — unique key
├── line_user_id (string)
├── full_name (string)
├── tags (array) — ["regular", "vip", "allergic_shrimp", "likes_spicy"]
├── preferences (text) — "ชอบเผ็ดมาก, ไม่กินถั่วงอก, แพ้กุ้ง"
├── last_order_at (date)
├── total_orders (number)
├── lifetime_value (number)
├── average_order_value (number)
├── favorite_items (array) — references menu
├── allergen_warnings (array)
├── birthday (date)
├── notes (text) — "แนะนำเพื่อนมา 3 คน"
├── visit_history (array) — [{date, table, total, mood}]
└── reward_balance (object) — {points, next_reward, used_coupons}
```

### 1.2 Agent: Auto Profile Builder
- Agent อ่าน POS orders รายวัน
- จับ pattern: ลูกค้าคนเดิม? (เบอร์โทร / LINE ID)
- Update profile: last_order, favorite_items, total_spent
- เขียนหน้า "Customer Profile" ใน BookStack

### 1.3 Customer 360° BookStack Page
- BookStack เก็บ profile แต่ละคนใน chapter "Customer Profiles"
- Agent auto-generate: "คุณสมหญิง — มาครั้งที่ 15, เสียรวม ฿12,400, ชอบผัดซีอิ๊ว, แพ้กุ้ง"
- Owner/pนักงานเปิดอ่านตอนลูกค้าโทรมา

### 1.4 "Customer Insights" BookStack Page
Agent เขียนสรุปอัตโนมัติทุกสัปดาห์:
- ใครกลับมาแล้ว, ใครหายไป
- New faces, Retention rate, Top customers
- Churn risk alerts
- เห็น trend รายเดือน

### Deliverables Phase 1
- ✅ Customer profile ใน Schema Engine
- ✅ Agent auto-build profile จาก POS
- ✅ BookStack page ทุก profile
- ✅ Daily customer insight report (cron 22:00)

---

## Phase 2: GPS + Queue Integration
**Status**: ✅ Complete (2026-07-22) | **Duration**: ~1 session

### 2.1 Schema: `location_log`
สร้าง schema สำหรับ GPS data:
```
location_log
├── customer_id (ref → customer_profile)
├── latitude, longitude
├── timestamp
├── geofence_status (enum: approaching, arrived, left, nearby)
└── speed, accuracy
```

### 2.2 Schema: `queue_management`
ขยาย queue_ticket schema ที่มีอยู่:
```
queue_ticket (expand)
├── ...existing fields...
├── gps_distance (number) — ระยะห่างจากร้าน (m)
├── estimated_arrival (date) — GPS-predicted arrival
├── hold_until (date) — hold queue จนกว่าใกล้ถึง
├── party_ready (boolean) — table รอหรือยัง
└── notification_sent (boolean)
```

### 2.3 GPS Detection Service
- Agent รับ GPS ping จาก LINE/Location API
- จับว่าใครอยู่ใกล้ร้าน (geofence ~1 km)
- Query customer profile (เป็นใคร)
- ถ้าเป็นลูกค้าประจำ → auto check-in queue
- เขียน location_log ไป Schema Engine

### 2.4 GPS Queue Manager
- Dynamic queue ordering ตาม GPS distance
- ถ้าไกล = hold queue จนกว่าจะใกล้ถึง
- ถ้าใกล้ = push ขึ้น queue
- Voice/LINE แจ้ง "โต๊ะใกล้ว่าง, ช่วยยืนยันมา"

### 2.5 Line Rich Menu Integration
- LINE Bot มี pre-order button
- สั่งออเดอร์ล่วงหน้า → เข้า queue ทันที
- ถ้าสั่ง before 15:00 = จอง queue ไม่ต้องรอ

### Deliverables Phase 2
- ✅ GPS detection + geofence (location_log schema)
- ✅ Dynamic queue ordering (priority × 1000 - dist/10 sort)
- ✅ LINE pre-order + auto check-in (queue/pre-order + queue/check-in)
- ✅ Notification-ready (notification_sent field on queue_ticket)

---

## Phase 3: Voice Ordering System
**Status**: ✅ Complete (2026-07-22) | **Duration**: ~1 session | **Dependencies**: Phase 1, Phase 2

### 3.1 Voice Gateway Enhancement
ต่อยอดจาก Voice Gateway ที่มีอยู่ (port ???):
- Caller ID → customer lookup
- Speech-to-text (Gemini Audio / Cloudflare AI)
- NLP intent parsing
- Text-to-speech response (เสียงน้องร้าน)

### 3.2 Voice Agent Flow
```
Caller (ลูกค้า) → เสียงสายเข้า Voice Gateway
                → Agent รับ: "สวัสดีค่ะ ร้าน... มีอะไรให้ช่วยคะ"
                → NLP จับ intent:
                    • "สั่งอาหาร" → สั่งออเดอร์
                    • "จองโต๊ะ" → Queue integration
                    • "ถามของ" → FAQ (เปิด-ปิดกี่โมง, เมนูเด็ด)
                    • "ปัญหาสั่งผิด" → Customer service
                → ถ้าต้องยืนยันออเดอร์: "ผัดซีอิ๊วไม่ใส่ถั่วงอก กับชามะนาว ใช่ไหมคะ"
                → เสร็จ → เขียนออเดอร์ → แจ้งครัว
```

### 3.3 Customer Memory in Voice
Agent ใช้ Profile จาก Phase 1 ในการสนทนา:
```
Agent: "สวัสดีค่ะคุณสมหญิง พี่กุ้งใช่ไหมคะ? 😊"
ลูกค้า: "ใช่"
Agent: "เหมือนเดิมผัดซีอิ๊วไม่ใส่ถั่วงอก กับชามะนาว?"
ลูกค้า: "เพิ่มกะเพราทะเลด้วย"
Agent: "คราวที่แล้วลูกค้าสั่งกุ้งกะเพราค่ะ ครั้งนี้เอาทะเลรวมหรือกุ้งอย่างเดียว?"
```

**Key**: Agent รู้จักลูกค้าก่อนที่ลูกค้าจะพูด — เหมือนน้องร้านที่จำได้ทุกคน

### 3.4 Voice Feedback Loop
หลังจบการสนทนา → Agent เขียน notes:
- "ลูกค้าบอกว่าชอบกะเพราหมูกรอบมาก อยากให้เพิ่มเมนู"
- "ลูกค้าบ่นว่ารอนานเมื่อวาน"
→ อัปเดต Customer Profile + เขียน activity log ไป BookStack

### Deliverables Phase 3
- ✅ Voice → STT → NLP → POS order creation (Cloudflare Whisper + Llama 3.3)
- ✅ Customer memory-based conversation (Schema Engine lookup + personalized greeting)
- ✅ Post-call auto-log (voice_session schema + BookStack)
- ✅ Multi-language (TH input → TH/EN response)

---

## Phase 4: Predictive + Automation
**Status**: 🔲 Not started | **Duration**: ~4-5 sessions | **Dependencies**: Phase 1, 2

### 4.1 Recommendation Engine
จาก customer profile history → AI แนะนำ:
- "เซตวันเกิด": อิงจากลูกค้าที่เคย Birthday visit → package ส่วนลด + free item
- "Upsell suggestion": จาก pattern การสั่งของลูกค้า
- "Next order prediction": จากช่วงเวลาที่ลูกค้ามาประจำ

### 4.2 Churn Detection
Agent ครอสอบข้อมูลทุกวัน:
- ใครหายไป > 2 อาทิตย์?
- ใครเปลี่ยน behavior? (เคยมาทุกวันจันทร์ → 4 อาทิตย์ไม่มา)
- GPS เคยเห็นอยู่ใกล้แต่ไม่เข้า
- → สร้าง segment ใน BookStack: "Churn Risk — ระดับ High/Medium/Low"

### 4.3 Auto Re-engagement
เมื่อเจอ Churn Risk High:
- Agent สร้างร่างข้อความ: "คิดถึงคุณสมหญิงค่ะ ช่วงนี้มีเมนูกะเพราทะเลเปิดใหม่..."
- Owner อนุมัติ → Auto-send ผ่าน LINE
- วัดผล: กลับมาหรือเปล่า?

### 4.4 Smart Scheduling
Agent วิเคราะห์ traffic จาก POS history:
- วัน/เวลาไหน busy, slow
- แนะนำ staffing: "ศุกร์นี้เทรนด์บอกว่าจะ busy ต้องเพิ่มพนักงาน 1 คน"
- Queue prediction: "อีก 30 นาที peak, เตรียมครัว"
- GPS-based traffic estimation

### Deliverables Phase 4
- ✅ AI recommendation engine
- ✅ Churn detection & alerts
- ✅ Auto re-engagement drafts
- ✅ Smart staffing/traffic prediction

---

## Phase 5: Magic Moments + Advanced
**Status**: 🔲 Not started | **Duration**: ~3-4 sessions | **Dependencies**: Phase 1-4

### 5.1 Birthday Auto-Celebration
- GPS เห็นมาถึงร้าน → check birthday
- Auto-apply discount
- Queue priority
- Free drink (บันทึกใน POS)
- Voice แจ้ง waitress: "วันนี้วันเกิดคุณบุญนะครับ"
- Agent เขียน BookStack: "Birthday visit — free drink — ติดตามผล"

### 5.2 VIP Recognition
อ่าน Customer profile → ถ้ามาเกิน X ครั้ง/มูลค่า Y:
- POS ขึ้น badge "✨ VIP" บนหน้ารับออเดอร์
- เปลี่ยน method บริการ: priority queue, น้ำเปล่าฟรี
- Agent แจ้ง owner: "คุณประภาพร ครบ 10 ครั้งแล้ว! เสนอ reward?"
- เสนอ loyalty card / ส่วนลด loyalty

### 5.3 AI Visual Recognition (Future)
- ถ้ามีกลวง CCTV → Agent จับหน้า
- เชื่อมกับ customer profile
- Walk-in ลูกค้าประจำ → POS ขึ้นชื่อและรายการที่ชอบ
- พนักงาน: "สวัสดีค่ะคุณสมหญิง จัดเหมือนเดิมไหมคะ?"
- **เปลี่ยน "ร้านนี้" → "ร้านที่รู้จักฉัน"**

### 5.4 Personal BookStack Dashboard
Owner เปิด BookStack เห็น:
```
📊 Dashboard Today
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 รายได้วันนี้: ฿8,450 (+12% vs last Tue)
👤 ลูกค้าใหม่วันนี้: 5 คน
🎂 Birthday today: 3 คน → ทั้งหมดรับส่วนลดแล้ว
🚗 GPS geo: 2 คนกำลังมา
📞 Voice orders today: 7 ออเดอร์
🔴 Churn alerts: 5 คน (action: ส่ง LINE รออนุมัติ)
🎯 Upsell ประจำวันนี้: waitress ขายไข่ดาวเพิ่ม 15 จาน
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## ระยะเวลาโดยรวม

| Phase | เนื้อหา | Sessions | Priority | Dependencies |
|-------|---------|----------|----------|--------------|
| **1** | Customer Memory Foundation | 3-4 | 🥇 สูงสุด | POS MCP (มีแล้ว) |
| **2** | GPS + Queue | 4-5 | 🥈 | Phase 1 |
| **3** | Voice Ordering | 5-6 | 🥈 | Phase 1 |
| **4** | Predictive + Automation | 4-5 | 🥉 | Phase 1+2 |
| **5** | Magic Moments | 3-4 | 🎯 Bonus | Phase 1-4 |

**รวม**: ~19-24 sessions | ถ้าวันละ 2 sessions = **ประมาณ 2 อาทิตย์**

---

## เริ่มจากตรงไหน?

| Criteria | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|----------|---------|---------|---------|---------|---------|
| ใช้ของที่มีอยู่ | POS MCP ✅ | Queue Schema ✅ | Voice Gateway 🤷 | Phase 1 data | Almost done |
| เห็นผลเร็วที่สุด | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| ยาก | ง่าย | กลาง | กลาง-ยาก | ยาก | กลาง |
| WOW factor | ปานกลาง | สูง | สูงมาก | ปานกลาง | สูงมาก |

**แนะนำ**: Phase 1 → Phase 3 (Voice มี WOW สูง + มี Voice Gateway อยู่แล้ว) → Phase 2 → Phase 4 → Phase 5
