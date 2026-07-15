#!/usr/bin/env python3
"""Test TikTok UGC Studio web UI - Full pipeline test"""
import time
import json
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
        print("✅ Homepage screenshot saved")
        
        # Find and click Products tab
        print("\n📦 คลิก Products tab...")
        products_btn = page.locator('[data-tab="products"]')
        if products_btn.count() > 0:
            products_btn.first.click()
            time.sleep(3)
            page.screenshot(path='media/pipeline-demo/web_02_products_tab.png')
            print("✅ Products tab screenshot saved")
            
            # Get page HTML to debug
            products_html = page.locator('#products').inner_html()
            with open('media/pipeline-demo/products_tab_debug.html', 'w') as f:
                f.write(products_html)
            print("✅ Products tab HTML saved")
            
            # Check for product cards that are visible
            print("\n🔍 หา product cards ที่ visible...")
            all_cards = page.locator('.card[data-product]')
            print(f"   พบ .card[data-product]: {all_cards.count()} cards")
            
            # Try to find visible cards
            visible_cards = all_cards.filter(visible=True)
            print(f"   Cards ที่ visible: {visible_cards.count()}")
            
            if visible_cards.count() > 0:
                # Click first visible card
                print("\n🎯 คลิก product card แรก...")
                visible_cards.first.click()
                time.sleep(2)
                page.screenshot(path='media/pipeline-demo/web_03_product_selected.png')
                print("✅ Product selected screenshot saved")
                
                # Check selected product info
                selected_info = page.locator('#selectedProductInfo').inner_text()
                print(f"   Product info: {selected_info[:100]}...")
                
                # Look for generate button
                print("\n🚀 หา Generate Video button...")
                gen_btn = page.locator('button:has-text("Generate Video"), button:has-text("สร้างวิดีโอ")')
                print(f"   พบ Generate button: {gen_btn.count()}")
                
                if gen_btn.count() > 0 and gen_btn.first.is_visible():
                    print("✅ คลิก Generate Video...")
                    gen_btn.first.click()
                    time.sleep(5)
                    page.screenshot(path='media/pipeline-demo/web_04_generating.png')
                    print("✅ Generating screenshot saved")
                    
                    # Wait for pipeline to complete
                    print("\n⏳ รอ pipeline เสร็จ (นานสุด 3 นาที)...")
                    for i in range(36):  # 3 minutes max
                        time.sleep(5)
                        
                        # Check for success
                        result = page.locator('#pipelineResult, .result-success, .video-result')
                        if result.count() > 0 and result.first.is_visible():
                            print(f"✅ Pipeline เสร็จหลัง {i*5} วินาที!")
                            break
                        
                        # Check for error
                        error = page.locator('.error, .alert-danger')
                        if error.count() > 0 and error.first.is_visible():
                            print(f"❌ เกิด error หลัง {i*5} วินาที")
                            error_text = error.first.inner_text()
                            print(f"   Error: {error_text}")
                            break
                        
                        if i % 6 == 0 and i > 0:
                            page.screenshot(path=f'media/pipeline-demo/web_progress_{i*5}s.png')
                            print(f"   ⏳ {i*5}s...")
                    
                    time.sleep(2)
                    page.screenshot(path='media/pipeline-demo/web_05_final_result.png')
                    print("✅ Final result screenshot saved")
                    
                    # Try to download video URL
                    video_el = page.locator('video').first
                    if video_el.count() > 0:
                        video_src = video_el.get_attribute('src')
                        print(f"✅ Video URL: {video_src}")
                        
                        # Save result JSON
                        result_data = {
                            'success': True,
                            'video_url': video_src,
                            'api_calls': api_calls,
                            'failed_apis': failed_apis
                        }
                        with open('media/pipeline-demo/pipeline_result.json', 'w') as f:
                            json.dump(result_data, f, indent=2)
                        print("✅ Result JSON saved")
                else:
                    print("❌ ไม่พบ Generate Video button ที่ visible")
            else:
                print("❌ ไม่พบ product card ที่ visible")
                print("   ลอง scroll down...")
                page.evaluate('window.scrollBy(0, 500)')
                time.sleep(1)
                visible_cards_after_scroll = all_cards.filter(visible=True)
                print(f"   Cards ที่ visible หลัง scroll: {visible_cards_after_scroll.count()}")
        else:
            print("❌ ไม่พบ Products tab")
        
        # Print API summary
        print(f"\n📊 API Summary:")
        print(f"   Total calls: {len(api_calls)}")
        print(f"   Failed calls: {len(failed_apis)}")
        
        if failed_apis:
            print("\n❌ Failed API calls:")
            for fail in failed_apis[:10]:
                print(f"   {fail}")
        else:
            print("✅ ไม่มี API errors!")
        
        browser.close()
        print("\n🏁 เสร็จสิ้นการทดสอบ")

if __name__ == '__main__':
    run_test()
