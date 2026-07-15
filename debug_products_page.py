#!/usr/bin/env python3
"""Debug: Check what's on the products page"""
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
                api_calls.append({
                    "status": r.status,
                    "method": r.request.method,
                    "url": r.url,
                    "body": r.text()[:500] if r.status < 400 else r.text()[:200]
                })
        page.on("response", on_resp)

        # Track console errors
        console_errors = []
        page.on("console", lambda msg: console_errors.append(f"{msg.type}: {msg.text}"))

        print("🔍 Debug: Products Page")
        print("=" * 60)

        # Open homepage
        print("\n[1] Open homepage...")
        page.goto(BASE, timeout=60000)
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        # Click Products tab
        print("[2] Click Products tab...")
        page.locator('button[data-tab="products"]').first.click()
        time.sleep(3)
        page.wait_for_selector("#page-products.active", timeout=10000)

        # Wait for network to settle
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        # Screenshot
        page.screenshot(path=str(OUT / "debug_products_page.png"))
        print(f"📸 Saved: debug_products_page.png")

        # Dump HTML of the products page
        products_html = page.locator("#page-products").inner_html()
        (OUT / "debug_products_page.html").write_text(products_html)
        print(f"💾 Saved: debug_products_page.html ({len(products_html)} bytes)")

        # Check for product cards
        cards = page.locator(".product-card")
        card_count = cards.count()
        print(f"\n[3] Found {card_count} .product-card elements")

        # Check if cards exist but are hidden
        if card_count > 0:
            visible_count = sum(1 for i in range(card_count) if cards.nth(i).is_visible())
            print(f"   Visible: {visible_count}, Hidden: {card_count - visible_count}")

        # Look for loading indicators
        loading = page.locator(".loading, .spinner, [data-loading]").count()
        print(f"\n[4] Loading indicators: {loading}")

        # Look for error messages
        errors = page.locator(".error, .alert-danger, [data-error]").count()
        if errors > 0:
            print(f"[5] Error messages: {errors}")
            error_text = page.locator(".error, .alert-danger").first.inner_text()
            print(f"   Error: {error_text[:200]}")
        else:
            print(f"[5] No error messages found")

        # Check for any cards/boxes
        all_cards = page.locator("#page-products .card, #page-products .box").count()
        print(f"\n[6] Generic cards/boxes: {all_cards}")

        # Get page title and any text
        title = page.locator("#page-products h2").first.inner_text() if page.locator("#page-products h2").count() > 0 else "No title"
        print(f"\n[7] Page title: {title}")

        # Get visible text in products page
        page_text = page.locator("#page-products").inner_text()[:500]
        print(f"\n[8] Page text preview:\n{page_text}")

        # API calls summary
        print(f"\n[9] API Calls: {len(api_calls)}")
        for call in api_calls:
            status_icon = "✅" if call["status"] < 400 else "❌"
            print(f"   {status_icon} {call['status']} {call['method']} {call['url'].split('?')[0]}")
            if call["status"] >= 400:
                print(f"      Response: {call['body'][:150]}")

        # Console errors
        print(f"\n[10] Console messages: {len(console_errors)}")
        for err in console_errors[:5]:
            print(f"   {err}")

        browser.close()

if __name__ == "__main__":
    run()
