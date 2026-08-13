"""
POD Wizard — Unified Backend API
Merged: Printful proxy + POD Wizard + AI Assistant + Rules Validator + Payment
"""
import os
import sys
import json
import time
import uuid
import sqlite3
import logging
import math
import random
from pathlib import Path
from datetime import datetime
from typing import Optional
from io import BytesIO
import base64

import httpx
import requests as sync_requests
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, validator

# ─── Logging ────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pod-wizard")

# ─── .env Loading (own .env → fallback to erp-stack .env files) ─────────────

def _load_env_file(env_path: str):
    """Load key=value pairs from a .env file into os.environ (no overwrite)."""
    if not os.path.exists(env_path):
        return
    for line in open(env_path).read().split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            k, v = line.split('=', 1)
            k = k.strip()
            v = v.strip()
            if k and k not in os.environ:
                os.environ[k] = v

_my_env = os.path.join(os.path.dirname(__file__), '.env')
_fallback_env1 = os.path.join(os.path.dirname(__file__), '..', '..', 'erp-stack', 'etsy-wizard', '.env')
_fallback_env2 = os.path.join(os.path.dirname(__file__), '..', '..', 'erp-stack', 'tiktok-ugc-studio', '.env')
for _env_file in [_my_env, _fallback_env1, _fallback_env2]:
    _load_env_file(_env_file)

# ─── sys.path for gemini_agent fallback ─────────────────────────────────────

_ugc_path = os.path.join(os.path.dirname(__file__), '..', '..', 'erp-stack', 'tiktok-ugc-studio')
if _ugc_path not in sys.path:
    sys.path.append(_ugc_path)

# ─── Local imports (copied modules) ─────────────────────────────────────────

from rules.validator import (
    validate_title, validate_tags, validate_description,
    validate_price, validate_listing, validate_image_requirements,
    validate_policies,
)
from pod_wizard import (
    get_manager, WizardSession, WIZARD_STEPS,
    handle_step_provider, handle_step_category,
    handle_step_product, handle_step_variant, handle_step_print_info,
    handle_step_artwork, handle_step_mockup, handle_step_mockup_status,
    handle_step_content, handle_step_pricing, handle_step_summary,
)
from pod_data import get_providers, get_product_catalog, get_product_detail

# ─── FastAPI App ────────────────────────────────────────────────────────────

app = FastAPI(
    title="POD Wizard API",
    version="2.0.0",
    description="Unified POD Wizard + AI Assistant + Rules Validator",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Static files (frontend) ────────────────────────────────────────────────

PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "public")
if os.path.isdir(PUBLIC_DIR):
    app.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")

# Static product images dir
try:
    _static_img_path = Path(__file__).parent / "static" / "product_images"
    _static_img_path.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/static/product_images",
        StaticFiles(directory=str(_static_img_path)),
        name="product_images",
    )
except Exception as e:
    logger.error(f"Failed to configure static file serving: {e}")

# ─── Printful config ────────────────────────────────────────────────────────

PRINTFUL_API_KEY = os.environ.get("PRINTFUL_API_KEY", "0T3HwM0uy7eOTQZx64QZL5yPtjMKw6wPFjvjjIbs")
PRINTFUL_BASE = "https://api.printful.com"
HEADERS = {"Authorization": f"Bearer {PRINTFUL_API_KEY}"}

# ─── SQLite persistence ─────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent / "etsy_wizard.db"

def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("CREATE TABLE IF NOT EXISTS shops (shop_id TEXT PRIMARY KEY, data TEXT)")
    conn.execute("CREATE TABLE IF NOT EXISTS listings (shop_id TEXT, draft_id TEXT, data TEXT, PRIMARY KEY(shop_id, draft_id))")
    conn.commit()
    conn.close()

def load_from_db():
    conn = sqlite3.connect(str(DB_PATH))
    try:
        cur = conn.execute("SELECT shop_id, data FROM shops")
        for row in cur.fetchall():
            shops[row[0]] = json.loads(row[1])
        cur = conn.execute("SELECT shop_id, draft_id, data FROM listings")
        for row in cur.fetchall():
            sid = row[0]
            if sid not in listings:
                listings[sid] = []
            d = json.loads(row[2])
            d["draft_id"] = row[1]
            listings[sid].append(d)
    finally:
        conn.close()

def save_shop(shop_id: str):
    if shop_id not in shops:
        return
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.execute("INSERT OR REPLACE INTO shops (shop_id, data) VALUES (?, ?)",
                     (shop_id, json.dumps(shops[shop_id], default=str)))
        conn.commit()
    finally:
        conn.close()

def save_listing(shop_id: str, draft_id: str, data: dict):
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.execute("INSERT OR REPLACE INTO listings (shop_id, draft_id, data) VALUES (?, ?, ?)",
                     (shop_id, draft_id, json.dumps(data, default=str)))
        conn.commit()
    finally:
        conn.close()

def delete_listing_db(shop_id: str, draft_id: str):
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.execute("DELETE FROM listings WHERE shop_id=? AND draft_id=?", (shop_id, draft_id))
        conn.commit()
    finally:
        conn.close()

# In-memory data
shops: dict[str, dict] = {}
listings: dict[str, list] = {}

init_db()
load_from_db()

# ─── Product Type → Category Mapping ────────────────────────────────────────

