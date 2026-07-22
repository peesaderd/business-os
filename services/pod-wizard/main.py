"""
POD Wizard — Backend API
Proxies Printful API (avoids CORS) + serves frontend
"""
import os, json, time, uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import httpx
import logging
import requests as sync_requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pod-wizard")

PRINTFUL_API_KEY = os.environ.get("PRINTFUL_API_KEY", "0T3HwM0uy7eOTQZx64QZL5yPtjMKw6wPFjvjjIbs")
PRINTFUL_BASE = "https://api.printful.com"

app = FastAPI(title="POD Wizard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

HEADERS = {"Authorization": f"Bearer {PRINTFUL_API_KEY}"}

# ─── Product Type → Category Mapping ───

TYPE_CATEGORIES = {
    "DECOR": {"name": "ตกแต่งบ้าน", "icon": "🏠", "slug": "decor"},
    "CUT-SEW": {"name": "เสื้อผ้า Cut & Sew", "icon": "👕", "slug": "cut-sew"},
    "DIRECT-TO-FABRIC": {"name": "ผ้า & สิ่งทอ", "icon": "🧵", "slug": "fabric"},
    "DTFILM": {"name": "DTF Film", "icon": "🎞️", "slug": "dtf"},
    "EMBROIDERY": {"name": "งานปัก", "icon": "🧶", "slug": "embroidery"},
    "PHONE-CASE": {"name": "เคสโทรศัพท์", "icon": "📱", "slug": "phone-case"},
}

# ─── Cache ───
_product_cache = {"data": None, "ts": 0}
CACHE_TTL = 300  # 5 minutes

async def _get_products(force=False):
    """Fetch products from Printful with caching"""
    now = time.time()
    if not force and _product_cache["data"] and (now - _product_cache["ts"]) < CACHE_TTL:
        return _product_cache["data"]

    async with httpx.AsyncClient() as client:
        all_products = []
        offset = 0
        while True:
            r = await client.get(
                f"{PRINTFUL_BASE}/products?limit=100&offset={offset}",
                headers=HEADERS, timeout=30
            )
            if r.status_code != 200:
                raise HTTPException(r.status_code, r.text[:200])
            data = r.json()
            batch = data.get("result", [])
            all_products.extend(batch)
            if len(batch) < 100:
                break
            offset += 100

        _product_cache["data"] = all_products
        _product_cache["ts"] = now
        return all_products

# ─── API Endpoints ───

@app.get("/api/pod/categories")
async def get_categories():
    """Get categories derived from Printful product types"""
    products = await _get_products()
    seen = set()
    cats = []
    for p in products:
        t = p.get("type", "OTHER")
        if t in seen:
            continue
        seen.add(t)
        info = TYPE_CATEGORIES.get(t, {"name": t, "icon": "📦", "slug": t.lower()})
        cats.append({
            "id": t,
            "name": info["name"],
            "icon": info["icon"],
            "slug": info["slug"],
            "count": sum(1 for x in products if x.get("type") == t)
        })
    return {"result": sorted(cats, key=lambda c: -c["count"])}

@app.get("/api/pod/products")
async def get_products(category_id: str = "", search: str = ""):
    """Get products, optionally filtered by type or search"""
    products = await _get_products()
    if category_id:
        products = [p for p in products if p.get("type") == category_id]
    if search:
        s = search.lower()
        products = [p for p in products if s in (p.get("name") or "").lower() or s in (p.get("description") or "").lower()]

    result = []
    for p in products:
        result.append({
            "id": p["id"],
            "name": p.get("title") or p.get("name", f"Product #{p['id']}"),
            "type": p.get("type", ""),
            "image": p.get("image", ""),
            "description": (p.get("description") or "")[:120],
            "variant_count": len(p.get("variants", [])),
            "price": _get_price(p.get("variants", []))
        })
    return {"result": result}

def _get_price(variants):
    """Get min price from variants"""
    prices = []
    for v in variants:
        if isinstance(v, dict):
            try:
                p = float(v.get("retail_price", 0) or v.get("price", 0))
                if p > 0:
                    prices.append(p)
            except (ValueError, TypeError):
                pass
    return min(prices) if prices else 0

@app.get("/api/pod/products/{product_id}")
async def get_product(product_id: int):
    """Get product details + variants"""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{PRINTFUL_BASE}/products/{product_id}", headers=HEADERS, timeout=30)
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text[:200])
        data = r.json()
        # Flatten
        product = data.get("result", {})
        p = product.get("product", product)
        variants = product.get("variants", [])
        return {
            "result": {
                "id": p.get("id", product_id),
                "name": p.get("title") or p.get("name", ""),
                "description": p.get("description", ""),
                "image": p.get("image", ""),
                "type": p.get("type", ""),
                "variants": [
                    {
                        "id": v["id"],
                        "name": v.get("name", f"Variant #{v['id']}"),
                        "size": v.get("size", ""),
                        "color": v.get("color", ""),
                        "price": float(v.get("retail_price", 0) or 0)
                    }
                    for v in variants if isinstance(v, dict)
                ]
            }
        }

@app.get("/api/pod/print-info/{product_id}")
async def get_print_info(product_id: int):
    """Get print area / template info"""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{PRINTFUL_BASE}/mockup-generator/printfiles/{product_id}",
            headers=HEADERS, timeout=30
        )
        if r.status_code != 200:
            # Try templates endpoint
            r2 = await client.get(
                f"{PRINTFUL_BASE}/mockup-generator/templates?id={product_id}",
                headers=HEADERS, timeout=30
            )
            if r2.status_code != 200:
                raise HTTPException(404, "No print info available")
            return r2.json()
        return r.json()

