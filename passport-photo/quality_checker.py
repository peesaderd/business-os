"""
Quality checks for passport photos.
Validates face size, position, lighting, and other requirements.
"""

import cv2
import numpy as np
from typing import Optional, Tuple


class QualityResult:
    """Result of a quality check."""

    def __init__(self):
        self.passed = True
        self.issues = []
        self.warnings = []
        self.face_box: Optional[Tuple[int, int, int, int]] = None
        self.face_center: Optional[Tuple[int, int]] = None
        self.confidence: float = 0.0

    def add_issue(self, msg: str):
        self.passed = False
        self.issues.append(msg)

    def add_warning(self, msg: str):
        self.warnings.append(msg)

    def to_dict(self):
        return {
            "passed": self.passed,
            "issues": self.issues,
            "warnings": self.warnings,
            "face_detected": self.face_box is not None,
            "confidence": round(self.confidence, 2),
        }


# Load face detector cascade
_face_cascade = None


def _get_face_cascade():
    global _face_cascade
    if _face_cascade is None:
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _face_cascade = cv2.CascadeClassifier(cascade_path)
    return _face_cascade


def detect_faces(image: np.ndarray) -> list:
    """
    Detect faces in image using OpenCV Haar Cascade.
    Returns list of (x, y, w, h) bounding boxes.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade = _get_face_cascade()
    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(50, 50),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )
    return [tuple(f) for f in faces] if len(faces) > 0 else []


def check_image_quality(
    image: np.ndarray,
    target_width_px: int,
    target_height_px: int,
    face_height_range_px: Tuple[int, int] = (250, 350),
) -> QualityResult:
    """
    Run quality checks on a passport photo.

    Args:
        image: BGR image (OpenCV format)
        target_width_px: Target width in pixels
        target_height_px: Target height in pixels
        face_height_range_px: (min, max) face height in pixels

    Returns:
        QualityResult with issues/warnings
    """
    result = QualityResult()
    h, w = image.shape[:2]

    # 1. Check minimum resolution
    if w < 600 or h < 600:
        result.add_warning(f"Low resolution: {w}x{h}px. Recommend at least 1200x1200px.")

    # 2. Check aspect ratio
    target_ratio = target_width_px / target_height_px
    actual_ratio = w / h
    if abs(actual_ratio - target_ratio) > 0.1:
        result.add_warning(
            f"Aspect ratio mismatch: {actual_ratio:.2f} vs target {target_ratio:.2f}"
        )

    # 3. Detect faces
    faces = detect_faces(image)
    if len(faces) == 0:
        result.add_issue("No face detected in the image.")
        return result

    if len(faces) > 1:
        result.add_warning(f"Multiple faces detected ({len(faces)}). Using largest face.")

    # Get largest face
    largest = max(faces, key=lambda f: f[2] * f[3])
    fx, fy, fw, fh = largest
    result.face_box = (fx, fy, fw, fh)
    result.face_center = (fx + fw // 2, fy + fh // 2)
    result.confidence = min(1.0, (fw * fh) / (w * h) * 3)

    # 4. Check face size (relative to image, not target)
    face_ratio = fh / h  # Face height as % of image height
    if face_ratio < 0.15:
        result.add_warning(f"Face may be too small relative to frame ({face_ratio:.0%}).")
    elif face_ratio > 0.7:
        result.add_warning(f"Face may be too large relative to frame ({face_ratio:.0%}).")
    else:
        result.passed = True  # Face size is acceptable

    # 5. Check face position (centered horizontally)
    face_center_x = fx + fw / 2
    center_tolerance = w * 0.2
    if abs(face_center_x - w / 2) > center_tolerance:
        result.add_warning("Face not centered horizontally. Will auto-center.")

    # Check vertical position - face should be in upper portion
    # (cropping will fix position, just check it's not completely off)
    if fy > h * 0.8:
        result.add_warning("Face very low in frame. Cropping will adjust.")

    # 6. Check for sufficient headroom (in source image)
    # This is informational - cropping will add headspace
    headroom_ratio = fy / h
    if headroom_ratio < 0.05:
        result.add_warning("Limited headroom in source. System will add headspace during crop.")

    # 7. Lighting check (histogram analysis)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    hist = hist.flatten() / hist.sum()

    # Check if image is too dark or too bright
    dark_ratio = hist[:50].sum()
    bright_ratio = hist[205:].sum()

    if dark_ratio > 0.5:
        result.add_warning("Image appears too dark.")
    elif dark_ratio > 0.3:
        result.add_warning("Image may be underexposed.")

    if bright_ratio > 0.5:
        result.add_warning("Image appears too bright/overexposed.")

    # 8. Check sharpness (Laplacian variance)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    if laplacian_var < 50:
        result.add_warning("Image may be blurry (low sharpness).")

    return result
