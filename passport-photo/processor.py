"""
Core passport photo processor.
Handles face detection, background removal, cropping, and resizing.
"""

import os
import uuid
import cv2
import numpy as np
from PIL import Image, ImageDraw
from typing import Optional, Tuple
from rembg import remove as rembg_remove

from countries import get_country_spec, BG_COLORS, DPI
from quality_checker import detect_faces, check_image_quality


class PassportProcessor:
    """Process images into passport-standard photos."""

    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def process(
        self,
        image_path: str,
        country: str = "thailand",
        background: str = "white",
        custom_width_mm: Optional[int] = None,
        custom_height_mm: Optional[int] = None,
        print_sheet: bool = True,
    ) -> dict:
        """
        Process an image into passport photo(s).

        Args:
            image_path: Path to input image
            country: Country code (e.g., 'thailand', 'us')
            background: Background color name
            custom_width_mm: Custom width (for 'custom' country)
            custom_height_mm: Custom height (for 'custom' country)
            print_sheet: Also generate 4x6" print sheet

        Returns:
            dict with output file paths and quality info
        """
        job_id = str(uuid.uuid4())[:8]

        # Load image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")

        # Get country spec
        spec = get_country_spec(country)
        if country == "custom" and custom_width_mm and custom_height_mm:
            from countries import MM_TO_PX
            spec["width_mm"] = custom_width_mm
            spec["height_mm"] = custom_height_mm
            spec["width_px"] = int(custom_width_mm * MM_TO_PX)
            spec["height_px"] = int(custom_height_mm * MM_TO_PX)

        # Quality check
        quality = check_image_quality(
            img, spec["width_px"], spec["height_px"], spec["face_height_px"]
        )

        if not quality.passed:
            return {
                "job_id": job_id,
                "success": False,
                "quality": quality.to_dict(),
                "message": "Quality check failed",
            }

        # Step 1: Remove background
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(img_rgb)

        # Use rembg for background removal - gentle settings to preserve facial features
        try:
            nobg_img = rembg_remove(
                pil_img,
                alpha_matting=True,
                alpha_matting_foreground_threshold=200,
                alpha_matting_background_threshold=10,
                alpha_matting_erode_size=0,  # No erosion - preserves beard/hair
            )
        except Exception as e:
            # Fallback: use original with no background removal
            print(f"Warning: rembg failed ({e}), using original")
            nobg_img = pil_img.convert("RGBA")

        # Step 2: Replace background with solid color
        bg_color = BG_COLORS.get(background, BG_COLORS["white"])
        final_bg = Image.new("RGBA", nobg_img.size, (*bg_color, 255))
        final_bg.paste(nobg_img, (0, 0), nobg_img)

        # Step 3: Crop to passport dimensions (face-centered)
        final_photo = self._crop_face_centered(
            final_bg, spec["width_px"], spec["height_px"], quality
        )

        # Step 4: Generate outputs
        outputs = {}

        # Single photo
        single_path = os.path.join(self.output_dir, f"{job_id}_single.png")
        final_photo.save(single_path, dpi=(DPI, DPI))
        outputs["single"] = single_path

        # JPEG version
        jpeg_path = os.path.join(self.output_dir, f"{job_id}_single.jpg")
        final_photo.convert("RGB").save(jpeg_path, quality=95, dpi=(DPI, DPI))
        outputs["jpeg"] = jpeg_path

        # Print sheet (4x6 inches = 102x152mm)
        if print_sheet:
            sheet_path = self._create_print_sheet(
                final_photo, spec, job_id
            )
            outputs["print_sheet"] = sheet_path

        return {
            "job_id": job_id,
            "success": True,
            "quality": quality.to_dict(),
            "outputs": outputs,
            "country": country,
            "background": background,
            "dimensions": {
                "width_mm": spec["width_mm"],
                "height_mm": spec["height_mm"],
                "width_px": spec["width_px"],
                "height_px": spec["height_px"],
            },
        }

    def _crop_face_centered(
        self,
        img: Image.Image,
        target_w: int,
        target_h: int,
        quality,
    ) -> Image.Image:
        """Crop image to target dimensions with proper headspace.
        
        Passport standard:
        - Top of head: ~10-15% from top of photo
        - Eyes: ~50-55% from top of photo  
        - Chin: ~75-80% from top of photo
        - Face width: ~50-70% of photo width
        """
        src_w, src_h = img.size

        if quality.face_center is None:
            # No face detected, center crop with slight upward bias
            cx, cy = src_w // 2, int(src_h * 0.45)
        else:
            cx, cy = quality.face_center
            # Use top of face box for headspace calculation
            if quality.face_box:
                fx, fy, fw, fh = quality.face_box
                face_top = fy
                face_bottom = fy + fh
            else:
                face_top = cy - 50
                face_bottom = cy + 50

        # Calculate crop to target aspect ratio
        crop_ratio = target_h / target_w
        src_ratio = src_h / src_w

        if src_ratio > crop_ratio:
            # Source is taller than target - crop height
            new_h = src_w * crop_ratio
            new_w = src_w
            
            # Position face so top of head is ~12% from top
            # face_top should be at new_h * 0.12
            target_face_top = new_h * 0.12
            y_offset = max(0, face_top - target_face_top)
            y_offset = min(y_offset, src_h - new_h)

            left = 0
            right = src_w
            top = int(y_offset)
            bottom = int(y_offset + new_h)
        else:
            # Source is wider than target - crop width
            new_w = src_h / crop_ratio
            new_h = src_h
            
            x_offset = cx - new_w / 2
            x_offset = max(0, min(x_offset, src_w - new_w))

            left = int(x_offset)
            right = int(x_offset + new_w)
            top = 0
            bottom = src_h

        cropped = img.crop((left, top, right, bottom))

        # Resize to exact target dimensions
        cropped = cropped.resize((target_w, target_h), Image.LANCZOS)

        return cropped

    def _create_print_sheet(
        self,
        photo: Image.Image,
        spec: dict,
        job_id: str,
    ) -> str:
        """
        Create a 4x6 inch (102x152mm) print sheet with multiple photos.
        """
        # 4x6 inches at 300 DPI = 1200x1800 px
        sheet_w, sheet_h = 1200, 1800
        sheet = Image.new("RGB", (sheet_w, sheet_h), (255, 255, 255))

        photo_w, photo_h = photo.size

        # Calculate margins and spacing
        margin_x = 30  # 10px margin
        margin_y = 30
        spacing_x = 20
        spacing_y = 20

        # How many photos fit?
        cols = (sheet_w - 2 * margin_x + spacing_x) // (photo_w + spacing_x)
        rows = (sheet_h - 2 * margin_y + spacing_y) // (photo_h + spacing_y)

        # Center the grid
        total_grid_w = cols * photo_w + (cols - 1) * spacing_x
        total_grid_h = rows * photo_h + (rows - 1) * spacing_y
        start_x = (sheet_w - total_grid_w) // 2
        start_y = (sheet_h - total_grid_h) // 2

        photo_rgb = photo.convert("RGB")

        for r in range(rows):
            for c in range(cols):
                x = start_x + c * (photo_w + spacing_x)
                y = start_y + r * (photo_h + spacing_y)
                sheet.paste(photo_rgb, (x, y))

        # Add crop marks (light gray lines at photo boundaries)
        draw = ImageDraw.Draw(sheet)
        mark_len = 15
        mark_color = (180, 180, 180)

        for r in range(rows):
            for c in range(cols):
                x = start_x + c * (photo_w + spacing_x)
                y = start_y + r * (photo_h + spacing_y)

                # Corner marks (top-left, top-right, bottom-left, bottom-right)
                corners = [
                    (x, y),  # top-left
                    (x + photo_w, y),  # top-right
                    (x, y + photo_h),  # bottom-left
                    (x + photo_w, y + photo_h),  # bottom-right
                ]

                for cx, cy in corners:
                    # Horizontal mark
                    draw.line([(cx - mark_len, cy), (cx + mark_len, cy)], fill=mark_color)
                    # Vertical mark
                    draw.line([(cx, cy - mark_len), (cx, cy + mark_len)], fill=mark_color)

        # Save
        sheet_path = os.path.join(self.output_dir, f"{job_id}_print_sheet.png")
        sheet.save(sheet_path, dpi=(DPI, DPI))
        return sheet_path


def process_photo(
    image_path: str,
    country: str = "thailand",
    background: str = "white",
    **kwargs,
) -> dict:
    """Convenience function to process a passport photo."""
    processor = PassportProcessor()
    return processor.process(image_path, country, background, **kwargs)
