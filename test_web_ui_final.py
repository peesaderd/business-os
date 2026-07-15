#!/usr/bin/env python3
"""Test TikTok UGC Studio Web UI - Products + Video Generation"""
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "https://openhands.m2igen.com/tiktok/"
OUT = Path("/home/openhands/.openclaw/workspace/media/pipeline-demo")
OUT.mkdir(parents=True, exist_ok=True)

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        # Track API calls
        api_calls = []
        def on_resp(r):
            if "/api/tiktok/" in r.url:
                api_calls.append({"status": r.status, "method": r.request.method, "url": r.url.split("?")[0]})
        page.on("response", on_resp)

        print("🚀 Web UI Test: Products + Video Generation")
        print("=" * 60)

        # 1) Open homepage
        print("\n[1/7] Open homepage...")
        page.goto(BASE, timeout=60000)
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path=str(OUT / "web_01_homepage.png"))
        print("✅ Homepage loaded")

        # 2) Click Products tab
        print("[2/7] Click Products tab...")
        page.locator('button[data-tab="products"]').first.click()
        time.sleep(2)
        page.wait_for_selector("#page-products.active", timeout=10000)
        
        # Wait for products to load (triggered by switchTab now)
        page.wait_for_load_state("networkidle")
        time.sleep(3)
        
        page.screenshot(path=str(OUT / "web_02_products_tab.png"))
        print("✅ Products tab opened")

        # 3) Count product cards
        print("[3/7] Count product cards...")
        cards = page.locator(".product-card")
        cards.first.wait_for(state="visible", timeout=30000)
        n = cards.count()
        print(f"✅ Found {n} product cards")
        page.screenshot(path=str(OUT / "web_03_products_loaded.png"))
        if n == 0:
            print("❌ No products loaded!")
            return False

        # 4) Click "Create Video" on first product
        print("[4/7] Click 'Create Video' on first product...")
        first_btn = cards.first.locator('button:has-text("Create Video")')
        first_btn.wait_for(state="visible", timeout=10000)
        first_btn.click()
        time.sleep(2)
        
        # Should switch to content tab
        page.wait_for_selector("#page-content.active", timeout=10000)
        page.screenshot(path=str(OUT / "web_04_content_wizard.png"))
        print("✅ Content Wizard opened")

        # 5) Fill in product details and generate
        print("[5/7] Check Content Wizard state...")
        # Product URL and title should be pre-filled
        product_url = page.locator("#productUrl").input_value()
        product_title = page.locator("#productTitle").input_value()
        print(f"   Product URL: {product_url[:60]}...")
        print(f"   Product Title: {product_title[:60]}...")

        # Look for "Generate Video" or similar button
        # The flow might be: Step 1 (product) -> Step 2 (style) -> Step 3 (generate)
        # Or it might auto-advance
        time.sleep(1)
        page.screenshot(path=str(OUT / "web_05_content_wizard_filled.png"))

        # 6) Find and click the generate/start button
        print("[6/7] Locate generate button...")
        # Try multiple possible button texts
        gen_btn = None
        for selector in [
            'button:has-text("Generate Video")',
            'button:has-text("สร้างวิดีโอ")',
            'button:has-text("Start Pipeline")',
            'button:has-text("เริ่มสร้าง")',
            'button:has-text("Next")',
            'button:has-text("ถัดไป")'
        ]:
            btn = page.locator(selector).first
            if btn.count() > 0 and btn.is_visible():
                gen_btn = btn
                print(f"   Found: {btn.inner_text().strip()}")
                break
        
        if not gen_btn:
            print("⚠️  No generate button found, checking current state...")
            page.screenshot(path=str(OUT / "web_06_no_generate_btn.png"))
            # Dump page text for debugging
            content_text = page.locator("#page-content").inner_text()[:500]
            print(f"   Page text: {content_text[:200]}")
            return False

        # 7) Start generation and wait
        print("[7/7] Start video generation...")
        gen_btn.click()
        t0 = time.time()
        time.sleep(3)
        page.screenshot(path=str(OUT / "web_07_generation_started.png"))
        print("✅ Generation started")

        # Wait for completion (up to 3 minutes)
        print("\n⏳ Waiting for pipeline to complete (max 180s)...")
        success = False
        video_url = None
        last_progress = 0

        while time.time() - t0 < 180:
            elapsed = int(time.time() - t0)

            # Check for video element
            vid = page.locator("video[src]").first
            if vid.count() > 0:
                try:
                    src = vid.get_attribute("src")
                    if src:
                        video_url = src
                        success = True
                        print(f"✅ Video ready in {elapsed}s")
                        break
                except:
                    pass

            # Check for success message
            success_el = page.locator(".alert-success, .success, [data-status='completed']").first
            if success_el.count() > 0 and success_el.is_visible():
                success = True
                print(f"✅ Pipeline completed in {elapsed}s")
                break

            # Check for error
            error_el = page.locator(".alert-danger, .error, [data-status='failed']").first
            if error_el.count() > 0 and error_el.is_visible():
                err_text = error_el.inner_text()[:150]
                print(f"❌ Error at {elapsed}s: {err_text}")
                page.screenshot(path=str(OUT / "web_08_error.png"))
                break

            # Progress screenshots every 20s
            if elapsed - last_progress >= 20:
                last_progress = elapsed
                page.screenshot(path=str(OUT / f"web_progress_{elapsed}s.png"))
                print(f"   ⏳ {elapsed}s...")

            time.sleep(3)

        elapsed = int(time.time() - t0)
        page.screenshot(path=str(OUT / "web_09_final.png"))

        # Summary
        print("\n" + "=" * 60)
        print("📊 Test Summary")
        print("=" * 60)
        failed = [c for c in api_calls if c["status"] >= 400]
        print(f"API calls: {len(api_calls)} total, {len(failed)} failed")
        if failed:
            print("Failed endpoints:")
            for c in failed[:5]:
                print(f"  ❌ {c['status']} {c['method']} {c['url']}")
        print(f"\nPipeline: {'✅ SUCCESS' if success else '❌ FAILED'} in {elapsed}s")
        if video_url:
            print(f"Video URL: {video_url}")

        # Save results
        result = {
            "success": success,
            "elapsed_seconds": elapsed,
            "video_url": video_url,
            "api_calls_total": len(api_calls),
            "api_calls_failed": len(failed),
            "failed_endpoints": [c["url"] for c in failed],
        }
        (OUT / "web_ui_test_result.json").write_text(json.dumps(result, indent=2))
        print(f"\n💾 Results: {OUT / 'web_ui_test_result.json'}")

        browser.close()
        return success

if __name__ == "__main__":
    ok = run()
    raise SystemExit(0 if ok else 1)
