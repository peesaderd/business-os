#!/usr/bin/env python3
"""
Gen 1 image: 16:9 triptych of 3 shots for Wan2.7 first/last, using Prodia nano-banana img2img.
Source reference = product photo (Dearny laundry detergent).
Scene plan (3 shots side by side, left->right):
  SHOT 1 (FIRST)  - Thai woman, age ~23, holding the product, indoors (home), modern.
  SHOT 2 (MIDDLE) - pouring detergent into washing machine  (NOT used by wan, but kept in triptych)
  SHOT 3 (LAST)   - Thai woman holding product, background with clothes hanging to dry, modern scene.
NO text / no watermark / no labels in image.
"""
import os, sys, json, time
sys.path.insert(0, "/home/openhands/erp-stack")
from prodia_client import ProdiaV2Client

TOKEN = ""
with open("/home/openhands/erp-stack/.env") as f:
    for line in f:
        if line.startswith("PRODIA_TOKEN="):
            TOKEN = line.split("=",1)[1].strip().strip('"').strip("'")
            break
if not TOKEN:
    sys.exit("no token")

SRC = "/home/openhands/.openclaw/media/inbound/14576---498a2aef-9f94-49e2-b862-a6280aec2b30.webp"
OUT = "/home/openhands/.openclaw/workspace/triptych_16x9.jpg"

with open(SRC, "rb") as f:
    src_bytes = f.read()

# Wide 16:9 triptych: three panels side by side, single continuous scene, no text
prompt = (
    "A single wide 16:9 image split into three equal vertical panels showing the SAME Thai woman "
    "aged about 23 in each panel, same continuous product demo. "
    "LEFT PANEL: the young Thai woman stands indoors in a modern bright home holding up a white laundry "
    "detergent bottle (Dearny, soft pink/purple label, 500ml) toward camera, smiling, casual modern outfit. "
    "MIDDLE PANEL: close-up of her hands pouring the liquid detergent from the bottle into an open front-load "
    "washing machine. "
    "RIGHT PANEL: the same woman holding the detergent bottle, standing in a modern laundry room with freshly "
    "washed colorful clothes hanging on a drying rack in the background, bright airy scene. "
    "Photorealistic, natural skin, soft natural indoor lighting, clean modern interior, "
    "consistent face and consistent product across all three panels. "
    "No text, no letters, no watermark, no logo text, no subtitles, no captions."
)
negative = (
    "text, letters, words, watermark, logo, caption, subtitle, deformed face, extra limbs, "
    "blurry, low resolution, worst quality"
)

client = ProdiaV2Client(token=TOKEN)
print("Submitting nano-banana img2img (16:9 triptych)...")
job_id = client.create_job(
    "inference.nano-banana.img2img.v2",
    {"prompt": prompt, "negative_prompt": negative, "ratio": "16:9"},
    inputs=[src_bytes],
    accept="image/jpeg",
)
print("job_id:", job_id)
res = client.wait_for_result(job_id)
url = client._extract_output_url(res, "image")
print("output_url:", url)
print("price:", res.get("price"))

# download
import urllib.request
req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=120) as r, open(OUT,"wb") as f:
    f.write(r.read())
print("saved:", OUT)
