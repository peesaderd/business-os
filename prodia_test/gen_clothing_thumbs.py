#!/usr/bin/env python3
"""Generate clothing thumbnail images for Passport UI using Prodia FLUX Schnell (free)."""
import requests, os, sys, time, json

PRODIA_TOKEN = open("/home/openhands/erp-stack/.env").read().split("PRODIA_TOKEN=")[1].strip()
API_URL = "https://inference.prodia.com/v2/job"
OUT_DIR = "/home/openhands/erp-stack/frontend/passport/img"

# Clothing items to generate
ITEMS = [
    # Male clothing
    {"out": "clothing/male/white_shirt.png",   "prompt": "professional white formal dress shirt on mannequin torso, clean studio photo, white background, product photography, crisp collar, neat buttons, no person, no head, no arms"},
    {"out": "clothing/male/blue_shirt.png",    "prompt": "professional light blue formal dress shirt on mannequin torso, clean studio photo, white background, product photography, crisp collar, neat buttons, no person, no head, no arms"},
    {"out": "clothing/male/black_suit.png",    "prompt": "professional black business suit jacket with white shirt on mannequin torso, clean studio photo, white background, product photography, formal attire, no person, no head"},
    {"out": "clothing/male/gray_blazer.png",   "prompt": "professional gray blazer jacket with white shirt on mannequin torso, clean studio photo, white background, product photography, business casual, no person, no head"},
    {"out": "clothing/male/navy_suit.png",     "prompt": "professional navy blue business suit with white shirt on mannequin torso, clean studio photo, white background, product photography, formal attire, no person, no head"},
    # Female clothing
    {"out": "clothing/female/white_blouse.png",    "prompt": "professional white women blouse on female mannequin torso, clean studio photo, white background, product photography, elegant neckline, no person, no head, no arms"},
    {"out": "clothing/female/pink_blouse.png",     "prompt": "professional soft pink women blouse on female mannequin torso, clean studio photo, white background, product photography, elegant neckline, no person, no head"},
    {"out": "clothing/female/blue_blouse.png",     "prompt": "professional light blue women blouse on female mannequin torso, clean studio photo, white background, product photography, elegant neckline, no person, no head"},
    {"out": "clothing/female/black_top.png",       "prompt": "professional black women formal top on female mannequin torso, clean studio photo, white background, product photography, elegant, no person, no head"},
    {"out": "clothing/female/white_turtleneck.png","prompt": "professional white women turtleneck sweater on female mannequin torso, clean studio photo, white background, product photography, no person, no head"},
    # Backgrounds
    {"out": "bg/light_blue.png",  "prompt": "solid light sky blue background, uniform color, no texture, passport photo background, #C4DCFF color"},
    {"out": "bg/white.png",       "prompt": "solid pure white background, uniform color, no texture, passport photo background, #FFFFFF"},
    {"out": "bg/light_gray.png",  "prompt": "solid light gray background, uniform color, no texture, passport photo background, #F0F0F0"},
]

def generate_image(prompt: str, out_path: str, retries=2) -> bool:
    """Generate one image via Prodia FLUX Schnell (free, sync API)."""
    job = {"type": "inference.flux-fast.schnell.txt2img.v2", "config": {"prompt": prompt}}
    for attempt in range(retries + 1):
        try:
            r = requests.post(API_URL, json=job, timeout=60)
            if r.status_code == 200:
                ct = r.headers.get("content-type", "")
                if "image" in ct:
                    with open(out_path, "wb") as f:
                        f.write(r.content)
                    sz = os.path.getsize(out_path)
                    print(f"  ✅ {out_path} ({sz} bytes)")
                    return True
                else:
                    print(f"  ⚠️ Response not image: {ct}")
            else:
                print(f"  ⚠️ HTTP {r.status_code}: {r.text[:100]}")
        except Exception as e:
            print(f"  ❌ Error: {e}")
        if attempt < retries:
            time.sleep(2)
    return False

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    success = 0
    total = len(ITEMS)
    for i, item in enumerate(ITEMS):
        out_path = os.path.join(OUT_DIR, item["out"])
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        print(f"[{i+1}/{total}] Generating {item['out']}...")
        if generate_image(item["prompt"], out_path):
            success += 1
        time.sleep(0.5)  # rate limit
    print(f"\n🎯 Done: {success}/{total} images generated")
    return success == total

if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
