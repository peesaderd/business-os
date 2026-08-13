#!/usr/bin/env python3
"""
Batch process 10 passport photos through Pipeline V1
"""
import os, sys, json, re, cv2, numpy as np
import urllib.request

# ── Config ──────────────────────────────────────────
PRODIA_TOKEN = ""
with open("/home/openhands/erp-stack/.env") as f:
    for line in f:
        if line.startswith("PRODIA_TOKEN="):
            PRODIA_TOKEN = line.split("=", 1)[1].strip()
            break

WORK_DIR = "/home/openhands/.openclaw/workspace/prodia_test"
API_URL = "https://inference.prodia.com/v2/job"

PROMPT = (
    "keep the person's face exactly as it is, do not change facial features, "
    "change clothing to white formal dress shirt only, "
    "replace background with solid light blue color, "
    "improve lighting to bright even studio lighting, "
    "remove acne and blemishes from skin, "
    "passport ID photo style, government photo"
)

STRENGTH = 0.65

# ── Input files ─────────────────────────────────────
INBOUND = "/home/openhands/.openclaw/media/inbound"
INPUT_FILES = [
    "14378---3366a0cd-e417-4354-8276-9462d1043209.jpg",
    "14373---e23f0ba2-51f6-475e-87ed-2f85b6090143.jpg",
    "14372---a21ba455-f565-41ef-b4cc-f85cf7c2d2fa.jpg",
    "14375---cb35e79c-7189-4076-8508-6d8a8b12162b.jpg",
    "14371---4d20b608-a25c-494e-ac2a-274e5e101c49.jpg",
    "14376---0252294d-c9ad-4454-85cd-720149ae5943.jpg",
    "14374---ca7d7ad7-8211-471f-b10b-241fe4714e10.jpg",
    "14377---537eb846-4fab-409b-aeb5-81d7204de6ef.jpg",
    "14369---a4879466-7190-405f-8c17-0a672603adf6.jpg",
    "14370---01737fb7-2088-4f7d-b5fb-43119b391db8.jpg",
]

OUTPUT_DIR = os.path.join(WORK_DIR, "batch_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def face_crop(input_path):
    img = cv2.imread(input_path)
    if img is None:
        print(f"❌ Cannot read: {input_path}"); return None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(80, 80))

    if len(faces) == 0:
        print("⚠️  No face detected, using full image"); return img

    x, y, fw, fh = max(faces, key=lambda f: f[2]*f[3])

    target_ratio = 35.0 / 45.0
    face_center_x = x + fw // 2
    face_center_y = y + fh // 2

    crop_h = int(fh / 0.40)
    crop_w = int(crop_h * target_ratio)

    crop_x1 = max(0, face_center_x - crop_w // 2)
    crop_y1 = max(0, int(face_center_y - crop_h * 0.30))

    if crop_x1 + crop_w > w: crop_x1 = w - crop_w
    if crop_y1 + crop_h > h: crop_y1 = h - crop_h
    crop_x1 = max(0, crop_x1)
    crop_y1 = max(0, crop_y1)

    cropped = img[crop_y1:crop_y1+crop_h, crop_x1:crop_x1+crop_w]
    resized = cv2.resize(cropped, (354, 450), interpolation=cv2.INTER_LANCZOS4)
    return resized


def parse_multipart_response(resp_data, ct):
    job_info = None
    image_bytes = None

    boundary_match = re.search(r'boundary=([^\s;]+)', ct)
    if not boundary_match:
        if resp_data[:2] == b"\xff\xd8" or resp_data[:4] == b"\x89PNG":
            return None, resp_data
        return None, None

    boundary = boundary_match.group(1)
    parts = resp_data.split(f"--{boundary}".encode())

    for part in parts:
        if len(part) < 10: continue
        if part[:2] == b"\r\n": part = part[2:]
        header_end = part.find(b"\r\n\r\n")
        if header_end == -1: continue
        headers_str = part[:header_end].decode("utf-8", errors="replace")
        body_bytes = part[header_end+4:]
        if body_bytes.endswith(b"\r\n"): body_bytes = body_bytes[:-2]

        if "application/json" in headers_str:
            try: job_info = json.loads(body_bytes)
            except: pass
        elif body_bytes[:2] == b"\xff\xd8" or body_bytes[:4] == b"\x89PNG":
            image_bytes = body_bytes

    return job_info, image_bytes


def flux_i2i(input_img, output_path):
    in_path = output_path.replace(".jpg", "_input.jpg")
    cv2.imwrite(in_path, input_img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    BOUNDARY = "----ProdiaBatch"
    job_json = json.dumps({
        "type": "inference.flux-2.klein.4b.img2img.v1",
        "config": {"prompt": PROMPT, "steps": 4, "strength": STRENGTH}
    })

    body = b""
    body += f"--{BOUNDARY}\r\n".encode()
    body += b'Content-Disposition: form-data; name="job"; filename="job.json"\r\n'
    body += b"Content-Type: application/json\r\n\r\n"
    body += job_json.encode()
    body += b"\r\n"
    body += f"--{BOUNDARY}\r\n".encode()
    body += b'Content-Disposition: form-data; name="input"; filename="image.jpg"\r\n'
    body += b"Content-Type: image/jpeg\r\n\r\n"
    with open(in_path, "rb") as f:
        body += f.read()
    body += b"\r\n"
    body += f"--{BOUNDARY}--\r\n".encode()

    headers = {
        "Authorization": f"Bearer {PRODIA_TOKEN}",
        "Content-Type": f"multipart/form-data; boundary={BOUNDARY}",
        "Accept": "multipart/form-data",
    }

    req = urllib.request.Request(f"{API_URL}?price=true", data=body, headers=headers, method="POST")
    resp = urllib.request.urlopen(req, timeout=120)
    resp_data = resp.read()
    ct = resp.headers.get("Content-Type", "")

    job_info, image_bytes = parse_multipart_response(resp_data, ct)

    if job_info:
        state = job_info.get("state", {}).get("current", "unknown")
        price = job_info.get("price", {}).get("dollars", "N/A")
        print(f"   📊 {state}, ${price}")

    if image_bytes:
        with open(output_path, "wb") as f:
            f.write(image_bytes)
        arr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)

    print("❌ No image"); return None


# ── Main ────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  Batch Passport Photo Pipeline V1")
    print(f"  Processing {len(INPUT_FILES)} photos")
    print(f"  Cost: ~${0.004 * len(INPUT_FILES):.2f} total")
    print("=" * 60)

    results = []
    for i, fname in enumerate(INPUT_FILES, 1):
        input_path = os.path.join(INBOUND, fname)
        output_path = os.path.join(OUTPUT_DIR, f"passport_{i:02d}.jpg")

        print(f"\n[{i}/{len(INPUT_FILES)}] {fname[:30]}...")

        # Crop
        img = face_crop(input_path)
        if img is None:
            print("   ❌ Skipped"); continue

        # FLUX i2i
        result = flux_i2i(img, output_path)
        if result is not None:
            print(f"   ✅ {output_path}")
            results.append(output_path)
        else:
            print(f"   ❌ Failed")

    print()
    print("=" * 60)
    print(f"  ✅ Done: {len(results)}/{len(INPUT_FILES)} photos")
    print(f"  📁 Output: {OUTPUT_DIR}")
    print("=" * 60)
