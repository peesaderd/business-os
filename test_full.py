#!/usr/bin/env python3
"""Full end-to-end pipeline test with audio"""
import os, sys, json, time, uuid, logging
logging.basicConfig(level=logging.INFO)

sys.path.insert(0, '/home/openhands/erp-stack')
from prodia_client import ProdiaV2Client
from shared_config import PRODIA_TOKEN

token = PRODIA_TOKEN()
print(f"Token length: {len(token)}")

client = ProdiaV2Client(token=token)

# Step 1: Load image
import requests
img_url = "https://picsum.photos/720/1280"
resp = requests.get(img_url, timeout=30)
img_bytes = resp.content
print(f"Image: {len(img_bytes)} bytes from {img_url}")

# Step 2: Create a simple TTS audio
from gemini_tts import gemini_text_to_speech
audio_path = f"/tmp/test_voice_{uuid.uuid4().hex[:8]}.mp3"
tts_path = gemini_text_to_speech("สวัสดีค่า วันนี้เรามาแนะนำสินค้าใหม่สุดปัง", output_path=audio_path)
with open(tts_path, "rb") as f:
    audio_bytes = f.read()
print(f"Audio: {len(audio_bytes)} bytes from {tts_path}")

# Step 3: Generate video with audio via shared client
print("\n=== Generating video with audio ===")
result = client.generate_video(
    prompt="Thai woman holding beauty product, soft diffused lighting, smooth motion, 9:16 portrait",
    input_image=img_bytes,
    duration=8,
    resolution="720P",
    audio_bytes=audio_bytes,
    negative_prompt="low quality, deformed, text",
)

output_url = result.get("output_url", "")
price = result.get("price", {})
print(f"Output URL: {output_url}")
print(f"Price: {json.dumps(price, indent=2)}")

if output_url:
    # Download with auth
    auth = {"Authorization": f"Bearer {token}"}
    vresp = requests.get(output_url, headers=auth, timeout=60)
    vresp.raise_for_status()
    out_path = f"/tmp/test_video_{uuid.uuid4().hex[:8]}.mp4"
    with open(out_path, "wb") as f:
        f.write(vresp.content)
    print(f"\n✅ Video saved: {out_path} ({len(vresp.content)} bytes)")
else:
    print(f"\n❌ No output URL! Full result: {json.dumps(result, indent=2)[:500]}")
