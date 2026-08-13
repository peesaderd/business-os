#!/usr/bin/env python3
"""
Prodia v2 API — FLUX.2 Klein 4B img2img — parse multipart response properly
⚠️  SAFE: /workspace/prodia_test/ only
"""
import os, sys, json, time, re
import urllib.request

# Read Prodia token
PRODIA_TOKEN = ""
with open("/home/openhands/erp-stack/.env") as f:
    for line in f:
        if line.startswith("PRODIA_TOKEN="):
            PRODIA_TOKEN = line.split("=", 1)[1].strip()
            break

API_URL = "https://inference.prodia.com/v2/job"
INPUT = "/home/openhands/.openclaw/workspace/prodia_test/input.jpg"
OUTPUT = "/home/openhands/.openclaw/workspace/prodia_test/output_flux.jpg"

PROMPT = (
    "professional passport photo of a person, wearing a white formal dress shirt, "
    "straight centered face, facing camera directly, bright even studio lighting, "
    "pure white background, high resolution, sharp focus, official government ID photo style"
)

print(f"📤 Uploading {INPUT}...")

BOUNDARY = "----ProdiaBoundary12345"

body = b""
body += f"--{BOUNDARY}\r\n".encode()
body += b'Content-Disposition: form-data; name="job"; filename="job.json"\r\n'
body += b"Content-Type: application/json\r\n\r\n"
body += json.dumps({
    "type": "inference.flux-2.klein.4b.img2img.v1",
    "config": {"prompt": PROMPT, "steps": 4}
}).encode()
body += b"\r\n"
body += f"--{BOUNDARY}\r\n".encode()
body += b'Content-Disposition: form-data; name="input"; filename="image.jpg"\r\n'
body += b"Content-Type: image/jpeg\r\n\r\n"
with open(INPUT, "rb") as f:
    body += f.read()
body += b"\r\n"
body += f"--{BOUNDARY}--\r\n".encode()

headers = {
    "Authorization": f"Bearer {PRODIA_TOKEN}",
    "Content-Type": f"multipart/form-data; boundary={BOUNDARY}",
    "Accept": "multipart/form-data",
}

req = urllib.request.Request(f"{API_URL}?price=true", data=body, headers=headers, method="POST")
try:
    resp = urllib.request.urlopen(req, timeout=120)
    resp_data = resp.read()
    ct = resp.headers.get("Content-Type", "")
    print(f"📥 Response: {len(resp_data)} bytes")
    
    # Find boundary from Content-Type
    boundary_match = re.search(r'boundary=([^\s;]+)', ct)
    if not boundary_match:
        # Try to find boundary from data itself
        boundary_match = re.search(b'--([0-9a-f]+)', resp_data)
    
    if boundary_match:
        boundary = boundary_match.group(1).decode() if isinstance(boundary_match.group(1), bytes) else boundary_match.group(1)
        print(f"🔍 Boundary: {boundary}")
        
        # Split by boundary
        parts = resp_data.split(f"--{boundary}".encode())
        
        for i, part in enumerate(parts):
            if len(part) < 10:
                continue
            # Remove leading \r\n
            if part[:2] == b"\r\n":
                part = part[2:]
            
            # Split headers and body
            header_end = part.find(b"\r\n\r\n")
            if header_end == -1:
                continue
            
            header_bytes = part[:header_end]
            body_bytes = part[header_end+4:]
            
            # Remove trailing \r\n
            if body_bytes.endswith(b"\r\n"):
                body_bytes = body_bytes[:-2]
            
            headers_str = header_bytes.decode("utf-8", errors="replace")
            print(f"\n📦 Part {i}: {len(body_bytes)} bytes")
            print(f"   Headers: {headers_str[:200]}")
            
            if "application/json" in headers_str:
                try:
                    job = json.loads(body_bytes)
                    state = job.get("state", {}).get("current", "unknown")
                    job_id = job.get("id")
                    price = job.get("price", {})
                    print(f"   Job ID: {job_id}")
                    print(f"   State: {state}")
                    print(f"   Price: ${price.get('dollars', 'N/A')}")
                    
                    if state == "failed":
                        print(f"   ❌ Error: {job.get('error', 'unknown')}")
                except json.JSONDecodeError:
                    print(f"   (not JSON)")
            
            elif "image" in headers_str or body_bytes[:2] == b"\xff\xd8" or body_bytes[:4] == b"\x89PNG":
                with open(OUTPUT, "wb") as f:
                    f.write(body_bytes)
                fmt = "JPEG" if body_bytes[:2] == b"\xff\xd8" else "PNG" if body_bytes[:4] == b"\x89PNG" else "unknown"
                print(f"   ✅ Image saved: {OUTPUT} ({len(body_bytes)} bytes, {fmt})")
            else:
                print(f"   (skipped)")
    else:
        print("❌ Could not find boundary in response")
        
except urllib.error.HTTPError as e:
    error_body = e.read().decode("utf-8", errors="replace")
    print(f"❌ HTTP {e.code}: {error_body[:500]}")
