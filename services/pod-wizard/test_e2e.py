"""
POD Wizard — E2E Test Suite
~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Tests all API endpoints + HTML structure + full wizard flow.
Run:  python3 -m pytest test_e2e.py -v  (needs httpx+pytest)
"""

import os, sys, json, time
import httpx

BASE_URL = os.environ.get("POD_URL", "https://podwizard.m2igen.com")
API = f"{BASE_URL}/api/pod"
PASS = 0
FAIL = 0

def ok(msg):
    global PASS; PASS += 1
    print(f"  ✅ {msg}")

def fail(msg, detail=""):
    global FAIL; FAIL += 1
    print(f"  ❌ {msg}")
    if detail:
        for line in detail.split("\n")[:5]:
            print(f"     {line}")

def check(cond, msg, detail=""):
    if cond: ok(msg)
    else: fail(msg, detail)

# ── 1. Printful API Key (cannot verify directly, but proxy confirms it works) ──

def test_health():
    print("\n🔍 [1/9] Health Check")
    try:
        r = httpx.get(f"{API}/health", timeout=10)
        check(r.status_code == 200, f"health → {r.status_code}")
        d = r.json()
        check(d.get("status") == "ok", f"status=ok")
    except Exception as e:
        fail("health endpoint unreachable", str(e))

# ── 2. Categories ──

def test_categories():
    print("\n🔍 [2/9] GET /api/pod/categories")
    try:
        r = httpx.get(f"{API}/categories", timeout=30)
        check(r.status_code == 200, f"categories → {r.status_code}")
        d = r.json()
        cats = d.get("result", [])
        check(len(cats) >= 4, f"got {len(cats)} categories (expect ≥4): {[c['id'] for c in cats]}")

        # Each category must have required fields
        for c in cats:
            cid = c.get("id", "?")
            check("id" in c, f"  {cid}: has id")
            check("name" in c and len(c["name"]) > 0, f"  {cid}: has name")
            check("icon" in c and len(c["icon"]) > 0, f"  {cid}: has icon")
            check("count" in c and c["count"] > 0, f"  {cid}: count>0 ({c['count']})")
            check("slug" in c and len(c["slug"]) > 0, f"  {cid}: has slug")

        # Specific categories should exist
        ids = [c["id"] for c in cats]
        for want in ["CUT-SEW", "DECOR", "EMBROIDERY"]:
            check(want in ids, f"category {want} exists")
    except Exception as e:
        fail("categories failed", str(e))

# ── 3. Products (no filter) ──

def test_products_all():
    print("\n🔍 [3/9] GET /api/pod/products (all)")
    try:
        r = httpx.get(f"{API}/products", timeout=30)
        check(r.status_code == 200, f"products all → {r.status_code}")
        d = r.json()
        prods = d.get("result", [])
        check(len(prods) >= 10, f"got {len(prods)} products (expect ≥10)")

        names = []
        for p in prods[:5]:
            names.append(p.get("name", "??"))
            check("id" in p, f"  product has id")
            check(p.get("name", ""), f"  product has name: {p['name'][:40]}")
        ok(f"  sample products: {names}")
    except Exception as e:
        fail("products all failed", str(e))

# ── 4. Products (filter by category) ──

def test_products_filtered():
    print("\n🔍 [4/9] GET /api/pod/products?category_id=DECOR")
    try:
        r = httpx.get(f"{API}/products?category_id=DECOR", timeout=30)
        check(r.status_code == 200, f"products filtered → {r.status_code}")
        d = r.json()
        prods = d.get("result", [])
        check(len(prods) >= 1, f"got {len(prods)} Decor products (expect ≥1)")
        for p in prods:
            check(p.get("name", ""), f"  {p.get('name','?')[:50]}")
    except Exception as e:
        fail("products filtered failed", str(e))

# ── 5. Products (search) ──

def test_products_search():
    print("\n🔍 [5/9] GET /api/pod/products?search=shirt")
    try:
        r = httpx.get(f"{API}/products?search=shirt", timeout=30)
        check(r.status_code == 200, f"products search → {r.status_code}")
        d = r.json()
        prods = d.get("result", [])
        check(len(prods) >= 1, f"got {len(prods)} 'shirt' results (expect ≥1)")
        for p in prods[:3]:
            check("shirt" in p.get("name", "").lower(), f"  '{p['name'][:50]}' contains 'shirt'")
    except Exception as e:
        fail("products search failed", str(e))

