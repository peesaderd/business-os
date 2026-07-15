#!/usr/bin/env python3
"""Test TikTok UGC Studio - Full Pipeline via Web UI (Playwright) - Fixed for multi-step wizard"""
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "https://openhands.m2igen.com/tiktok/"
OUT = Path("/home/openhands/.openclaw/workspace/media/pipeline-demo")
OUT.mkdir(parents=True, exist_ok=True)

def shot(page, name):
    page.screenshot(path=str(OUT / name))
    print(f"📸 {name}")

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

        print("🚀 TikTok UGC Studio Web UI Pipeline Test (Multi-Step Wizard)")
        print("=" * 70)

        # 1) Open homepage
        print("\n[1/10] Open homepage...")
        page.goto(BASE, timeout=60000)
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        shot(page, "web_01_homepage.png")

        # 2) Click Products tab
        print("[2/10] Click Products tab...")
        page.locator('button[data-tab="products"]').first.click()
        time.sleep(2)
        page.wait_for_selector("#page-products.active", timeout=15000)
        shot(page, "web_02_products_tab.png")
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        # 3) Count product cards
        print("[3/10] Count product cards...")
        cards = page.locator(".product-card")
        cards.first.wait_for(state="visible", timeout=30000)
        n = cards.count()
        print(f"   Found {n} product cards")
        shot(page, "web_03_products_loaded.png")
        if n == 0:
            print("❌ No products loaded")
            return False

        # 4) Click Create Video on the first card
        print("[4/10] Click 'Create Video' on first product...")
        first_btn = cards.first.locator('button:has-text("Create Video")')
        first_btn.wait_for(state="visible", timeout=10000)
        first_btn.click()
        time.sleep(2)
        page.wait_for_selector("#page-content.active", timeout=10000)
        shot(page, "web_04_content_wizard_opened.png")
        print("   ✅ Content Wizard opened")

        # 5) Step 1: Fill product info (should be pre-filled from product card)
        print("[5/10] Step 1: Verify product info pre-filled...")
        product_url = page.locator("#productUrl").input_value()
        product_title = page.locator("#productTitle").input_value()
        print(f"   URL: {product_url[:50]}...")
        print(f"   Title: {product_title[:50]}...")
        shot(page, "web_05_step1_product_info.png")

        # Click "Next: Generate Script" button
        print("   Clicking 'Next: Generate Script'...")
        next_btn = page.locator('button:has-text("Next: Generate Script")')
        if next_btn.count() == 0:
            next_btn = page.locator('button:has-text("Next")')
        next_btn.first.wait_for(state="visible", timeout=5000)
        next_btn.first.click()
        time.sleep(3)
        shot(page, "web_06_step2_generating_script.png")

        # 6) Step 2: Wait for script generation
        print("[6/10] Step 2: Wait for script generation...")
        # The script generation happens via API call
        # Wait for the hook/value/cta fields to be populated
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        
        # Check if hook field is filled
        hook_value = page.locator("#scriptHook").input_value()
        if not hook_value:
            print("   ⚠️ Hook not filled, waiting more...")
            time.sleep(3)
            hook_value = page.locator("#scriptHook").input_value()
        
        if hook_value:
            print(f"   ✅ Script generated: {hook_value[:50]}...")
        else:
            print("   ❌ Script generation failed")
        
        shot(page, "web_07_step2_script_generated.png")

        # Click "Next: Review Script" or similar
        print("   Clicking next to step 3...")
        next_btn = page.locator('button:has-text("Next"), button:has-text("Review")')
        if next_btn.count() > 0:
            next_btn.first.click()
            time.sleep(2)
        shot(page, "web_08_step3_review.png")

        # 7) Step 3: Review and go to generate
        print("[7/10] Step 3: Review script, go to generate...")
        # Click next to go to step 4 (generate)
        next_btn = page.locator('button:has-text("Next: Generate"), button:has-text("Generate")')
        if next_btn.count() > 0:
            next_btn.first.click()
            time.sleep(2)
        shot(page, "web_09_step4_generate_ready.png")

        # 8) Step 4: Click Generate Video
        print("[8/10] Step 4: Click 'Generate Video'...")
        gen_btn = page.locator('#genBtn, button:has-text("Generate Video"), button:has-text("🚀 Generate")')
        try:
            gen_btn.first.wait_for(state="visible", timeout=10000)
            print("   ✅ Generate button visible")
            gen_btn.first.click()
            t0 = time.time()
            time.sleep(3)
            shot(page, "web_10_pipeline_started.png")
        except Exception as e:
            print(f"   ❌ Generate button not found: {e}")
            return False

        # 9) Wait for pipeline completion
        print("[9/10] Wait for pipeline to complete (max 180s)...")
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
                        print(f"   ✅ Video ready in {elapsed}s")
                        break
                except Exception:
                    pass

            # Check for success alert
            for sel in [".alert-success", ".success", "[data-status='completed']"]:
                el = page.locator(sel).first
                if el.count() > 0 and el.is_visible():
                    success = True
                    print(f"   ✅ Pipeline completed in {elapsed}s")
                    break
            if success:
                break

            # Check for error
            for sel in [".alert-danger", ".error", "[data-status='failed']"]:
                el = page.locator(sel).first
                if el.count() > 0 and el.is_visible():
                    txt = el.inner_text().strip()[:120]
                    print(f"   ❌ Error at {elapsed}s: {txt}")
                    shot(page, "web_11_pipeline_error.png")
                    break

            # Progress screenshot
            if elapsed - last_progress >= 20:
                last_progress = elapsed
                shot(page, f"web_progress_{elapsed}s.png")
                print(f"   ⏳ {elapsed}s...")
            
            time.sleep(3)

        elapsed = int(time.time() - t0)
        shot(page, "web_12_pipeline_final.png")

        # 10) Summary
        print("\n[10/10] Summary")
        print("-" * 70)
        failed = [c for c in api_calls if c["status"] >= 400]
        print(f"   API calls total: {len(api_calls)}")
        print(f"   API calls failed: {len(failed)}")
        if failed:
            print("   Failed endpoints:")
            for c in failed[:5]:
                print(f"     • {c['status']} {c['method']} {c['url']}")
        
        print(f"   Pipeline: {'✅ SUCCESS' if success else '❌ TIMEOUT/FAILED'} in {elapsed}s")
        if video_url:
            print(f"   Video URL: {video_url}")

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