@app.post("/api/pod/mockup")
async def create_mockup(body: dict):
    """Create a mockup task"""
    product_id = body.get("product_id")
    variant_ids = body.get("variant_ids", [])
    files = body.get("files", [])
    if not product_id or not variant_ids:
        raise HTTPException(400, "Missing required fields: product_id, variant_ids")

    payload = {
        "variant_ids": variant_ids,
        "format": body.get("format", "jpg"),
        "files": files or [{"placement": "front"}]
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{PRINTFUL_BASE}/mockup-generator/create-task/{product_id}",
            headers=HEADERS, json=payload, timeout=60
        )
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text[:300])
        return r.json()

@app.get("/api/pod/mockup/status/{task_key}")
async def get_mockup_status(task_key: str):
    """Poll mockup task status"""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{PRINTFUL_BASE}/mockup-generator/task?task_key={task_key}",
            headers=HEADERS, timeout=30
        )
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text[:200])
        return r.json()

# ─── AI Design Generation ───

DESIGNS_DIR = "/var/www/podwizard/designs"

@app.post("/api/pod/generate-design")
async def generate_design(body: dict):
    """Generate a product design using PIL (fast, no external API)"""
    from PIL import Image, ImageDraw, ImageFont
    import math, random

    product_name = body.get("product_name", "Custom Design")
    style = body.get("style", "modern")

    os.makedirs(DESIGNS_DIR, exist_ok=True)
    filename = f"design_{uuid.uuid4().hex[:12]}.png"
    local_path = os.path.join(DESIGNS_DIR, filename)

    size = 1024
    img = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    # ── Generate geometric pattern based on product name hash ──
    seed = hash(product_name + style)
    random.seed(seed)
    rng = random.Random(seed)

    # Background: subtle pattern
    bg_color = (245, 245, 250, 255)
    draw.rectangle([0, 0, size, size], fill=bg_color)

    # Primary color from hash
    hue = abs(seed) % 360
    primary = _hsv_to_rgb(hue, 0.7, 0.9)
    secondary = _hsv_to_rgb((hue + 40) % 360, 0.5, 0.7)
    accent = _hsv_to_rgb((hue + 180) % 360, 0.8, 0.8)

    # Draw geometric shapes (circles, lines, triangles)
    cx, cy = size // 2, size // 2
    r = size * 0.38

    # Outer circle
    for i in range(3):
        offset = i * 15
        draw.ellipse([cx - r + offset, cy - r + offset, cx + r - offset, cy + r - offset],
                     outline=primary if i == 0 else secondary, width=8 - i * 2)

    # Inner geometric pattern
    for i in range(6):
        angle = i * 60 + abs(seed) % 20
        rad = math.radians(angle)
        x1 = cx + int(r * 0.6 * math.cos(rad))
        y1 = cy + int(r * 0.6 * math.sin(rad))
        x2 = cx + int(r * 0.9 * math.cos(rad + 0.3))
        y2 = cy + int(r * 0.9 * math.sin(rad + 0.3))
        draw.line([(x1, y1), (x2, y2)], fill=accent, width=6)

    # Dots
    for _ in range(12):
        angle = rng.uniform(0, 360)
        dist = rng.uniform(r * 0.2, r * 0.85)
        rad = math.radians(angle)
        dx = cx + int(dist * math.cos(rad))
        dy = cy + int(dist * math.sin(rad))
        dot_r = rng.randint(4, 12)
        draw.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r],
                     fill=secondary if rng.random() > 0.5 else accent)

    # Center circle (empty)
    cr = int(r * 0.25)
    draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr],
                 outline=primary, width=6, fill=(255, 255, 255, 200))

    # Initial letter watermark
    letter = product_name[0].upper() if product_name else "P"
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 180)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
    except Exception:
        font_large = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Letter in center
    bbox = draw.textbbox((0, 0), letter, font=font_large)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2), letter, fill=primary, font=font_large)

    # Style text bottom
    style_text = style.upper() if style else ""
    if style_text:
        bbox2 = draw.textbbox((0, 0), style_text, font=font_small)
        sw = bbox2[2] - bbox2[0]
        draw.text((cx - sw // 2, size - 80), style_text, fill=(180, 180, 190, 255), font=font_small)

    img.save(local_path, "PNG")
    public_url = f"https://podwizard.m2igen.com/designs/{filename}"
    return {"result": {"image_url": public_url, "prompt": f"{product_name} - {style}"}}


def _hsv_to_rgb(h, s, v):
    """Convert HSV to RGB tuple"""
    h = h / 60.0
    i = int(h)
    f = h - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))
    if i == 0: r, g, b = v, t, p
    elif i == 1: r, g, b = q, v, p
    elif i == 2: r, g, b = p, v, t
    elif i == 3: r, g, b = p, q, v
    elif i == 4: r, g, b = t, p, v
    else: r, g, b = v, p, q
    return (int(r * 255), int(g * 255), int(b * 255))

@app.get("/api/pod/health")
async def health():
    return {"status": "ok", "service": "pod-wizard", "cached_products": _product_cache["data"] is not None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8123)