TYPE_CATEGORIES = {
    "DECOR": {"name": "ตกแต่งบ้าน", "icon": "🏠", "slug": "decor"},
    "CUT-SEW": {"name": "เสื้อผ้า Cut & Sew", "icon": "👕", "slug": "cut-sew"},
    "DIRECT-TO-FABRIC": {"name": "ผ้า & สิ่งทอ", "icon": "🧵", "slug": "fabric"},
    "DTFILM": {"name": "DTF Film", "icon": "🎞️", "slug": "dtf"},
    "EMBROIDERY": {"name": "งานปัก", "icon": "🧶", "slug": "embroidery"},
    "PHONE-CASE": {"name": "เคสโทรศัพท์", "icon": "📱", "slug": "phone-case"},
}

# ─── Printful Product Cache ─────────────────────────────────────────────────

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

# ─── HSV helper ─────────────────────────────────────────────────────────────

def _hsv_to_rgb(h, s, v):
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

# ═══════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════

class Listing(BaseModel):
    title: str
    description: str
    tags: list[str] = []
    price: float
    quantity: int = 1
    materials: list[str] = []
    who_made_it: str = "i_did"
    when_made: str = "2020_2026"
    is_supply: str = "a_finished_product"

class ShopProfile(BaseModel):
    name: str
    banner_url: Optional[str] = None
    about: Optional[str] = None
    policies: dict = {}

class ImageCheck(BaseModel):
    width: int
    height: int
    file_size_mb: float = 0
    file_type: str = "JPEG"

class WizardStep(BaseModel):
    shop_id: str
    step: str
    data: dict

class ProductInfo(BaseModel):
    name: str
    description: str = ""
    category: str = ""
    material: str = ""
    size: str = ""
    color: str = ""
    style: str = "product"

class ImageGenRequest(BaseModel):
    product_name: str = ""
    description: str = ""
    style: str = "product"
    prompt: str = ""
    model_tier: str = "quality"
    upscale: bool = True
    aspect_ratio: str = ""
    product_image_url: Optional[str] = None
    product_id: str = ""
    position: Optional[str] = None

    @validator('product_image_url', pre=True)
    def validate_product_image_url(cls, v):
        if v is None:
            return None
        if not isinstance(v, str) or not v.strip():
            raise ValueError("product_image_url must be a non-empty string or None")
        if not v.startswith(('http://', 'https://')):
            raise ValueError("product_image_url must be a valid HTTP/HTTPS URL")
        return v.strip()

    @validator('aspect_ratio', pre=True)
    def validate_aspect_ratio(cls, v):
        if not v:
            return ""
        valid_ratios = ["9:16", "16:9", "1:1", "4:5", "3:2"]
        if v not in valid_ratios:
            raise ValueError(f"aspect_ratio must be one of {valid_ratios}")
        return v

class BatchGenRequest(BaseModel):
    shop_id: str
    product_names: list[str]
    style: str = "product"
    model_tier: str = "fast"

class ArtworkValidationRequest(BaseModel):
    product_id: str
    width_px: int = 0
    height_px: int = 0
    dpi: int = 0
    file_size_mb: float = 0
    file_type: str = ""
    image_base64: Optional[str] = None

class AIArtworkReviewRequest(BaseModel):
    product_id: str
    width_px: int = 0
    height_px: int = 0
    design_description: str = ""
    image_base64: Optional[str] = None
    style: str = ""

class WizardStartRequest(BaseModel):
    pass

class WizardStepRequest(BaseModel):
    session_id: str
    action: str  # "next" | "back" | "set"
    data: dict = {}

class ProductResearchRequest(BaseModel):
    product_name: str = ''
    product_image_base64: str = ''
    description: str = ''
    category: str = ''

class PaymentQRRequest(BaseModel):
    amount: float = 0
    phone: str = ''
    name: str = 'I2M Studio'
    reference: str = ''

class ScrapeRequest(BaseModel):
    url: str
    max_pages: int = 1

# ═══════════════════════════════════════════════════════════════════════════
# ROOT + HEALTH
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    index_path = os.path.join(PUBLIC_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"service": "pod-wizard", "status": "ok"}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "pod-wizard",
        "version": "2.0.0",
        "rules_loaded": True,
    }

@app.get("/api/pod/health")
async def api_health():
    return {"status": "ok", "service": "pod-wizard", "cached_products": _product_cache["data"] is not None}

# ═══════════════════════════════════════════════════════════════════════════
# POD — Printful Proxy (existing pod-wizard endpoints)
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/pod/categories")
async def get_categories_api():
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
async def get_products_api(category_id: str = "", search: str = ""):
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

@app.get("/api/pod/products/{product_id}")
async def get_product_api(product_id: int):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{PRINTFUL_BASE}/products/{product_id}", headers=HEADERS, timeout=30)
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text[:200])
        data = r.json()
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
async def get_print_info_api(product_id: int):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{PRINTFUL_BASE}/mockup-generator/printfiles/{product_id}",
            headers=HEADERS, timeout=30
        )
        if r.status_code != 200:
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
async def get_mockup_status_api(task_key: str):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{PRINTFUL_BASE}/mockup-generator/task?task_key={task_key}",
            headers=HEADERS, timeout=30
        )
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text[:200])
        return r.json()

DESIGNS_DIR = "/var/www/podwizard/designs"

