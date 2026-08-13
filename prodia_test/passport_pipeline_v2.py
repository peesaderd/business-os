#!/usr/bin/env python3
"""
Passport Photo AI Pipeline v2
1. Face alignment + crop (OpenCV)
2. FLUX i2i (remove acne, blue background, white shirt, lighting)
3. Face restore (GFPGAN)

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


# ── Step 1: Face Detection + Alignment + Crop ──────
def face_align_and_crop(input_path):
    """Detect face, align, crop to passport ratio (35x45mm)."""
    img = cv2.imread(input_path)
    if img is None:
        print("❌ Cannot read input image"); sys.exit(1)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]

    # Detect face
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(80, 80))

    if len(faces) == 0:
        print("⚠️  No face detected, using full image"); return input_path

    # Get largest face
    x, y, fw, fh = max(faces, key=lambda f: f[2]*f[3])
    print(f"🔍 Face detected: ({x},{y}) {fw}x{fh}")

    # Passport crop ratio: 35:45
    target_ratio = 35.0 / 45.0
    face_center_x = x + fw // 2
    face_center_y = y + fh // 2

    # Face occupies ~40% of crop height (passport standard)
    crop_h = int(fh / 0.40)
    crop_w = int(crop_h * target_ratio)

    # Center on face horizontally, face at ~30% from top
    crop_x1 = max(0, face_center_x - crop_w // 2)
    crop_y1 = max(0, int(face_center_y - crop_h * 0.30))

    if crop_x1 + crop_w > w: crop_x1 = w - crop_w
    if crop_y1 + crop_h > h: crop_y1 = h - crop_h
    crop_x1 = max(0, crop_x1)
    crop_y1 = max(0, crop_y1)

    cropped = img[crop_y1:crop_y1+crop_h, crop_x1:crop_x1+crop_w]
    resized = cv2.resize(cropped, (354, 450), interpolation=cv2.INTER_LANCZOS4)

    out_path = os.path.join(WORK_DIR, "step1_cropped.jpg")
    cv2.imwrite(out_path, resized, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"✅ Step 1: Cropped to {resized.shape[1]}x{resized.shape[0]}")
    return out_path


# ── Step 2: FLUX i2i ──────────────────────────────
def parse_multipart_response(resp_data, ct):
    """Parse multipart response, return (json_job, image_bytes) or (None, None)."""
    job_info = None
    image_bytes = None

    boundary_match = re.search(r'boundary=([^\s;]+)', ct)
    if not boundary_match:
        # Could be raw image
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


def flux_i2i(input_path):
    """Send to Prodia FLUX i2i with passport photo prompt."""
    PROMPT = (
        "professional passport photo, person wearing a clean white formal dress shirt, "
        "smooth clear skin with no blemishes or acne, straight centered face facing camera directly, "
        "bright even studio lighting, soft light blue pastel background, "
        "high resolution sharp focus, official government ID photo style, "
        "natural skin tone, professional retouching"
    )

    print(f"\n📤 Step 2: FLUX i2i — {input_path}")

    BOUNDARY = "----ProdiaBoundaryAI2026"
    job_json = json.dumps({
        "type": "inference.flux-2.klein.4b.img2img.v1",
        "config": {"prompt": PROMPT, "steps": 4, "strength": 0.65}
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
    with open(input_path, "rb") as f:
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
        if state == "failed":
            print(f"   ❌ Error: {job_info.get('error', 'unknown')}")
            sys.exit(1)

    if image_bytes:
        out_path = os.path.join(WORK_DIR, "step2_flux.jpg")
        with open(out_path, "wb") as f:
            f.write(image_bytes)
        print(f"✅ Step 2: FLUX i2i output ({len(image_bytes)} bytes)")
        return out_path

    print("❌ No image in response")
    sys.exit(1)


# ── Step 3: Face Restore (GFPGAN) ─────────────────
def face_restore(input_path):
    """Restore face with GFPGAN + final enhancements."""
    try:
        from gfpgan import GFPGANer
    except ImportError:
        print("⚠️  GFPGAN not installed, skipping"); return input_path

    print(f"\n📤 Step 3: GFPGAN Face Restore — {input_path}")

    restorer = GFPGANer(
        model_path=os.path.expanduser("~/.cache/gfpgan/GFPGANv1.4.pth"),
        upscale=1, arch="clean", channel_multiplier=2,
        bg_upsampler=None
    )

    img = cv2.imread(input_path)
    if img is None:
        print("❌ Cannot read FLUX output"); sys.exit(1)

    _, _, output = restorer.enhance(img, has_aligned=False, only_center_face=False, paste_back=True)

    # CLAHE
    result = cv2.cvtColor(output, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(result)
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
    l = clahe.apply(l)
    result = cv2.merge([l, a, b])
    output = cv2.cvtColor(result, cv2.COLOR_LAB2BGR)

    # Denoise
    output = cv2.fastNlMeansDenoisingColored(output, None, 3, 3, 7, 21)

    # Brightness +2%
    hsv = cv2.cvtColor(output, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 2] = np.clip(hsv[:, :, 2] * 1.02, 0, 255)
    output = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    out_path = os.path.join(WORK_DIR, "passport_final.jpg")
    cv2.imwrite(out_path, output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"✅ Step 3: Final output saved")
    return out_path


# ── Main Pipeline ──────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  Passport Photo AI Pipeline v2")
    print("  FLUX i2i + Face Align + GFPGAN")
    print("=" * 60)
    print(f"  Input: {INPUT}")
    print()

    step1 = face_align_and_crop(INPUT)
    step2 = flux_i2i(step1)
    final = face_restore(step2)

    print()
    print("=" * 60)
    print(f"  🎉 Final passport photo: {final}")
    print("=" * 60)
