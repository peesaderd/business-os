#!/usr/bin/env python3
"""Quick test: generate passport photo and check headspace."""
import sys, os
sys.path.insert(0, "/home/openhands/erp-stack")

import cv2
import numpy as np
from modules.passport.ai_passport import (
    crop_passport, flux_i2i, resize_to_template, crop_to_template, detect_face, build_prompt
)

INPUT = "/home/openhands/erp-stack/modules/passport/storage/original_input.jpg"
WORK_DIR = "/home/openhands/.openclaw/workspace"

# Load input
img_bgr = cv2.imread(INPUT)
img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
print(f"Input: {img_rgb.shape[1]}x{img_rgb.shape[0]}")

# Step 1: Crop
cropped = crop_passport(img_rgb)
cv2.imwrite(f"{WORK_DIR}/test_headspace_step1_crop.jpg", cv2.cvtColor(cropped, cv2.COLOR_RGB2BGR))
print(f"Step 1 Crop: {cropped.shape[1]}x{cropped.shape[0]}")

face = detect_face(cropped)
if face is not None:
    x, y, w, h = face
    face_top_pct = y / cropped.shape[0] * 100
    print(f"  Face in crop: ({x},{y}) {w}x{h} — face top at {face_top_pct:.1f}% from top")
else:
    print("  No face detected in crop")

# Step 2: FLUX i2i
prompt = build_prompt("white formal dress shirt", "soft light blue background")
print(f"\nStep 2: FLUX i2i (strength=0.45)...")
generated = flux_i2i(cropped, prompt, strength=0.45)
cv2.imwrite(f"{WORK_DIR}/test_headspace_step2_flux.jpg", cv2.cvtColor(generated, cv2.COLOR_RGB2BGR))
print(f"Step 2 FLUX: {generated.shape[1]}x{generated.shape[0]}")

face2 = detect_face(generated)
if face2 is not None:
    x, y, w, h = face2
    face_top_pct = y / generated.shape[0] * 100
    print(f"  Face in FLUX output: ({x},{y}) {w}x{h} — face top at {face_top_pct:.1f}% from top")
else:
    print("  No face detected in FLUX output")

# Step 3: Resize to template (2.5x)
template = {"width_mm": 35, "height_mm": 45}
resized = resize_to_template(generated, 35, 45, 300, generate_scale=2.5)
cv2.imwrite(f"{WORK_DIR}/test_headspace_step3_resized.jpg", cv2.cvtColor(resized, cv2.COLOR_RGB2BGR))
print(f"Step 3 Resize: {resized.shape[1]}x{resized.shape[0]}")

face3 = detect_face(resized)
if face3 is not None:
    x, y, w, h = face3
    face_top_pct = y / resized.shape[0] * 100
    print(f"  Face in resized: ({x},{y}) {w}x{h} — face top at {face_top_pct:.1f}% from top")
else:
    print("  No face detected in resized")

# Step 4: Crop to final
final = crop_to_template(resized, template, 300)
cv2.imwrite(f"{WORK_DIR}/test_headspace_step4_final.jpg", cv2.cvtColor(final, cv2.COLOR_RGB2BGR))
print(f"\nStep 4 Final: {final.shape[1]}x{final.shape[0]}")

face4 = detect_face(final)
if face4 is not None:
    x, y, w, h = face4
    face_top_pct = y / final.shape[0] * 100
    headspace_pct = face_top_pct
    print(f"  Face in final: ({x},{y}) {w}x{h}")
    print(f"  ✅ Headspace: {headspace_pct:.1f}% from top (target: 20%)")
else:
    print("  ⚠️ No face detected in final")

print(f"\nDone! Files saved to {WORK_DIR}/test_headspace_*.jpg")
