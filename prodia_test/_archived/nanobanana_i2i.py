#!/usr/bin/env python3
"""
Nano Banana img2img.v2 on Prodia — replace product in banner with real product reference.
Uses multipart form-data with 2 input images (banner + product reference).
"""
import os, json, time, re, sys
import urllib.request, urllib.error

PRODIA_TOKEN = ""
with open("/home/openhands/erp-stack/.env") as f:
    for line in f:
        if line.startswith("PRODIA_TOKEN="):
            PRODIA_TOKEN = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
if not PRODIA_TOKEN:
    print("❌ No PRODIA_TOKEN found"); sys.exit(1)

API_URL = "https://inference.prodia.com/v2/job"
BANNER = "/home/openhands/.openclaw/workspace/underarm_3panel_v2.jpg"
PRODUCT = "/home/openhands/.openclaw/workspace/ref_product.jpg"
OUTPUT = sys.argv[1] if len(sys.argv) > 1 else "/home/openhands/.openclaw/workspace/underarm_nanobanana_i2i.jpg"
PROMPT = sys.argv[2] if len(sys.argv) > 2 else (
    "In this 3-panel banner, replace the product shown in every panel with the exact product "
    "from the second image (the reference product). Match its packaging design, colors, label "
    "and brand text exactly. Keep the model, her poses, clothing, lighting, background and "
    "everything else exactly the same."
)

BOUNDARY = "----ProdiaNB123456"
def part(name, filename, ctype, data):
    b = f"--{BOUNDARY}\r\n".encode()
    b += f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
    b += f"Content-Type: {ctype}\r\n\r\n".encode()
    b += data + b"\r\n"
    return b

job = {
    "type": "inference.nano-banana.img2img.v2",
    "config": {"prompt": PROMPT, "images": ["banner.jpg", "product.jpg"], "aspect_ratio": "16:9"},
    "name": "underarm_nanobanana_i2i"
}

body = b""
body += part("job", "job.json", "application/json", json.dumps(job).encode())
with open(BANNER, "rb") as f:
    body += part("input", "banner.jpg", "image/jpeg", f.read())
with open(PRODUCT, "rb") as f:
    body += part("input", "product.jpg", "image/jpeg", f.read())
body += f"--{BOUNDARY}--\r\n".encode()

headers = {
    "Authorization": f"Bearer {PRODIA_TOKEN}",
    "Content-Type": f"multipart/form-data; boundary={BOUNDARY}",
    "Accept": "multipart/form-data",
}

print("📤 Submitting nano-banana img2img.v2 job (2 images)...")
req = urllib.request.Request(f"{API_URL}?price=true", data=body, headers=headers, method="POST")
try:
    resp = urllib.request.urlopen(req, timeout=180)
    resp_data = resp.read()
    ct = resp.headers.get("Content-Type", "")
    print(f"📥 Response: {len(resp_data)} bytes, CT={ct[:60]}")
    boundary_match = re.search(r'boundary=([^\s;]+)', ct)
    if not boundary_match:
        boundary_match = re.search(b'--([0-9a-f]+)', resp_data[:200])
    if boundary_match:
        boundary = boundary_match.group(1)
        if isinstance(boundary, bytes):
            boundary = boundary.decode()
        parts = resp_data.split(f"--{boundary}".encode())
        for i, p in enumerate(parts):
            if len(p) < 10:
                continue
            if p[:2] == b"\r\n":
                p = p[2:]
            hend = p.find(b"\r\n\r\n")
            if hend == -1:
                continue
            hbytes = p[:hend]; bbytes = p[hend+4:]
            if bbytes.endswith(b"\r\n"):
                bbytes = bbytes[:-2]
            hs = hbytes.decode("utf-8", errors="replace")
            if "application/json" in hs:
                try:
                    j = json.loads(bbytes)
                    st = j.get("state", {}).get("current", "?")
                    print(f"   Job id={j.get('id')} state={st} price=${j.get('price',{}).get('dollars','?')}")
                    if st == "failed":
                        print("   ❌", j.get("error"))
                except Exception as e:
                    print("   json err", e)
            elif "image" in hs or bbytes[:2] == b"\xff\xd8" or bbytes[:4] == b"\x89PNG":
                with open(OUTPUT, "wb") as f:
                    f.write(bbytes)
                print(f"   ✅ Image saved: {OUTPUT} ({len(bbytes)} bytes)")
            else:
                print("   (non-image part)")
    else:
        print("❌ No boundary found; raw:", resp_data[:300])
except urllib.error.HTTPError as e:
    print(f"❌ HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:600]}")