@app.post("/api/pod/generate-design")
async def generate_design(body: dict):
    from PIL import Image, ImageDraw, ImageFont
    product_name = body.get("product_name", "Custom Design")
    style = body.get("style", "modern")
    os.makedirs(DESIGNS_DIR, exist_ok=True)
    filename = f"design_{uuid.uuid4().hex[:12]}.png"
    local_path = os.path.join(DESIGNS_DIR, filename)
    size = 1024
    img = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)
    seed = hash(product_name + style)
    random.seed(seed)
    rng = random.Random(seed)
    bg_color = (245, 245, 250, 255)
    draw.rectangle([0, 0, size, size], fill=bg_color)
    hue = abs(seed) % 360
    primary = _hsv_to_rgb(hue, 0.7, 0.9)
    secondary = _hsv_to_rgb((hue + 40) % 360, 0.5, 0.7)
    accent = _hsv_to_rgb((hue + 180) % 360, 0.8, 0.8)
    cx, cy = size // 2, size // 2
    r = size * 0.38
    for i in range(3):
        offset = i * 15
        draw.ellipse([cx - r + offset, cy - r + offset, cx + r - offset, cy + r - offset],
                     outline=primary if i == 0 else secondary, width=8 - i * 2)
    for i in range(6):
        angle = i * 60 + abs(seed) % 20
        rad = math.radians(angle)
        x1 = cx + int(r * 0.6 * math.cos(rad))
        y1 = cy + int(r * 0.6 * math.sin(rad))
        x2 = cx + int(r * 0.9 * math.cos(rad + 0.3))
        y2 = cy + int(r * 0.9 * math.sin(rad + 0.3))
        draw.line([(x1, y1), (x2, y2)], fill=accent, width=6)
    for _ in range(12):
        angle = rng.uniform(0, 360)
        dist = rng.uniform(r * 0.2, r * 0.85)
        rad = math.radians(angle)
        dx = cx + int(dist * math.cos(rad))
        dy = cy + int(dist * math.sin(rad))
        dot_r = rng.randint(4, 12)
        draw.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r],
                     fill=secondary if rng.random() > 0.5 else accent)
    cr = int(r * 0.25)
    draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr],
                 outline=primary, width=6, fill=(255, 255, 255, 200))
    letter = product_name[0].upper() if product_name else "P"
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 180)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
    except Exception:
        font_large = ImageFont.load_default()
        font_small = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), letter, font=font_large)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2), letter, fill=primary, font=font_large)
    style_text = style.upper() if style else ""
    if style_text:
        bbox2 = draw.textbbox((0, 0), style_text, font=font_small)
        sw = bbox2[2] - bbox2[0]
        draw.text((cx - sw // 2, size - 80), style_text, fill=(180, 180, 190, 255), font=font_small)
    img.save(local_path, "PNG")
    public_url = f"https://podwizard.m2igen.com/designs/{filename}"
    return {"result": {"image_url": public_url, "prompt": f"{product_name} - {style}"}}

# ═══════════════════════════════════════════════════════════════════════════
# POD — Static Product Reference (from pod_sizes.py / pod_data.py)
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/pod/catalog")
def pod_list_products(category: Optional[str] = None):
    """รายการสินค้า POD ทั้งหมด หรือกรองตาม category"""
    from pod_sizes import list_products, get_categories as pod_cats
    return {
        "ok": True,
        "products": list_products(category),
        "total": len(list_products(category)),
        "categories": pod_cats(),
    }

@app.get("/api/pod/catalog/{category}")
def pod_products_by_category(category: str):
    """รายการสินค้า POD ตามหมวดหมู่"""
    from pod_sizes import list_products
    products = list_products(category)
    if not products:
        raise HTTPException(status_code=404, detail=f"ไม่พบหมวดหมู่: {category}")
    return {"ok": True, "category": category, "products": products, "total": len(products)}

@app.get("/api/pod/print-spec/{product_id}")
def pod_print_info_static(product_id: str, variant_id: Optional[int] = None):
    """ดึง Printful mockup template data สำหรับ POD product (static reference)"""
    from pod_data import get_printful_printfiles, get_printful_mockup_templates
    product = get_product_detail(product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"ไม่พบ Product ID: {product_id}")
    pf_id = product.get("pf_product_id")
    if not pf_id:
        return {"ok": False, "error": f"สินค้า {product_id} ไม่มี Printful product ID", "product": product}
    pf_data = get_printful_printfiles(pf_id)
    templates_data = get_printful_mockup_templates(pf_id)
    if not pf_data:
        raise HTTPException(status_code=502, detail=f"ไม่สามารถดึงข้อมูล print area จาก Printful สำหรับ product {pf_id}")
    printfiles = pf_data.get("printfiles", [])
    placements = pf_data.get("available_placements", {})
    recommended_size = None
    for pf in printfiles:
        w = pf.get("width", 0)
        h = pf.get("height", 0)
        dpi = pf.get("dpi", 150)
        if w and h:
            if not recommended_size or (w * h) > (recommended_size["width"] * recommended_size["height"]):
                recommended_size = {"width": w, "height": h, "dpi": dpi, "label": pf.get("title", f"{w}x{h}")}
    variant_mapping = []
    if templates_data:
        all_vm = templates_data.get("variant_mapping", [])
        if variant_id:
            variant_mapping = [vm for vm in all_vm if vm.get("variant_id") == variant_id]
        else:
            variant_mapping = all_vm[:3]
    placement_templates = {}
    for vm in variant_mapping[:1]:
        for t in vm.get("templates", []):
            placement = t.get("placement", "front")
            if placement not in placement_templates:
                placement_templates[placement] = {
                    "print_area": {
                        "x": t.get("print_area", {}).get("x", 0),
                        "y": t.get("print_area", {}).get("y", 0),
                        "width": t.get("print_area", {}).get("width", 0),
                        "height": t.get("print_area", {}).get("height", 0),
                    },
                    "template_id": t.get("template_id"),
                    "image_url": t.get("image_url", ""),
                }
    return {
        "ok": True,
        "product_id": product_id,
        "pf_product_id": pf_id,
        "pf_title": product.get("pf_title", ""),
        "placements": placements,
        "printfiles": printfiles,
        "recommended_size": recommended_size,
        "placement_templates": placement_templates,
        "variant_mapping_count": len(templates_data.get("variant_mapping", [])) if templates_data else 0,
        "artwork_spec": product.get("artwork_spec", {}),
        "note": "ใช้ recommended_size สำหรับ AI generate artwork",
    }

@app.get("/api/pod/product/{product_id}")
def pod_get_product(product_id: str):
    """รายละเอียดสินค้า POD พร้อมขนาด artwork + Printful data"""
    product = get_product_detail(product_id)
    if not product:
        from pod_sizes import get_product
        product = get_product(product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"ไม่พบ Product ID: {product_id}")
    return {"ok": True, "product": product}

@app.post("/api/pod/validate-artwork")
def pod_validate_artwork(req: ArtworkValidationRequest):
    """ตรวจสอบ artwork ว่าพอดีกับ POD product หรือไม่"""
    from pod_sizes import validate_artwork
    image_info = {
        "width_px": req.width_px,
        "height_px": req.height_px,
        "dpi": req.dpi,
        "file_size_mb": req.file_size_mb,
        "file_type": req.file_type,
    }
    result = validate_artwork(image_info, req.product_id)
    return {
        "ok": result["valid"],
        "product_name": result["product_name"],
        "product_id": result["product_id"],
        "image_size_px": result["image_size_px"],
        "required_size_px": result["required_size_px"],
        "required_size_inch": result["required_size_inch"],
        "dpi": result.get("dpi", 0),
        "valid": result["valid"],
        "score": result["score"],
        "score_label": result["score_label"],
        "errors": result["errors"],
        "warnings": result["warnings"],
        "recommendations": result["recommendations"],
    }

@app.post("/api/pod/ai-review")
def pod_ai_review(req: AIArtworkReviewRequest):
    """ให้ AI วิเคราะห์ artwork design + แนะนำการปรับปรุง"""
    from pod_sizes import get_product
    product = get_product(req.product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"ไม่พบ Product ID: {req.product_id}")
    has_image = bool(req.image_base64)
    system_prompt = f"""คุณคือ POD (Print on Demand) Design Expert

สินค้า: {product['name']}
พื้นที่พิมพ์: {product['print_area']}
ขนาดที่ต้องการ: {product['width_px_300']}x{product['height_px_300']}px @ {product['dpi_recommended']}dpi
({product['width_inch']}"x{product['height_inch']}")
เทคนิคการพิมพ์: {product['print_technique']}

คำแนะนำที่ต้องให้:
1. ตรวจสอบ layout และองค์ประกอบ design
2. แนะนำการปรับตำแหน่ง text/graphic ให้เหมาะสมกับพื้นที่พิมพ์
3. บอกว่า design นี้เหมาะกับสินค้าชนิดนี้หรือไม่
4. แนะนำเรื่อง bleed, safe zone, color
5. ถ้าไม่เหมาะสม → แนะนำทางเลือก

ตอบเป็นภาษาไทย อ่านง่าย มีหัวข้อชัดเจน"""
    if has_image:
        user_prompt = f"""วิเคราะห์ artwork design นี้:
- ขนาด: {req.width_px}x{req.height_px}px
- สไตล์: {req.style or 'N/A'}
- Product: {product['name']}
{req.design_description}

ให้คำแนะนำเต็มๆ เกี่ยวกับการปรับ design ให้เหมาะกับ {product['name']}"""
    else:
        user_prompt = f"""ออกแบบ artwork สำหรับ {product['name']}

รายละเอียด: {req.design_description or 'ไม่มี'}
สไตล์: {req.style or 'modern'}

แนะนำ:
1. ขนาด artwork ที่เหมาะสม
2. องค์ประกอบ design ที่ควรมี
3. สีที่ใช้ (CMYK vs RGB)
4. Tips เฉพาะสินค้าชนิดนี้
5. ตัวอย่าง layout ที่แนะนำ"""
    from assistant import _call_gemini
    raw = _call_gemini(system_prompt, user_prompt)
    if raw:
        return {"ok": True, "product_name": product["name"], "product_id": req.product_id, "ai_analysis": raw, "source": "gemini"}
    return {
        "ok": True,
        "product_name": product["name"],
        "product_id": req.product_id,
        "ai_analysis": f"💡 คำแนะนำสำหรับ {product['name']}:\n\n"
            f"• ขนาดไฟล์: {product['width_px_300']}x{product['height_px_300']}px @ 300dpi\n"
            f"• พื้นที่พิมพ์: {product['width_inch']}x{product['height_inch']} นิ้ว\n"
            f"• ใช้ PNG (พื้นหลังโปร่งใส) เพื่อคุณภาพดีที่สุด\n"
            f"• เลือก Bleed: {product.get('notes', 'ระวังขอบตัด')}\n"
            f"• หลีกเลี่ยง text ชิดขอบเกิน 1 นิ้ว (เผื่อตัด)\n"
            f"• สี: แปลงเป็น CMYK ก่อนส่งพิมพ์ (ถ้าทำได้)\n",
        "source": "template",
    }

# ═══════════════════════════════════════════════════════════════════════════
# POD WIZARD (Session-based product creation)
# ═══════════════════════════════════════════════════════════════════════════

STEP_HANDLERS = {
    "provider": handle_step_provider,
    "category": handle_step_category,
    "product": handle_step_product,
    "variant": handle_step_variant,
    "print_info": handle_step_print_info,
    "artwork": handle_step_artwork,
    "mockup": handle_step_mockup,
    "content": handle_step_content,
    "pricing": handle_step_pricing,
    "summary": handle_step_summary,
}

@app.get("/api/pod/wizard/steps")
def pod_wizard_steps():
    """แสดงขั้นตอนทั้งหมดของ POD Create Product Wizard"""
    return {"ok": True, "steps": WIZARD_STEPS, "total": len(WIZARD_STEPS)}

@app.post("/api/pod/wizard/start")
def pod_wizard_start():
    """เริ่ม Wizard session ใหม่"""
    mgr = get_manager()
    session = mgr.create_session()
    return {
        "ok": True,
        "session": session.to_dict(),
        "current_step": session.get_current_step(),
        "providers": get_providers(),
    }

@app.get("/api/pod/wizard/{session_id}")
def pod_wizard_status(session_id: str):
    """ดูสถานะปัจจุบันของ wizard session"""
    mgr = get_manager()
    session = mgr.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    return {
        "ok": True,
        "session": session.to_dict(),
        "current_step": session.get_current_step(),
    }

@app.post("/api/pod/wizard/step")
def pod_wizard_step(req: WizardStepRequest):
    """ดำเนินการใน Wizard step"""
    mgr = get_manager()
    session = mgr.get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session not found: {req.session_id}")
    if req.action == "back":
        result = session.go_back()
        return {"ok": True, **result}
    current_step = session.get_current_step()
    step_id = current_step["id"]
    if step_id == "completed":
        return {"ok": True, "message": "Wizard เสร็จสิ้นแล้ว", "session": session.to_dict()}
    handler = STEP_HANDLERS.get(step_id)
    if handler:
        result = handler(session, **req.data)
        if not result.get("ok"):
            return {"ok": False, "error": result.get("error"), "step": step_id, "available": result.get("available")}
    mgr._save(session)
    if req.action == "next":
        advance = session.advance_step()
        mgr._save(session)
        return {"ok": True, "step_result": result, "advance": advance, "session": session.to_dict()}
    return {"ok": True, "step_result": result, "session": session.to_dict()}

@app.post("/api/pod/wizard/{session_id}/cancel")
def pod_wizard_cancel(session_id: str):
    """ยกเลิก session"""
    mgr = get_manager()
    session = mgr.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    session.status = "cancelled"
    return {"ok": True, "message": "Session cancelled", "session_id": session_id}

# ═══════════════════════════════════════════════════════════════════════════
# AI ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/ai/providers")
def ai_providers():
    """List available AI image providers"""
    from image_gen import PROVIDER_CONFIG, UPSCALE_MODELS
    return {"providers": PROVIDER_CONFIG}

@app.post("/api/ai/generate-image")
def ai_generate_image(req: ImageGenRequest):
    """AI Generate product image via Prodia Nano Banana"""
    from image_gen import make_etsy_compliant_prompt
    if req.prompt:
        prompt = req.prompt
    elif req.product_name:
        prompt = make_etsy_compliant_prompt(req.product_name, req.description, req.style)
    else:
        raise HTTPException(status_code=400, detail="Either prompt or product_name required")
    try:
        ar = req.aspect_ratio if req.aspect_ratio else None
        input_image = req.product_image_url
        if not input_image:
            _blank = Path(__file__).parent / "static" / "product_images" / "_blank.png"
            if _blank.exists():
                input_image = "http://localhost:8104/static/product_images/_blank.png"
            else:
                input_image = "https://placehold.co/1x1/white/white.png"
        result = sync_requests.post(
            "http://localhost:8110/api/v1/image/generate",
            json={"prompt": prompt, "inputImage": input_image, "aspectRatio": ar or "1:1"},
            timeout=120,
        )
        if result.status_code != 200:
            raise Exception(result.text[:200])
        data = result.json()
        img_url = data.get("images", [{}])[0].get("url", "")
        if img_url.startswith("/storage/"):
            img_url = "/etsy" + img_url
        return {
            "ok": True, "image_url": img_url, "width": 1024, "height": 1024,
            "validation": {"valid": True, "issues": []},
            "cost": data.get("cost", {}).get("dollars", 0),
            "provider": "prodia", "prompt_used": prompt,
        }
    except Exception as e:
        logger.error(f"Image generation failed: {str(e)}", exc_info=True)
        error_msg = str(e)
        if "400" in error_msg or "404" in error_msg or "invalid" in error_msg.lower():
            raise HTTPException(status_code=400, detail=f"Invalid request: {error_msg}")
        elif "401" in error_msg or "403" in error_msg or "key" in error_msg.lower():
            raise HTTPException(status_code=401, detail=f"Authentication failed: {error_msg}")
        elif "timeout" in error_msg.lower() or "504" in error_msg:
            raise HTTPException(status_code=504, detail=f"Service timeout: {error_msg}")
        else:
            raise HTTPException(status_code=502, detail=f"Image generation failed: {error_msg}")

@app.post("/api/ai/generate-concept")
def ai_generate_concept(product: ProductInfo):
    """AI Generate เฉพาะ Concept — ไม่รวม Image gen"""
    from assistant import generate_product_concept
    import time as _time
    t0 = _time.time()
    concept = generate_product_concept(product.model_dump())
    elapsed = _time.time() - t0
    return {
        "ok": True,
        "product_name": concept.get("product_name", product.name),
        "title": concept.get("title", ""),
        "tags": concept.get("tags", []),
        "description": concept.get("description", ""),
        "price": concept.get("price", 19.99),
        "materials": concept.get("materials", []),
        "image_prompt": concept.get("image_prompt", ""),
        "image_style": concept.get("image_style", "product"),
        "elapsed_seconds": round(elapsed, 1),
    }

@app.post("/api/ai/generate-product")
def ai_generate_product(product: ProductInfo):
    """AI Generate ทั้ง Concept + Image ในครั้งเดียว"""
    from assistant import generate_product_concept
    concept = generate_product_concept(product.model_dump())
    draft = {
        "title": concept.get("title", product.name),
        "description": concept.get("description", ""),
        "tags": concept.get("tags", []),
        "price": concept.get("price", 19.99),
        "materials": concept.get("materials", []),
        "quantity": 1,
        "status": "ai_generated",
        "created_at": datetime.now().isoformat(),
        "image_prompt": concept.get("image_prompt", ""),
        "image_style": concept.get("image_style", "product"),
    }
    image_result = None
    try:
        prompt = concept.get("image_prompt", "")
        if not prompt:
            from image_gen import make_etsy_compliant_prompt
            prompt = make_etsy_compliant_prompt(concept.get("product_name", product.name), product.description, concept.get("image_style", "product"))
        img_resp = sync_requests.post(
            "http://localhost:8110/api/v1/image/generate",
            json={"prompt": prompt, "inputImage": None, "aspectRatio": "1:1"},
            timeout=120,
        )
        if img_resp.status_code == 200:
            img_data = img_resp.json()
            image_result = {"image_url": img_data.get("images", [{}])[0].get("url", ""), "cost": img_data.get("cost", {}).get("dollars", 0)}
            draft["image_url"] = image_result["image_url"]
        else:
            raise Exception(img_resp.text[:200])
    except Exception as e:
        logger.warning(f"Image gen failed (non-blocking): {e}")
        image_result = {"error": str(e)}
    return {"ok": True, "product_name": concept.get("product_name", product.name), "title": draft["title"], "tags": draft["tags"], "description": draft["description"][:300], "price": draft["price"], "materials": draft["materials"], "image": image_result, "draft": draft}

@app.post("/api/ai/batch-generate")
def ai_batch_generate(req: BatchGenRequest):
    """AI Batch Generate หลายสินค้าพร้อมกัน"""
    from assistant import generate_product_concept
    from image_gen import make_etsy_compliant_prompt
    results = []
    total_cost = 0
    if req.shop_id not in listings:
        listings[req.shop_id] = []
    for i, pname in enumerate(req.product_names):
        product_info = {"name": pname, "description": "", "style": req.style}
        try:
            concept = generate_product_concept(product_info)
            prompt = concept.get("image_prompt", "") or make_etsy_compliant_prompt(pname, "", req.style)
            img = None
            try:
                img = {}
                total_cost += img.get("cost", 0)
            except Exception as e:
                logger.warning(f"Image fail for {pname}: {e}")
            draft = {
                "id": len(listings[req.shop_id]) + 1,
                "title": concept.get("title", pname),
                "status": "ai_generated",
                "image_url": img["image_url"] if img else None,
                "created_at": datetime.now().isoformat(),
            }
            listings[req.shop_id].append(draft)
            save_listing(req.shop_id, str(draft["id"]), draft)
            results.append({"index": i, "product_name": concept.get("product_name", pname), "title": draft["title"], "image_url": draft["image_url"], "price": concept.get("price", 19.99), "listing_id": draft["id"]})
        except Exception as e:
            results.append({"index": i, "product_name": pname, "error": str(e)})
    return {"ok": True, "shop_id": req.shop_id, "total": len(req.product_names), "succeeded": sum(1 for r in results if "error" not in r), "failed": sum(1 for r in results if "error" in r), "total_cost": total_cost, "results": results}

@app.post("/api/ai/detect-product")
def ai_detect_product(data: dict):
    """Auto-detect product category + product_id จาก brief/concept"""
    brief = (data.get("brief", "") or "").lower()
    name = (data.get("name", "") or "").lower()
    desc = (data.get("description", "") or "").lower()
    tags = data.get("tags", []) or []
    tags = [t.lower() for t in tags if t]
    combined = brief + " " + name + " " + desc + " " + " ".join(tags)
    keywords = {
        "apparel": ["shirt", "t-shirt", "tshirt", "tee", "hoodie", "sweatshirt", "jacket", "clothing", "wear", "top", "dress", "fashion"],
        "home": ["poster", "canvas", "print", "wall", "art", "photo", "decoration", "home", "room", "decor", "frame", "tapestry", "metal"],
        "accessories": ["bag", "tote", "hat", "cap", "phone case", "case", "backpack", "wallet", "pin", "sticker", "keychain"],
        "drinkware": ["mug", "cup", "bottle", "water bottle", "glass", "thermos", "flask"],
        "stationery": ["notebook", "journal", "book", "pen", "stationery", "sticker", "card"],
    }
    scores = {}
    for cat, cat_kws in keywords.items():
        score = 0
        for kw in cat_kws:
            if kw in combined:
                score += len(kw) * combined.count(kw)
        if score > 0:
            scores[cat] = score
    catalog = get_product_catalog()
    available_products = {}
    for item in catalog:
        cat = item.get("category", "")
        pid = item.get("product_id", "")
        if not pid:
            continue
        if cat not in available_products:
            available_products[cat] = []
        available_products[cat].append(pid)
    FALLBACK_PRODUCT = {"apparel": "tshirt_standard", "home": "poster_18x24", "accessories": "tote_bag", "drinkware": "mug_11oz", "stationery": "notebook"}
    best_cat = max(scores, key=scores.get) if scores else "apparel"
    if best_cat not in available_products:
        existing_cats = list(available_products.keys())
        best_cat = existing_cats[0] if existing_cats else "apparel"
    cat_products = available_products.get(best_cat, [])
    product_scores = {}
    for pid in cat_products:
        pid_lower = pid.replace("_", " ").lower()
        for word in pid_lower.split():
            if word in combined:
                product_scores[pid] = product_scores.get(pid, 0) + len(word) * 2
        for word in combined.split():
            if len(word) > 3 and word in pid_lower:
                product_scores[pid] = product_scores.get(pid, 0) + len(word)
    best_product = max(product_scores, key=product_scores.get) if product_scores else (cat_products[0] if cat_products else FALLBACK_PRODUCT.get(best_cat, "tshirt_standard"))
    return {"ok": True, "category": best_cat, "product_id": best_product, "confidence": scores.get(best_cat, 0), "all_scores": scores}

@app.post("/api/ai/generate-listing")
def ai_generate_listing(product: ProductInfo):
    """AI สร้าง Listing (title + tags + description) จากข้อมูลสินค้า"""
    from assistant import generate_listing
    result = generate_listing(product.model_dump())
    return result

@app.post("/api/ai/fix-listing")
def ai_fix_listing(listing: Listing, shop_id: str = "default"):
    """ตรวจสอบ + AI แก้ไข Listing อัตโนมัติ"""
    from assistant import fix_listing
    validation = validate_listing(listing.model_dump())
    fix_result = fix_listing(listing.model_dump(), validation)
    return {"original": listing.model_dump(), "validation": validation, "fix": fix_result, "summary": {"needs_fix": not validation["valid"], "issues_found": len(validation["results"])}}

@app.post("/api/ai/optimize-tags")
def ai_optimize_tags(product: ProductInfo):
    """AI สร้าง 13 SEO Tags ที่ดีที่สุด"""
    from assistant import optimize_tags
    result = optimize_tags(product.model_dump())
    from rules.validator import validate_tags as _vt
    validation = _vt(result.get("tags", [])).to_dict()
    return {"tags": result.get("tags", []), "search_volume_hints": result.get("search_volume_hints", []), "validation": validation}

@app.post("/api/ai/validate-and-fix")
def ai_validate_and_fix(listing: Listing):
    """Validate + AI Fix ใน endpoint เดียว"""
    from assistant import fix_listing
    listing_data = listing.model_dump()
    validation = validate_listing(listing_data)
    fix_result = fix_listing(listing_data, validation) if not validation["valid"] else None
    return {"valid": validation["valid"], "validation": validation, "fix": fix_result, "summary": validation.get("summary", {})}

@app.post("/api/ai/assist-wizard-step")
def ai_assist_wizard_step(shop_id: str, step: str, context: dict = {}):
    """AI แนะนำเนื้อหาสำหรับแต่ละ Wizard step"""
    from assistant import generate_shop_banner_description
    step_prompts = {"shop_about": "ช่วยเขียน 'About Shop' สำหรับร้าน Etsy", "shop_banner": "แนะนำการออกแบบ Banner", "policies": "ช่วยเขียนนโยบายร้าน Etsy"}
    prompt = step_prompts.get(step, f"ช่วยเขียนเนื้อหาสำหรับขั้นตอน {step}")
    suggestion = generate_shop_banner_description({"step": step, **context})
    return {"step": step, "shop_id": shop_id, "suggestion": suggestion}

# ═══════════════════════════════════════════════════════════════════════════
# VALIDATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/api/validate/listing")
def check_listing(listing: Listing):
    """ตรวจสอบ Listing ว่าผ่าน Etsy Rules หรือไม่"""
    result = validate_listing(listing.model_dump())
    return result

@app.post("/api/validate/image")
def check_image(image: ImageCheck):
    """ตรวจสอบ Image Metadata ก่อน Upload"""
    result = validate_image_requirements(image.model_dump())
    return result.to_dict()

@app.post("/api/validate/policies")
def check_policies(policies: dict):
    """ตรวจสอบ Shop Policies"""
    result = validate_policies(policies)
    return result.to_dict()

# ═══════════════════════════════════════════════════════════════════════════
# PRODUCT RESEARCH & SCRAPING
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/api/product/research")
def api_product_research(req: ProductResearchRequest):
    from gemini_agent import research_product
    research = research_product(
        product_name=req.product_name or 'product',
        description=req.description,
        category=req.category,
        image_base64=req.product_image_base64 or None,
    )
    web_data = {'specs': [], 'reviews': [], 'prices': []}
    if req.product_name:
        try:
            from duckduckgo_search import DDGS
            _cat = research.get('category', '') or req.category or ''
            _type = research.get('product_type', '') or ''
            with DDGS() as ddgs:
                _spec_q = f"{req.product_name} {' '.join(_type.split()[:3])} specifications technical details"[:200]
                specs = list(ddgs.text(_spec_q, max_results=3))
                web_data['specs'] = [r.get('body','')[:500] for r in specs if r.get('body','')]
                _rev_q = f"{req.product_name} {' '.join(_cat.split()[:2]) if _cat else ''} review รีวิว"[:200]
                reviews = list(ddgs.text(_rev_q, max_results=3))
                web_data['reviews'] = [r.get('body','')[:500] for r in reviews if r.get('body','')]
                _price_q = f"{req.product_name} price ราคา shopee lazada"[:200]
                prices = list(ddgs.text(_price_q, max_results=3))
                web_data['prices'] = [r.get('title','')[:200] for r in prices if r.get('title','')]
        except Exception as e:
            logger.warning(f'Web search failed: {e}')
    return {'ok': True, 'product_name': req.product_name, 'research': research, 'web_data': web_data}

@app.post("/api/product/scrape")
def scrape_product(req: ScrapeRequest):
    """Scrape product info from e-commerce URLs"""
    import re
    from bs4 import BeautifulSoup
    url = req.url.strip()
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    result = {'ok': True, 'url': url, 'title': '', 'price': '', 'description': '', 'images': [], 'specs': {}, 'source': 'unknown'}
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8'}
    try:
        resp = sync_requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        result['error'] = f'Cannot fetch URL: {e}'
        result['ok'] = False
        return result
    soup = BeautifulSoup(resp.text, 'lxml' if 'lxml' else 'html.parser')
    domain = url.lower().split('/')[2] if '//' in url else ''
    if 'shopee' in domain: result['source'] = 'shopee'
    elif 'lazada' in domain: result['source'] = 'lazada'
    elif 'amazon' in domain: result['source'] = 'amazon'
    elif 'etsy' in domain: result['source'] = 'etsy'
    else: result['source'] = 'generic'
    for sel in ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'h1', 'h1[class*="title"]', 'h1[class*="product"]', '[class*="product-name"]', '[class*="product-title"]', 'title']:
        tag = soup.select_one(sel)
        if tag:
            title = tag.get('content', '') if tag.name == 'meta' else tag.get_text(strip=True)
            if title:
                result['title'] = title
                break
    for sel in ['meta[property="og:description"]', 'meta[name="description"]', '[class*="description"]', '[class*="detail"]', '#productDescription', '[itemprop="description"]']:
        tag = soup.select_one(sel)
        if tag:
            result['description'] = tag.get('content', '').strip() if tag.name == 'meta' else tag.get_text(strip=True)[:500]
            if result['description']: break
    for sel in ['[class*="price"]', '[class*="Price"]', '[itemprop="price"]', 'meta[property="product:price:amount"]', 'meta[itemprop="price"]', '[class*="current-price"]', '[data-testid="price"]']:
        tag = soup.select_one(sel)
        if tag:
            if tag.name == 'meta':
                result['price'] = tag.get('content', '')
            else:
                price_text = tag.get_text(strip=True)
                price_match = re.search(r'[\d,]+(?:\.\d+)?', price_text.replace(',', ''))
                if price_match: result['price'] = price_match.group()
            if result['price']: break
    for sel in ['meta[property="og:image"]', 'meta[name="twitter:image"]', '[class*="gallery"] img', '[class*="product-image"] img', '[id*="main-img"]', '[class*="main-image"] img', '.image-gallery img', 'img[itemprop="image"]']:
        tags = soup.select(sel)
        for tag in tags:
            src = tag.get('src') or tag.get('data-src') or tag.get('content', '')
            if src and src.startswith(('http://', 'https://')) and src not in result['images']:
                result['images'].append(src)
            if len(result['images']) >= 5: break
        if len(result['images']) >= 5: break
    for table in soup.select('table[class*="spec"], table[class*="attribute"], .product-specs table, .data-table'):
        rows = table.select('tr')
        for row in rows:
            cells = row.select('th, td')
            if len(cells) >= 2:
                key = cells[0].get_text(strip=True)
                val = cells[1].get_text(strip=True)
                if key and val: result['specs'][key] = val
    if not result['images']:
        for img in soup.select('img[src]'):
            src = img.get('src', '')
            if src.startswith(('http://', 'https://')) and any(ext in src.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                if 'logo' not in src.lower() and 'icon' not in src.lower():
                    result['images'].append(src)
                    if len(result['images']) >= 3: break
    return result

# ═══════════════════════════════════════════════════════════════════════════
# PAYMENT (PromptPay QR)
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/api/payment/create-qr")
def create_payment_qr(req: PaymentQRRequest):
    """Generate Thai PromptPay QR Code for payment"""
    import qrcode
    phone = req.phone or os.environ.get('PROMPTPAY_PHONE', '')
    if not phone:
        phone = '0000000000'
    phone_clean = ''.join(c for c in phone if c.isdigit())
    emv = '000201'
    emv += '010212'
    pp_id = phone_clean
    if pp_id.startswith('0'):
        pp_id = '66' + pp_id[1:]
    elif not pp_id.startswith('66'):
        pp_id = '66' + pp_id
    aid_tag = '0016A000000677010111'
    phone_tag = f'01{len(pp_id):02d}{pp_id}'
    merchant_account = aid_tag + phone_tag
    emv += f'26{len(merchant_account):02d}{merchant_account}'
    name = req.name[:25]
    emv += f'59{len(name):02d}{name}'
    city = 'Bangkok'
    emv += f'60{len(city):02d}{city}'
    postal = '10100'
    emv += f'61{len(postal):02d}{postal}'
    if req.amount > 0:
        amount_str = f'{req.amount:.2f}'
        emv += f'54{len(amount_str):02d}{amount_str}'
    if req.reference:
        ref_tag = f'08{len(req.reference):02d}{req.reference}'
        emv += f'62{len(ref_tag):02d}{ref_tag}'
    crc_data = emv.encode()
    crc = 0xFFFF
    for byte in crc_data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x0001:
                crc = (crc >> 1) ^ 0x8408
            else:
                crc >>= 1
    emv += f'63{crc:04X}'
    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(emv)
    qr.make(fit=True)
    img = qr.make_image(fill_color='black', back_color='white')
    buf = BytesIO()
    img.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {'ok': True, 'qr_base64': b64, 'qr_payload': emv, 'amount': req.amount, 'phone': phone_clean, 'name': name, 'reference': req.reference or ''}

# ═══════════════════════════════════════════════════════════════════════════
# STATS
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/stats")
def stats():
    return {"active_shops": len(shops), "total_listings": sum(len(v) for v in listings.values()), "version": "2.0.0"}

# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8123)
