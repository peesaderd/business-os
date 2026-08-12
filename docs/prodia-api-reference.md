# Prodia API Reference — Wan 2.7 & Nano Banana

> 📅 บันทึก: 2026-07-25
> 📄 Source: Prodia official documentation

---

## Wan 2.7 (Video Generation)

**Architecture:** DiT (Diffusion Transformer) with Flow-Matching framework

### Job Types
| Job Type | Description | ETA |
|---|---|---|
| `inference.wan2-7.txt2img.v1` | Text-to-image | ~40s |
| `inference.wan2-7.img2img.v1` | Edit/restyle image | ~40s |
| `inference.wan2-7.txt2vid.v1` | Text-to-video | ~200s |
| `inference.wan2-7.img2vid.v1` | Image-to-video | ~200s |
| `inference.wan2-7.vid2vid.v1` | Video continuation | ~200s |

### Key Features
- 🔥 **First & Last Frame Control** — `image` = start frame, `last_frame` = end frame → model interpolates everything in between
- 🔊 **Audio-driven video** — `audio` param (WAV/MP3, 2-30s, max 15MB) for lip-sync and motion timing
- 🎬 **1080p output** — one of few open models with full HD
- ⏱️ **Up to 15s clips** — longer than most competitors
- 🌐 **Bilingual T5 encoder** — Chinese + English prompts
- 📝 **Prompt extension** — auto-expands short prompts (default: `true`)
- 🧠 **Thinking mode** — for txt2img only, improves composition

### Wan 2.7 I2V Parameters
```json
{
  "type": "inference.wan2-7.img2vid.v1",
  "config": {
    "prompt": "Video description (required, max 5000 chars)",
    "image": "first_frame.png",
    "last_frame": "end_frame.png",
    "audio": "speech.mp3",
    "duration": 15,
    "resolution": "720P",
    "negative_prompt": "low resolution, error, worst quality, deformed",
    "prompt_extend": true
  }
}
```

### 🔑 Critical: `last_frame` parameter
Prodia docs ยืนยัน — Wan 2.7 รองรับ **first and last frame control**:
- `image` = เฟรมแรก
- `last_frame` = เฟรมสุดท้าย
- Model สร้างทุกอย่างระหว่างกลาง
- ใช้สำหรับ loopable videos และ precise scene transitions

### ช่วงเวลาใช้งาน
- **Talking-head**: img2vid + audio → lip-sync จาก portrait
- **Product animations**: img2vid → controlled motion
- **Loopable content**: img2vid + last_frame (first = last) → seamless loop
- **Scene extensions**: vid2vid → continue existing clip

### Pricing
- **img2vid $0.03** (flat, any duration 2-15s)
- **txt2vid $0.03** (flat)
- **img2img $0.006**

### Pro Tips
- ✅ Use prompt extension (default) for short prompts
- ✅ Negative prompts matter: `"low resolution, error, worst quality, deformed"`
- ✅ Match aspect ratio to platform: 9:16 TikTok/Reels, 16:9 YouTube, 1:1 Instagram
- ⚠️ **Wan 2.2 Lightning**: faster (~22s vs ~200s) but 720p only, no audio/frame control

---

## Nano Banana (Image Generation)

**Architecture:** Multimodal Gemini model — reads input as visual tokens, edits localized regions

### Job Types
| Job Type | Description | ETA | Cost |
|---|---|---|---|
| `inference.nano-banana.txt2img.v2` | Text-to-image | ~8s | $0.039 |
| `inference.nano-banana.img2img.v2` | Edit 1-3 images | ~8s | $0.039 |
| `inference.nano-banana.img2img.v1` | Single-image edit (deprecated) | ~8s | $0.039 |

### Also Available (Higher Tier)
| Job Type | Description | ETA |
|---|---|---|
| `inference.gemini-3-pro.txt2img.v1` | Gemini 3 Pro T2I | ~10s |
| `inference.gemini-3-pro.img2img.v1` | Gemini 3 Pro I2I (up to 3 inputs) | ~12s |
| `inference.gemini-3-1-flash.txt2img.v1` | Gemini 3.1 Flash T2I + Google Search grounding | ~30s |
| `inference.gemini-3-1-flash.img2img.v1` | Gemini 3.1 Flash I2I (up to 14 inputs!) | ~35s |

### Key Features
- 🎯 **Localized edits** — change specific element, rest stays frozen
- 🖼️ **Multi-image composition** — `img2img.v2` up to 3 images
- 💬 **Conversational prompts** — natural language works better than keywords
- 💰 **Flat $0.039/job** — any resolution, any aspect ratio
- ⚡ **~8s per job** — fastest option

### Nano Banana I2I v2 Parameters
```json
{
  "type": "inference.nano-banana.img2img.v2",
  "config": {
    "prompt": "Describe the edit (max 2500 chars)",
    "images": ["img1.png", "img2.png", "img3.png"],
    "aspect_ratio": "auto"
  }
}
```

Supported `aspect_ratio`: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`

### Prompting Tips
- Describe the **change**, not the whole scene
- Anchor preservation: "keep everything else exactly the same"
- Use **natural language** — NOT comma-separated keywords
- Multi-image: "subject from first image, in setting from second image"

---

## 🎯 Best Pipeline: 1 Image + 1 Wan 2.7 Call

จากข้อมูล Prodia API — flow ที่ดีที่สุดสำหรับ UGC TikTok:

```
Nano Banana txt2img (1 image, 9:16, ~8s, $0.039)
    ↓
Wan 2.7 img2vid (1 prompt, 15s, 720P, ~200s, $0.03)
    ↓
Total: $0.069, ~3.5 min
```

**เหตุผล:**
1. Nano Banana สร้าง 1 ภาพสวย — ใช้ conversational prompt
2. Wan 2.7 รับ `image` (first frame) + `prompt` ละเอียด
3. Wan สร้าง motion ทั้งหมดจาก 1 ภาพ + text description
4. **vid_01d7166b proof** — 1 image + 1 prompt → งานออกมาดี perfect

### ถ้าต้องการ First/Last Frame Control:
```python
config = {
    "image": "first_frame.png",
    "last_frame": "end_frame.png",  # ← Prodia รับตรงนี้!
    "prompt": "...",
    "duration": 15,
    "resolution": "720P",
}
```

### ถ้าต้องการ Talking Head (Lip-Sync):
```python
config = {
    "image": "portrait.png",
    "audio": audio_bytes,  # ← WAV/MP3, 2-30s, max 15MB
    "prompt": "person speaking naturally",
    "duration": 10,
    "resolution": "720P",
}
```