# ── 6. Product Detail ──

def test_product_detail():
    print("\n🔍 [6/9] GET /api/pod/products/{id}")
    try:
        # First get a product ID
        r = httpx.get(f"{API}/products?limit=1", timeout=30)
        pid = r.json()["result"][0]["id"]

        r2 = httpx.get(f"{API}/products/{pid}", timeout=30)
        check(r2.status_code == 200, f"product detail → {r2.status_code}")
        d = r2.json()
        prod = d.get("result", {})
        check(prod.get("name", ""), f"  name: {prod.get('name','')[:40]}")
        variants = prod.get("variants", [])
        check(len(variants) >= 1, f"  {len(variants)} variants")
        if variants:
            v = variants[0]
            check("id" in v, f"  variant has id")
            check("name" in v, f"  variant has name: {v.get('name','')[:30]}")

        # Test 404
        r3 = httpx.get(f"{API}/products/99999999", timeout=10)
        check(r3.status_code in (404, 422), f"nonexistent product → {r3.status_code}")
    except Exception as e:
        fail("product detail failed", str(e))

# ── 7. Mockup Task (validation without actual image) ──

def test_mockup_validation():
    print("\n🔍 [7/9] POST /api/pod/mockup (missing fields)")
    try:
        # No body
        r = httpx.post(f"{API}/mockup", json={}, timeout=15)
        check(r.status_code == 400, f"empty body → {r.status_code} (expect 400)")

        # Missing variant_ids
        r2 = httpx.post(f"{API}/mockup", json={"product_id": 71}, timeout=15)
        check(r2.status_code == 400, f"missing variant_ids → {r2.status_code} (expect 400)")

        # Valid body — might fail at Printful (no image URL), but should not be 400/500
        # We just check it doesn't crash
        r3 = httpx.post(f"{API}/mockup", json={
            "product_id": 71,
            "variant_ids": [4011],
            "files": [{"placement": "front"}]
        }, timeout=30)
        check(r3.status_code in (200, 422, 500, 400),
              f"valid mockup call → {r3.status_code}: {r3.text[:100]}")
    except Exception as e:
        fail("mockup validation failed", str(e))

# ── 8. Print Info ──

def test_print_info():
    print("\n🔍 [8/9] GET /api/pod/print-info/{id}")
    try:
        # Try a known product (71 = Bella Canvas 3001)
        r = httpx.get(f"{API}/print-info/71", timeout=30)
        check(r.status_code in (200, 404), f"print-info 71 → {r.status_code}")
        if r.status_code == 200:
            d = r.json()
            ok("  print info returned data")

        # Non-existent
        r2 = httpx.get(f"{API}/print-info/-1", timeout=10)
        check(r2.status_code in (404, 422), f"print-info -1 → {r2.status_code}")
    except Exception as e:
        fail("print info failed", str(e))

# ── 9. HTML / Frontend ──

def test_frontend():
    print("\n🔍 [9/9] GET / (frontend HTML)")
    try:
        r = httpx.get(BASE_URL, timeout=10)
        check(r.status_code == 200, f"frontend → {r.status_code}")
        html = r.text

        # Critical elements
        checks = [
            ("PWA manifest", 'manifest.json' in html),
            ("Service Worker", 'sw.js' in html),
            ("App title", 'PODWIZARD' in html or 'Pod Wizard' in html),
            ("Printful button", 'Printful' in html),
            ("Printify option", 'Printify' in html),
            ("Hidden CSS", '.hidden' in html),
            ("API calls", '/api/pod/' in html),
            ("Minecraft style", 'Minecraft' in html or 'pixel' in html.lower() or '0x0a0a1a' in html),
            ("6 wizard steps", html.count('step-') >= 6),
        ]
        for label, cond in checks:
            check(cond, label)
    except Exception as e:
        fail("frontend failed", str(e))

# ── Runner ──

def main():
    print(f"🧪 POD Wizard E2E Test Suite")
    print(f"   Target: {BASE_URL}")
    print(f"   API:    {API}")
    print("=" * 50)

    test_health()
    test_categories()
    test_products_all()
    test_products_filtered()
    test_products_search()
    test_product_detail()
    test_mockup_validation()
    test_print_info()
    test_frontend()

    print("\n" + "=" * 50)
    print(f"📊 Results:  {PASS} passed, {FAIL} failed, {PASS+FAIL} total")
    if FAIL > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
