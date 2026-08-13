#!/usr/bin/env python3
"""
Passport Photo AI Pipeline v4 — FLUX i2i Based (User liked V1)
FLUX: shirt, background, lighting, acne removal
Keep face structure as original as possible

⚠️  SAFE: /workspace/prodia_test/ only
"""
import os, sys, json, time, re, cv2, numpy as np
import urllib.request

# ── Config ──────────────────────────────────────────
PRODIA_TOKEN = ""
with open("/home/openhands/erp-stack/.env") as f:
    for line in f:
        if line.startswith("PRODIA_TOKEN="):
            PRODIA_TOKEN = line.split("=", 1)[1].strip()
            break

WORK_DIR = "/home/openhands/.openclaw/workspace/prodia_test"
INPUT = os.path.join(WORK_DIR, "input.jpg")
API_URL = "https://inference.prodia.com/v2/job"


# ── Step 1: Face Detection + Crop ──────────────────
def face_crop(input_path):
    """Detect face, crop to passport 35:45 ratio."""
    img = cv2.imread(input_path)
    if img is None:
        print("❌ Cannot read input image"); sys.exit(1)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(80, 80))

    if len(faces) == 0:
        print("⚠️  No face detected, using full image"); return img

    x, y, fw, fh = max(faces, key=lambda f: f[2]*f[3])
    print(f"🔍 Face: ({x},{y}) {fw}x{fh}")

    # Passport 35:45 ratio
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

    out = os.path.join(WORK_DIR, "v4_step1_crop.jpg")
    cv2.imwrite(out, resized, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"✅ Step 1: Crop → {resized.shape[1]}x{resized.shape[0]}")
    return resized


# ── Step 2: FLUX i2i ──────────────────────────────
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


def flux_i2i(input_img, step_name="step2"):
    """FLUX i2i — low strength to preserve original face."""
    PROMPT = (
        "keep the person's face exactly as it is, do not change facial features, "
        "change clothing to white formal dress shirt only, "
        "replace background with solid light blue color, "
        "improve lighting to bright even studio lighting, "
        "remove acne and blemishes from skin, "
        "passport ID photo style, government photo"
    )

    print(f"\n📤 FLUX i2i (strength=0.65 — preserve face)...")

    # Save input for upload
    in_path = os.path.join(WORK_DIR, f"v4_{step_name}_input.jpg")
    cv2.imwrite(in_path, input_img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    BOUNDARY = "----ProdiaBoundaryV4"
    job_json = json.dumps({
        "type": "inference.flux-2.klein.4b.img2img.v1",
        "config": {
            "prompt": PROMPT,
            "steps": 4,
            "strength": 0.65  # Original V1 strength — user preferred this
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
        out_path = os.path.join(WORK_DIR, f"v4_{step_name}_output.jpg")
        with open(out_path, "wb") as f:
            f.write(image_bytes)
        print(f"✅ FLUX i2i done ({len(image_bytes)} bytes)")
        # Convert bytes to cv2 image
        arr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)

    print("❌ No image in response"); sys.exit(1)


# ── Step 3: Post-process (GFPGAN face restore) ────
def face_restore(img):
    """GFPGAN on FLUX output — restore any face detail loss."""
    try:
        from gfpgan import GFPGANer
    except ImportError:
        print("⚠️  GFPGAN not installed, skipping"); return img

    print(f"\n📤 Step 3: GFPGAN face restore...")

    restorer = GFPGANer(
        model_path=os.path.expanduser("~/.cache/gfpgan/GFPGANv1.4.pth"),
        upscale=1, arch="clean", channel_multiplier=2,
        bg_upsampler=None
    )

    _, _, output = restorer.enhance(img, has_aligned=False, only_center_face=False, paste_back=True)
    print(f"✅ GFPGAN done")
    return output


# ── Main Pipeline ──────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  Passport Photo Pipeline v4 — FLUX Based")
    print("  Crop → FLUX i2i (low strength) → GFPGAN")
    print("=" * 60)
    print(f"  Input: {INPUT}\n")

    img = cv2.imread(INPUT)

    # Step 1: Crop
    img = face_crop(INPUT)  # pass file path

    # Step 2: FLUX i2i (low strength to preserve face)
    img = flux_i2i(img, "step2")

    # Step 3: GFPGAN face restore — REMOVED (adjusts too much)
    # img = face_restore(img)

    final = os.path.join(WORK_DIR, "passport_final_v4.jpg")
    cv2.imwrite(final, img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    print()
    print("=" * 60)
    print(f"  🎉 Final: {final}")
    print("=" * 60)
