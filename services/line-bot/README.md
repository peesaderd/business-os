# 🤖 LINE Bot — Slip Checker

LINE Bot สำหรับเช็คสลิปโอนเงินและแจ้งเตือน Admin

## Features
- 📷 รับรูปสลิปจากลูกค้า → วิเคราะห์อัตโนมัติ
- 💰 ดึงข้อมูลจำนวนเงิน, ธนาคาร, ชื่อผู้โอน
- 🔔 แจ้ง Admin ทันทีเมื่อมีสลิปใหม่
- 📱 ใช้ pyzbar (QR decode) + Tesseract (OCR Thai)

## Setup

### 1. LINE Developers
1. ไปที่ [LINE Developers](https://developers.line.biz/)
2. สร้าง Provider + Channel (Messaging API)
3. คัดลอก Channel Access Token + Channel Secret

### 2. Environment Variables
```bash
export LINE_CHANNEL_ACCESS_TOKEN="your_token"
export LINE_CHANNEL_SECRET="your_secret"
export LINE_ADMIN_USER_ID="admin_user_id"  # Optional, set via /admin
```

### 3. Run
```bash
cd services/line-bot
python3 bot_server.py
```

### 4. Set Webhook URL
1. ไปที่ LINE Developers → Channel settings
2. Webhook URL: `https://your-domain.com/callback`
3. Enable webhook

## Commands
- `/admin` — ลงทะเบียนเป็น Admin
- `/status` — ดูสถานะ Bot
- `/help` — ดูคำสั่ง

## Usage
1. ส่งรูปสลิปมาที่ Bot
2. ระบบเช็คสลิปอัตโนมัติ
3. ตอบลูกค้า + แจ้ง Admin

## Port
- Default: 8110
- Health check: `GET /health`
