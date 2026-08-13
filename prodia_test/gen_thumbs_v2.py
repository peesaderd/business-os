#!/usr/bin/env python3
"""Generate clothing thumbnails with proper auth header."""
import requests, os, sys, time

# Parse PRODIA_TOKEN properly (line by line)
PRODIA_TOKEN = ""
for line in open("/home/openhands/erp-stack/.env"):
    if line.startswith("PRODIA_TOKEN="):
        PRODIA_TOKEN = line.split("=", 1)[1].strip()
        break

API_URL = "https://inference.prodia.com/v2/job"
HEADERS = {"Authorization": f"Bearer {PRODIA_TOKEN}"}
OUT_DIR = "/home/openhands/erp-stack/frontend/passport/img"

ITEMS = [
    {"out": "clothing/male/white_shirt.png",   "prompt": "professional white formal dress shirt on mannequin torso, clean studio photo, white background, product photography, crisp collar, neat buttons, no person, no head, no arms"},
    {"out": "clothing/male/blue_shirt.png",    "prompt": "professional light blue formal dress shirt on mannequin torso, clean studio photo, white background, product photography, crisp collar, neat buttons, no person, no head, no arms"},
    {"out": "clothing/male/black_suit.png",    "prompt": "professional black business suit jacket with white shirt on mannequin torso, clean studio photo, white background, product photography, formal attire, no person, no head"},
    {"out": "clothing/male/gray_blazer.png",   "prompt": "professional gray blazer jacket with white shirt on mannequin torso, clean studio photo, white background, product photography, business casual, no person, no head"},
    {"out": "clothing/male/navy_suit.png",     "prompt": "professional navy blue business suit with white shirt on mannequin torso, clean studio photo, white background, product photography, formal attire, no person, no head"},
    {"out": "clothing/female/white_blouse.png",    "prompt": "professional white women blouse on female mannequin torso, clean studio photo, white background, product photography, elegant neckline, no person, no head, no arms"},
    {"out": "clothing/female/pink_blouse.png",     "prompt": "professional soft pink women blouse on female mannequin torso, clean studio photo, white background, product photography, elegant neckline, no person, no head"},
    {"out": "clothing/female/blue_blouse.png",     "prompt": "professional light blue women blouse on female mannequin torso, clean studio photo, white background, product photography, elegant neckline, no person, no head"},
    {"out": "clothing/female/black_top.png",       "prompt": "professional black women formal top on female mannequin torso, clean studio photo, white background, product photography, elegant, no person, no head"},
    {"out": "clothing/female/white_turtleneck.png","prompt": "professional white women turtleneck sweater on female mannequin torso, clean studio photo, white background, product photography, no person, no head"},
    {"out": "bg/light_blue.png",  "prompt": "solid light sky blue background, uniform color, no texture, passport photo background, #C4DCFF color"},
    {"out": "bg/white.png",       "prompt": "solid pure white background, uniform color, no texture, passport photo background"},
    {"out": "bg/light_gray.png",  "prompt": "solid light gray background, uniform color, no texture, passport photo background, #F0F0F0"},
]

def generate(prompt, out_path, retries=2):
    job = {"type": "inference.flux-fast.schnell.txt2img.v2", "config": {"prompt": prompt}}
    for attempt in range(retries + 1):
        try:
            r = requests.post(API_URL, json=job, headers=HEADERS, timeout=60)
            if r.status_code == 200 and "image" in r.headers.get("content-type", ""):
                with open(out_path, "wb") as f:
                    f.write(r.content)
                print(f"  OK {out_path} ({os.path.getsize(out_path)} bytes)")
                return True
            else:
                print(f"  ERR {r.status_code}: {r.text[:80]}")
        except Exception as e:
            print(f"  ERR: {e}")
        if attempt < retries: time.sleep(2)
    return False

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ok = 0
    for i, item in enumerate(ITEMS):
        path = os.path.join(OUT_DIR, item["out"])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print(f"[{i+1}/{len(ITEMS)}] {item['out']}")
        if generate(item["prompt"], path): ok += 1
        time.sleep(0.3)
    print(f"\nDone: {ok}/{len(ITEMS)}")
    return ok == len(ITEMS)

if __name__ == "__main__":
    sys.exit(0 if main() else 1)
