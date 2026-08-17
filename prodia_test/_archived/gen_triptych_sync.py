#!/usr/bin/env python3
"""
Gen 1 image 16:9 triptych via Prodia nano-banana **SYNC** API (nano-banana not allowed on async).
Source reference = product photo (Dearny laundry detergent).
"""
import os, sys, json, re
import urllib.request, urllib.error

TOKEN = ""
with open("/home/openhands/erp-stack/.env") as f:
    for line in f:
        if line.startswith("PRODIA_TOKEN="):
            TOKEN = line.split("=",1)[1].strip().strip('"').strip("'")
            break
if not TOKEN:
    sys.exit("no token")

API = "https://inference.prodia.com/v2/job"
SRC = "/home/openhands/.openclaw/media/inbound/14576---498a2aef-9f94-49e2-b862-a6280aec2b30.webp"
OUT = "/home/openhands/.openclaw/workspace/triptych_16x9.jpg"

with open(SRC,"rb") as f:
    src = f.read()

prompt = (
    "A single wide 16:9 image split into three equal vertical panels showing the SAME young Thai woman "
    "aged about 23 in each panel, same continuous laundry-detergent product demo. "
    "LEFT PANEL: the young Thai woman stands indoors in a modern bright home holding up a white laundry "
    "detergent bottle with a soft pastel pink/purple label toward camera, smiling, casual modern outfit. "
    "MIDDLE PANEL: close-up of her hands pouring the liquid detergent from the bottle into an open "
    "front-load washing machine. "
    "RIGHT PANEL: the same woman holding the detergent bottle, standing in a modern laundry room with freshly "
    "washed colorful clothes hanging on a drying rack in the background, bright airy scene. "
    "Photorealistic, natural skin, soft natural indoor lighting, clean modern interior, "
    "consistent face and consistent product across all three panels. "
    "No text, no letters, no watermark, no logo, no subtitles, no captions."
)
negative = (
    "text, letters, words, watermark, logo, caption, subtitle, deformed face, extra limbs, "
    "blurry, low resolution, worst quality"
)

job = {
    "type": "inference.nano-banana.img2img.v2",
    "config": {
        "prompt": prompt,
        "aspect_ratio": "16:9",
    },
    "name": "triptych_dearny",
}

BOUNDARY = "----ProdiaSyncTriptych123"
def part(name, filename, ctype, data):
    b = f"--{BOUNDARY}\r\n".encode()
    b += f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
    b += f"Content-Type: {ctype}\r\n\r\n".encode()
    b += data + b"\r\n"
    return b

body = b""
body += part("job", "job.json", "application/json", json.dumps(job).encode())
body += part("input", "input.webp", "image/webp", src)
body += f"--{BOUNDARY}--\r\n".encode()

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": f"multipart/form-data; boundary={BOUNDARY}",
    "Accept": "image/jpeg",
}

print("Submitting nano-banana SYNC...")
req = urllib.request.Request(API, data=body, headers=headers, method="POST")
try:
    resp = urllib.request.urlopen(req, timeout=300)
    data = resp.read()
    ct = resp.headers.get("Content-Type", "")
    print("resp len:", len(data), "CT:", ct[:60], "Status:", resp.status)
    open(OUT, "wb").write(data)
    print("saved:", OUT)
except urllib.error.HTTPError as e:
    b = e.read().decode("utf-8", errors="replace")
    print("HTTP", e.code)
    print("FULL RESPONSE:", b[:2500])
