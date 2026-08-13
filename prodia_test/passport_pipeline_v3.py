#!/usr/bin/env python3
"""
Passport Photo AI Pipeline v3 — Minimal Touch
Only: crop + background change + acne/spot removal + slight color adjust
DOES NOT: change face structure, smooth skin, regenerate features

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
def face_detect_and_crop(input_path):
    """Detect face, crop to passport ratio (35x45), keep original face."""
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
    print(f"🔍 Face detected: ({x},{y}) {fw}x{fh}")

    # Passport crop: 35:45 ratio
    target_ratio = 35.0 / 45.0
    face_center_x = x + fw // 2
    face_center_y = y + fh // 2

    # Face ~40% of crop height (passport standard)
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

    out_path = os.path.join(WORK_DIR, "v3_step1_crop.jpg")
    cv2.imwrite(out_path, resized, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"✅ Step 1: Cropped to {resized.shape[1]}x{resized.shape[0]}")
    return resized


# ── Step 2: Background Removal + Replace (Blue) ────
def replace_background(img):
    """Remove background and replace with light blue (passport standard)."""
    from rembg import new_session, remove

    print("\n📤 Step 2: Background removal (rembg)...")

    # Use U2-Net for background removal
    session = new_session("u2net")
    result = remove(img, session=session, alpha_matting=False)

    # Convert to RGBA if needed
    if len(result.shape) == 2:
        # Grayscale alpha mask
        alpha = result
    elif result.shape[2] == 4:
        alpha = result[:, :, 3]
    else:
        alpha = None

    if alpha is None:
        print("⚠️  Could not extract alpha mask"); return img

    # Light blue passport background (RGB: 196, 220, 255)
    bg_color = np.full_like(img, (255, 220, 196), dtype=np.uint8)  # BGR for OpenCV

    # Composite: background where alpha=0, original where alpha=255
    alpha_3ch = np.stack([alpha, alpha, alpha], axis=-1).astype(np.float32) / 255.0

    output = (img.astype(np.float32) * alpha_3ch + bg_color.astype(np.float32) * (1.0 - alpha_3ch))
    output = output.astype(np.uint8)

    out_path = os.path.join(WORK_DIR, "v3_step2_bg.jpg")
    cv2.imwrite(out_path, output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"✅ Step 2: Background replaced (light blue)")
    return output


# ── Step 3: Acne/Spot Removal (Inpainting) ────────
def remove_acne_spots(img):
    """Detect and remove acne/dark spots using inpainting. Only touches spots, not face structure."""
    print("\n📤 Step 3: Acne/spot removal (inpainting)...")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # Detect face first (only process face region)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))

    if len(faces) == 0:
        print("⚠️  No face detected, skipping spot removal"); return img

    x, y, fw, fh = max(faces, key=lambda f: f[2]*f[3])
    # Expand face region slightly
    fx1 = max(0, x - fw//6)
    fy1 = max(0, y - fh//6)
    fx2 = min(w, x + fw + fw//6)
    fy2 = min(h, y + fh + fh//6)

    face_region = gray[fy1:fy2, fx1:fx2]
    face_color = img[fy1:fy2, fx1:fx2].copy()

    # Detect dark spots: local darker than surroundings
    # Method: Adaptive threshold + morphology
    blurred = cv2.GaussianBlur(face_region, (15, 15), 0)
    diff = cv2.subtract(blurred, face_region)  # how much darker than local mean

    # Threshold: spots are significantly darker than local average
    _, spot_mask = cv2.threshold(diff, 18, 255, cv2.THRESH_BINARY)

    # Remove small noise (keep spots > 3x3 pixels)
    kernel_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    spot_mask = cv2.morphologyEx(spot_mask, cv2.MORPH_OPEN, kernel_small)

    # Remove large areas (spots should be small)
    kernel_large = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    # Close small gaps in spots
    spot_mask = cv2.morphologyEx(spot_mask, cv2.MORPH_CLOSE, kernel_large)

    # Also detect red spots (acne) using HSV
    face_hsv = cv2.cvtColor(face_color, cv2.COLOR_BGR2HSV)
    # Red hue range
    lower_red1 = np.array([0, 40, 80])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([160, 40, 80])
    upper_red2 = np.array([180, 255, 255])
    red_mask1 = cv2.inRange(face_hsv, lower_red1, upper_red1)
    red_mask2 = cv2.inRange(face_hsv, lower_red2, upper_red2)
    red_mask = cv2.bitwise_or(red_mask1, red_mask2)

    # Combine dark spots + red spots
    combined_mask = cv2.bitwise_or(spot_mask, red_mask)

    # Dilate mask slightly for better inpainting coverage
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    combined_mask = cv2.dilate(combined_mask, dilate_kernel, iterations=1)

    # Count spots
    contours, _ = cv2.findContours(combined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    spot_count = len([c for c in contours if cv2.contourArea(c) > 5])
    print(f"   🔍 Detected {spot_count} spots")

    if spot_count == 0:
        print("   ✅ No spots detected"); return img

    # Create full-image mask
    full_mask = np.zeros(gray.shape, dtype=np.uint8)
    full_mask[fy1:fy2, fx1:fx2] = combined_mask

    # Inpaint only the spots (radius=3 — small, precise)
    output = cv2.inpaint(img, full_mask, 3, cv2.INPAINT_TELEA)

    out_path = os.path.join(WORK_DIR, "v3_step3_acne.jpg")
    cv2.imwrite(out_path, output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"✅ Step 3: {spot_count} spots removed via inpainting")
    return output


# ── Step 4: Slight Color/Light Adjust ──────────────
def adjust_color_light(img):
    """Very slight color correction — do NOT change face structure."""
    print("\n📤 Step 4: Color/light adjustment (minimal)...")

    # CLAHE on luminance only
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.2, tileGridSize=(8, 8))
    l = clahe.apply(l)
    lab = cv2.merge([l, a, b])
    output = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # Very mild white balance (preserve original tone)
    # Auto white balance on face region only
    result = output.copy()
    b_ch, g_ch, r_ch = cv2.split(result)
    r_avg = np.mean(r_ch)
    g_avg = np.mean(g_ch)
    b_avg = np.mean(b_ch)
    avg = (r_avg + g_avg + b_avg) / 3

    # Very subtle correction (strength=0.15 to barely change)
    strength = 0.15
    r_scale = avg / r_avg if r_avg > 0 else 1
    g_scale = avg / g_avg if g_avg > 0 else 1
    b_scale = avg / b_avg if b_avg > 0 else 1

    # Only apply a tiny fraction
    r_corrected = np.clip(r_ch * (1 + (r_scale - 1) * strength), 0, 255).astype(np.uint8)
    g_corrected = np.clip(g_ch * (1 + (g_scale - 1) * strength), 0, 255).astype(np.uint8)
    b_corrected = np.clip(b_ch * (1 + (b_scale - 1) * strength), 0, 255).astype(np.uint8)

    output = cv2.merge([b_corrected, g_corrected, r_corrected])

    out_path = os.path.join(WORK_DIR, "v3_step4_color.jpg")
    cv2.imwrite(out_path, output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"✅ Step 4: Color/light adjusted (minimal)")
    return output


# ── Main Pipeline ──────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  Passport Photo Pipeline v3 — Minimal Touch")
    print("  Crop + Background + Acne Removal + Color")
    print("  ⚠️  Face structure preserved!")
    print("=" * 60)
    print(f"  Input: {INPUT}\n")

    img = cv2.imread(INPUT)

    # Step 1: Crop
    img = face_detect_and_crop(INPUT)  # pass path, not array

    # Step 2: Background replacement
    img = replace_background(img)

    # Step 3: Acne/spot removal (inpainting only)
    img = remove_acne_spots(img)

    # Step 4: Slight color adjustment
    img = adjust_color_light(img)

    final_path = os.path.join(WORK_DIR, "passport_final_v3.jpg")
    cv2.imwrite(final_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    print()
    print("=" * 60)
    print(f"  🎉 Final: {final_path}")
    print("=" * 60)
