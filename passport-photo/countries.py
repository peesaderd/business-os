"""
Passport photo specifications for various countries.
All measurements in mm, converted to pixels at 300 DPI.
"""

DPI = 300
MM_TO_PX = DPI / 25.4  # 300 DPI ≈ 11.81 px/mm

COUNTRIES = {
    "thailand": {
        "name": "ไทย (Thailand)",
        "width_mm": 35,
        "height_mm": 45,
        "face_height_mm": (25, 30),  # min, max face height
        "backgrounds": ["white", "blue"],
        "default_bg": "white",
    },
    "us": {
        "name": "สหรัฐอเมริกา (USA)",
        "width_mm": 51,
        "height_mm": 51,
        "face_height_mm": (22, 35),
        "backgrounds": ["white"],
        "default_bg": "white",
    },
    "japan": {
        "name": "ญี่ปุ่น (Japan)",
        "width_mm": 35,
        "height_mm": 45,
        "face_height_mm": (28, 32),
        "backgrounds": ["white"],
        "default_bg": "white",
    },
    "china": {
        "name": "จีน (China)",
        "width_mm": 33,
        "height_mm": 48,
        "face_height_mm": (28, 33),
        "backgrounds": ["white"],
        "default_bg": "white",
    },
    "eu": {
        "name": "สหภาพยุโรป (EU/Schengen)",
        "width_mm": 35,
        "height_mm": 45,
        "face_height_mm": (29, 34),
        "backgrounds": ["white", "light_gray"],
        "default_bg": "white",
    },
    "uk": {
        "name": "สหราชอาณาจักร (UK)",
        "width_mm": 35,
        "height_mm": 45,
        "face_height_mm": (29, 34),
        "backgrounds": ["white"],
        "default_bg": "white",
    },
    "australia": {
        "name": "ออสเตรเลีย (Australia)",
        "width_mm": 35,
        "height_mm": 45,
        "face_height_mm": (31, 36),
        "backgrounds": ["white"],
        "default_bg": "white",
    },
    "india": {
        "name": "อินเดีย (India)",
        "width_mm": 35,
        "height_mm": 45,
        "face_height_mm": (29, 34),
        "backgrounds": ["white"],
        "default_bg": "white",
    },
    "korea": {
        "name": "เกาหลีใต้ (South Korea)",
        "width_mm": 35,
        "height_mm": 45,
        "face_height_mm": (25, 35),
        "backgrounds": ["white", "light_gray"],
        "default_bg": "white",
    },
    "custom": {
        "name": "กำหนดเอง (Custom)",
        "width_mm": 35,
        "height_mm": 45,
        "face_height_mm": (25, 35),
        "backgrounds": ["white", "blue", "light_gray"],
        "default_bg": "white",
    },
}


def get_country_spec(country_id: str) -> dict:
    """Get passport photo spec for a country."""
    spec = COUNTRIES.get(country_id, COUNTRIES["custom"])
    spec["width_px"] = int(spec["width_mm"] * MM_TO_PX)
    spec["height_px"] = int(spec["height_mm"] * MM_TO_PX)
    spec["face_height_px"] = (
        int(spec["face_height_mm"][0] * MM_TO_PX),
        int(spec["face_height_mm"][1] * MM_TO_PX),
    )
    return spec


def list_countries() -> list:
    """List all available countries with their specs."""
    result = []
    for cid, spec in COUNTRIES.items():
        result.append({
            "id": cid,
            "name": spec["name"],
            "size": f"{spec['width_mm']}x{spec['height_mm']} mm",
            "backgrounds": spec["backgrounds"],
        })
    return result


# Background color presets (RGB tuples)
BG_COLORS = {
    "white": (255, 255, 255),
    "blue": (67, 142, 219),
    "light_gray": (230, 230, 230),
}
