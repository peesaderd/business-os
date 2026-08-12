# 📸 Passport Photo System

ระบบสร้างรูปพาสปอร์ตจากภาพถ่าย พร้อมตรวจคุณภาพอัตโนมัติ

## Features
- **Face Detection** — ตรวจจับใบหน้าด้วย OpenCV
- **Background Removal** — ลบพื้นหลังด้วย AI (rembg/U2Net)
- **Background Replacement** — เปลี่ยนพื้นหลังเป็นสีขาว/ฟ้า/เทา
- **Auto Crop** — ตัดรูปตามตำแหน่งใบหน้า
- **Multi-Country** — รองรับ 10+ ประเทศ (ไทย, US, ญี่ปุ่น, จีน, EU, UK, ออสเตรเลีย, อินเดีย, เกาหลี)
- **Quality Check** — ตรวจขนาดใบหน้า, ตำแหน่ง, แสง, ความคมชัด
- **Print Sheet** — สร้างแผ่นพิมพ์ 4x6" พร้อม crop marks

## Quick Start

```bash
cd passport-photo
pip install -r requirements.txt
python server.py
```

เปิด browser ไปที่ `http://localhost:8090`

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload photo |
| `/api/process` | POST | Process photo |
| `/api/countries` | GET | List country specs |
| `/api/download/{job_id}/{type}` | GET | Download result |

## Country Standards

| Country | Size (mm) | Background |
|---------|-----------|------------|
| ไทย | 35x45 | White/Blue |
| US | 51x51 | White |
| ญี่ปุ่น | 35x45 | White |
| จีน | 33x48 | White |
| EU | 35x45 | White/Light Gray |

## Tech Stack
- Python 3 + FastAPI
- OpenCV (face detection)
- rembg (AI background removal)
- Pillow (image processing)
