#!/usr/bin/env python3
"""Test crop_passport with face at different positions to verify headspace."""
import sys
sys.path.insert(0, "/home/openhands/erp-stack")
import cv2
import numpy as np
from modules.passport.ai_passport import crop_passport, detect_face

INPUT = "/home/openhands/erp-stack/modules/passport/storage/original_input.jpg"
img_bgr = cv2.imread(INPUT)
img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

print(f"Original: {img_rgb.shape[1]}x{img_rgb.shape[0]}")
face = detect_face(img_rgb)
if face is not None:
    x, y, w, h = face
    print(f"Face in original: ({x},{y}) {w}x{h} — face top at {y/img_rgb.shape[0]*100:.1f}% from top")

cropped = crop_passport(img_rgb)
print(f"\nCropped: {cropped.shape[1]}x{cropped.shape[0]}")
face2 = detect_face(cropped)
if face2 is not None:
    x, y, w, h = face2
    pct = y / cropped.shape[0] * 100
    print(f"Face in crop: ({x},{y}) {w}x{h} — face top at {pct:.1f}% from top")
    print(f"  → {'OK (≥15%)' if pct >= 15 else '⚠️ TOO TIGHT (<15%)'}")

# Also check: what if face is very high (simulated)
print("\n--- Simulated: face at 5% from top ---")
fake = np.zeros((1000, 800, 3), dtype=np.uint8)
# Draw a face-like ellipse at y=50 (5% from top)
cv2.ellipse(fake, (400, 100), (80, 100), 0, 0, 360, (180, 140, 120), -1)
cv2.imwrite("/home/openhands/.openclaw/workspace/fake_face.jpg", fake)
cropped_fake = crop_passport(fake)
face3 = detect_face(cropped_fake)
if face3 is not None:
    x, y, w, h = face3
    pct = y / cropped_fake.shape[0] * 100
    print(f"Face in crop: ({x},{y}) {w}x{h} — face top at {pct:.1f}% from top")
    print(f"  → {'OK (≥15%)' if pct >= 15 else '⚠️ TOO TIGHT (<15%)'}")
else:
    print("No face detected in fake image")
