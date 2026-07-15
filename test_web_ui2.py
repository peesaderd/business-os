#!/usr/bin/env python3
"""Test TikTok UGC Studio web UI via Playwright"""
import time
from playwright.sync_api import sync_playwright

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        ctx = browser.new_context(viewport={'width': 1920, 'height': 1080}, ignore_https_errors=True)
        page = ctx.new_page()
        
        # Track API calls
        api_calls = []
        failed_apis = []
        
        def on_response(resp):
            if '/api/tiktok/' in resp.url:
                api_calls.append(f"{resp.status} {resp.url}")
                if resp.status >= 400:
                    failed_apis.append(f"{resp.status} {resp.url}")
        
        page.on('response', on_response)
        
        print("🌐 เปิดหน้า TikTok UGC Studio...")
        page.goto('https://openhands.m2igen.com/tiktok/', wait_until='networkidle')
        time.sleep(2)
        
        page.screenshot(path='media/pipeline-demo/web_01_homepage.png')
        print(f"✅ Screenshot: web_01_homepage.png")
        
        # Check for nav buttons
        nav_buttons = page.locator('.topbar-nav button, .side-nav-body button')
        print(f"\n🔍 พบปุ่ม navigation: {nav_buttons.count()} ปุ่ม")
        
        # Find Products button in side nav
        products_btn = page.locator('[data-tab="products"]')
        print(f"🔍 Products buttons: {products_btn.count()}")
        
        if products_btn.count() > 0:
            print("📦 คลิก Products tab...")
            products_btn.first.click()
            time.sleep(3)
            page.screenshot(path='media/pipeline-demo/web_02_products.png')
            print("✅ Screenshot: web_02_products.png")
            
            # Check API calls after clicking Products
            print(f"\n📡 API calls after clicking Products:")
            for call in api_calls[-10:]:
                print(f"   {call}")
            
            # Look for product list / cards
            product_cards = page.locator('.product-card, .card, [data-product], table tbody tr, .product-item')
            print(f"\n🔍 Product cards found: {product_cards.count()}")
            
            if product_cards.count() > 0:
                print("🎯 คลิก product แรก...")
                product_cards.first.click()
                time.sleep(1)
                page.screenshot(path='media/pipeline-demo/web_03_product_selected.png')
                print("✅ Screenshot: web_03_product_selected.png")
                
                # Look for generate button
                gen_btn = page.locator('button:has-text("Generate"), button:has-text("สร้าง"), button:has-text("Run")')
                print(f"🔍 Generate buttons: {gen_btn.count()}")
                
                if gen_btn.count() > 0:
                    print("🚀 คลิก Generate...")
                    gen_btn.first.click()
                    time.sleep(5)
                    page.screenshot(path='media/pipeline-demo/web_04_generating.png')
                    print("✅ Screenshot: web_04_generating.png")
                    
                    # Wait for pipeline to complete
                    print("⏳ รอ pipeline เสร็จ (นานสุด 3 นาที)...")
                    for i in range(36):
                        time.sleep(5)
                        video = page.locator('video, .result, .success, .completed')
                        if video.count() > 0:
                            print(f"✅ พบผลลัพธ์หลัง {i*5} วินาที!")
                            break
                        if i % 6 == 0 and i > 0:
                            page.screenshot(path=f'media/pipeline-demo/web_progress_{i*5}s.png')
                            print(f"   ⏳ {i*5}s...")
                    
                    time.sleep(2)
                    page.screenshot(path='media/pipeline-demo/web_05_result.png')
                    print("✅ Screenshot: web_05_result.png")
            else:
                print("❌ ไม่พบ product cards")
                # Debug: what's on the page?
                body_text = page.locator('body').inner_text()[:500]
                print(f"   Body preview: {body_text[:200]}")
        else:
            print("❌ ไม่พบ Products tab")
        
        # Print any failed API calls
        if failed_apis:
            print(f"\n❌ Failed API calls ({len(failed_apis)}):")
            for fail in failed_apis[:5]:
                print(f"   {fail}")
        else:
            print("\n✅ ไม่พบ API errors!")
        
        browser.close()
        print("\n🏁 เสร็จสิ้น")

if __name__ == '__main__':
    run_test()
