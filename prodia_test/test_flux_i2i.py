#!/usr/bin/env python3
"""
Prodia v2 API — FLUX.2 Klein 4B img2img test
⚠️  SAFE: runs in /workspace/prodia_test/ — does NOT touch pipeline code
"""
import os, sys, json, time
import urllib.request

# Read Prodia token
PRODIA_TOKEN = ""
with open("/home/openhands/erp-stack/.env") as f:
    for line in f:
        if line.startswith("PRODIA_TOKEN="):
            PRODIA_TOKEN = line.split("=", 1)[1].strip()
            break

if not PRODIA_TOKEN:
    print("❌ PRODIA_TOKEN not found"); sys.exit(1)

API_URL = "https://inference.prodia.com/v2/job"
INPUT = "/home/openhands/.openclaw/workspace/prodia_test/input.jpg"
OUTPUT = "/home/openhands/.openclaw/workspace/prodia_test/output_flux.jpg"

PROMPT = (
    "professional passport photo of a person, wearing a white formal dress shirt, "
    "straight centered face, facing camera directly, bright even studio lighting, "
    "pure white background, high resolution, sharp focus, official government ID photo style"
)

print(f"📤 Uploading {INPUT}...")
print(f"📝 Prompt: {PROMPT[:80]}...")

BOUNDARY = "----ProdiaBoundary12345"

# Build multipart body
body = b""
# job.json part
body += f"--{BOUNDARY}\r\n".encode()
body += b'Content-Disposition: form-data; name="job"; filename="job.json"\r\n'
body += b"Content-Type: application/json\r\n\r\n"
body += json.dumps({
    "type": "inference.flux-2.klein.4b.img2img.v1",
    "config": {"prompt": PROMPT, "steps": 4}
}).encode()
body += b"\r\n"
# input image part
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
    
    # Check Content-Type
    ct = resp.headers.get("Content-Type", "")
    print(f"📥 Response: {len(resp_data)} bytes, Content-Type: {ct}")
    
    if "json" in ct or resp_data[:1] == b"{":
        result = json.loads(resp_data)
        job_id = result.get("id")
        state = result.get("state", {}).get("current", "unknown")
        price_info = result.get("price", {})
        print(f"🆔 Job ID: {job_id}")
        print(f"📊 State: {state}")
        print(f"💰 Price: ${price_info.get('dollars', 'N/A')}")
        
        if state == "failed":
            print(f"❌ Failed: {result.get('error', 'unknown')}")
            sys.exit(1)
        
        if state == "processing":
            print("⏳ Waiting for result...")
            for i in range(60):
                time.sleep(2)
                try:
                    poll_req = urllib.request.Request(
                        f"https://inference.prodia.com/v2/job/{job_id}",
                        headers={"Authorization": f"Bearer {PRODIA_TOKEN}"}
                    )
                    poll_resp = urllib.request.urlopen(poll_req, timeout=30)
                    poll_ct = poll_resp.headers.get("Content-Type", "")
                    poll_data = poll_resp.read()
                    
                    if "json" in poll_ct or poll_data[:1] == b"{":
                        job = json.loads(poll_data)
                        st = job.get("state", {}).get("current", "unknown")
                        if st == "completed":
                            out_url = job.get("output") or (job.get("outputs") or [None])[0]
                            if out_url:
                                img_data = urllib.request.urlopen(urllib.request.Request(out_url), timeout=30).read()
                                with open(OUTPUT, "wb") as f:
                                    f.write(img_data)
                                print(f"✅ Output saved: {OUTPUT} ({len(img_data)} bytes)")
                            else:
                                print(f"⚠️  No output URL. Job: {json.dumps(job, indent=2)[:1000]}")
                            sys.exit(0)
                        elif st == "failed":
                            print(f"❌ Failed: {job.get('error', 'unknown')}")
                            sys.exit(1)
                        else:
                            print(f"  ⏳ {st}... ({i*2}s)")
                    else:
                        with open(OUTPUT, "wb") as f:
                            f.write(poll_data)
                        print(f"✅ Output saved (binary): {OUTPUT} ({len(poll_data)} bytes)")
                        sys.exit(0)
                except Exception as ex:
                    print(f"  ⚠️  Poll error: {ex}")
            print("❌ Timeout"); sys.exit(1)
    else:
        # Binary response = output image directly
        with open(OUTPUT, "wb") as f:
            f.write(resp_data)
        print(f"✅ Output saved directly: {OUTPUT}")
        sys.exit(0)

except urllib.error.HTTPError as e:
    error_body = e.read().decode("utf-8", errors="replace")
    print(f"❌ HTTP {e.code}: {error_body[:500]}")
    sys.exit(1)
