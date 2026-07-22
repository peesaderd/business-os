"""
POD Wizard — Backend API
Proxies Printful API (avoids CORS) + serves frontend
"""
import os, json, time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import logging

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

@app.get("/api/pod/health")
async def health():
    return {"status": "ok", "service": "pod-wizard", "cached_products": _product_cache["data"] is not None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8123)
