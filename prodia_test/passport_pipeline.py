#!/usr/bin/env python3
"""
Passport Photo AI Pipeline V1 — Final
FLUX i2i Based: Crop → FLUX i2i → Done

Usage:
    python3 passport_pipeline.py --input photo.jpg --output passport.jpg
    python3 passport_pipeline.py  # default: input.jpg → passport_final.jpg

Cost: $0.004/photo (Prodia FLUX.2 Klein 4B)
"""
import os, sys, json, re, cv2, numpy as np
import urllib.request, argparse

# ── Config ──────────────────────────────────────────
PRODIA_TOKEN = ""
with open("/home/openhands/erp-stack/.env") as f:
    for line in f:
        if line.startswith("PRODIA_TOKEN="):
            PRODIA_TOKEN = ***"=", 1)[1].strip()
            break

WORK_DIR = "/home/openhands/.openclaw/workspace/prodia_test"
API_URL = "https://inference.prodia.com/v2/job"

# ── Prompt (User approved V1) ─────────────────────
PROMPT = (
    "keep the person's face exactly as it is, do not change facial features, "
    "change clothing to white formal dress shirt only, "
    "replace background with solid light blue color, "
    "improve lighting to bright even studio lighting, "
    "remove acne and blemishes from skin, "
    "passport ID photo style, government photo"
)

STRENGTH = 0.65


# ── Step 1: Face Detection + Crop ──────────────────
def face_crop(input_path, output_dir=None):
    """Detect face, crop to passport 35:45 ratio."""
    img = cv2.imread(input_path)
    if img is None:
        print(f"❌ Cannot read: {input_path}"); sys.exit(1)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(80, 80))

    if len(faces) == 0:
        print("⚠️  No face detected, using full image"); return img

    x, y, fw, fh = max(faces, key=lambda f: f[2]*f[3])
    print(f"🔍 Face: ({x},{y}) {fw}x{fh}")

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

    if output_dir:
        out = os.path.join(output_dir, "step1_crop.jpg")
        cv2.imwrite(out, resized, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"✅ Crop → {resized.shape[1]}x{resized.shape[0]}")
    return resized


# ── FLUX i2i ──────────────────────────────────────
def parse_multipart_response(resp_data, ct):
    """Parse multipart response, return (json_job, image_bytes)."""
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


def flux_i2i(input_img, output_dir=None):
    """FLUX i2i — change shirt, background, lighting, remove acne."""
    print(f"\n📤 FLUX i2i (strength={STRENGTH})...")

    # Save input for upload
    in_path = os.path.join(output_dir or WORK_DIR, "_flux_input.jpg")
    cv2.imwrite(in_path, input_img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    BOUNDARY = "----ProdiaPassportV1"
    job_json = json.dumps({
        "type": "inference.flux-2.klein.4b.img2img.v1",
        "config": {
            "prompt": PROMPT,
            "steps": 4,
            "strength": STRENGTH
        }
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
        print(f"   📊 State: {state}, Price: ${price}")

    if image_bytes:
        if output_dir:
            out_path = os.path.join(output_dir, "step2_flux.jpg")
            with open(out_path, "wb") as f:
                f.write(image_bytes)
        print(f"✅ FLUX i2i done ({len(image_bytes)} bytes)")
        arr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)

    print("❌ No image in response"); sys.exit(1)


# ── Main Pipeline ──────────────────────────────────
def run_pipeline(input_path, output_path):
    """Run V1 pipeline: Crop → FLUX i2i."""
    output_dir = os.path.dirname(output_path) or "."
    os.makedirs(output_dir, exist_ok=True)

    print("=" * 60)
    print("  Passport Photo Pipeline V1")
    print("  Crop → FLUX i2i")
    print(f"  Cost: $0.004/photo")
    print("=" * 60)
    print(f"  Input:  {input_path}")
    print(f"  Output: {output_path}")
    print()

    # Step 1: Crop
    img = face_crop(input_path, output_dir)

    # Step 2: FLUX i2i
    img = flux_i2i(img, output_dir)

    # Save final
    cv2.imwrite(output_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    print()
    print("=" * 60)
    print(f"  ✅ Done: {output_path}")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Passport Photo AI Pipeline V1")
    parser.add_argument("--input", "-i", default=os.path.join(WORK_DIR, "input.jpg"))
    parser.add_argument("--output", "-o", default=os.path.join(WORK_DIR, "passport_final.jpg"))
    args = parser.parse_args()

    run_pipeline(args.input, args.output)
