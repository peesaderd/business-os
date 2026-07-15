#!/usr/bin/env python3
"""
Test TikTok UGC Studio ผ่านหน้าเว็บด้วย Playwright
"""
import asyncio
from playwright.async_api import async_playwright
import json
import time

async def test_tiktok_studio():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        
        try:
            # 1. เปิดหน้าแรก
            print("🌐 เปิดหน้า TikTok UGC Studio...")
            await page.goto("http://localhost:8105/tiktok/", timeout=30000)
            await page.wait_for_load_state("networkidle")
            await asyncio.sleep(2)
            
            # ถ่าย screenshot หน้าแรก
            await page.screenshot(path="/home/openhands/.openclaw/workspace/media/pipeline-demo/web_01_homepage.png")
            print("✅ ถ่าย screenshot หน้าแรก")
            
            # 2. คลิก tab Products
            print("\n📦 คลิก tab Products...")
            products_tab = page.locator("button[data-tab='products'], a:has-text('Products')").first
            await products_tab.click()
            await asyncio.sleep(2)
            
            await page.screenshot(path="/home/openhands/.openclaw/workspace/media/pipeline-demo/web_02_products_tab.png")
            print("✅ ถ่าย screenshot Products tab")
            
            # 3. หา product item แรก
            print("\n🎯 หา product item...")
            product_item = page.locator(".product-item, [data-product], .card").first
            if await product_item.count() > 0:
                await product_item.click()
                await asyncio.sleep(2)
                
                await page.screenshot(path="/home/openhands/.openclaw/workspace/media/pipeline-demo/web_03_product_selected.png")
                print("✅ ถ่าย screenshot Product selected")
                
                # 4. หาปุ่ม Generate
                print("\n🎬 หาปุ่ม Generate...")
                generate_btn = page.locator("button:has-text('Generate'), button:has-text('สร้าง'), button[type='submit']").first
                if await generate_btn.count() > 0:
                    print("   คลิกปุ่ม Generate...")
                    await generate_btn.click()
                    
                    # รอให้ pipeline ทำงาน (อาจใช้เวลา 1-3 นาที)
                    print("   ⏳ รอ pipeline ทำงาน...")
                    await asyncio.sleep(5)
                    
                    # ถ่าย screenshot ระหว่างทำงาน
                    await page.screenshot(path="/home/openhands/.openclaw/workspace/media/pipeline-demo/web_04_generating.png")
                    print("   ✅ ถ่าย screenshot ระหว่าง generate")
                    
                    # รอให้เสร็จ (นานสุด 3 นาที)
                    print("   ⏳ รอ pipeline เสร็จ...")
                    for i in range(36):  # 36 * 5 = 180 วินาที
                        await asyncio.sleep(5)
                        
                        # เช็คว่ามี video หรือ audio ขึ้นมาหรือยัง
                        video = page.locator("video, audio, .result, .output").first
                        if await video.count() > 0:
                            print(f"   ✅ พบผลลัพธ์หลัง {i*5} วินาที")
                            break
                        
                        # ถ่าย screenshot ทุก 30 วินาที
                        if i % 6 == 0:
                            await page.screenshot(path=f"/home/openhands/.openclaw/workspace/media/pipeline-demo/web_04_progress_{i}.png")
                    
                    # ถ่าย screenshot สุดท้าย
                    await page.screenshot(path="/home/openhands/.openclaw/workspace/media/pipeline-demo/web_05_result.png")
                    print("✅ ถ่าย screenshot ผลลัพธ์สุดท้าย")
                    
                else:
                    print("❌ ไม่พบปุ่ม Generate")
            else:
                print("❌ ไม่พบ product item")
                # ถ่าย screenshot เพื่อดูว่ามีอะไร
                await page.screenshot(path="/home/openhands/.openclaw/workspace/media/pipeline-demo/web_03_no_products.png")
            
            # 5. เช็ค console errors
            print("\n🔍 เช็ค console errors...")
            console_logs = []
            page.on("console", lambda msg: console_logs.append(f"{msg.type}: {msg.text}"))
            await asyncio.sleep(1)
            
            errors = [log for log in console_logs if "error" in log.lower()]
            if errors:
                print(f"⚠️  พบ {len(errors)} errors:")
                for err in errors[:5]:
                    print(f"   {err}")
            else:
                print("✅ ไม่พบ console errors")
            
        except Exception as e:
            print(f"❌ เกิดข้อผิดพลาด: {e}")
            await page.screenshot(path="/home/openhands/.openclaw/workspace/media/pipeline-demo/web_error.png")
            
        finally:
            await browser.close()
            print("\n🏁 เสร็จสิ้นการทดสอบ")

if __name__ == "__main__":
    asyncio.run(test_tiktok_studio())
