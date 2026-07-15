#!/usr/bin/env python3
"""TUS Content Wizard — Playwright Automation"""

import asyncio, json, os
from playwright.async_api import async_playwright

SCREENSHOT_DIR = "/tmp"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = await browser.new_page(viewport={"width": 1280, "height": 800})

        async def ss(name):
            path = f"{SCREENSHOT_DIR}/{name}.png"
            await page.screenshot(path=path)
            print(f"  📸 {name}.png")

        try:
            # 1. Open TUS
            print("📱 Opening TUS Web UI...")
            await page.goto("http://localhost/tiktok/", wait_until="networkidle", timeout=15000)
            await ss("01_home")

            # 2. Switch to Studio tab
            studio_btn = page.locator('button[data-tab="content"]')
            if await studio_btn.count() > 0:
                await studio_btn.click()
                await asyncio.sleep(1)
                print("   ✓ Clicked Studio tab")

            # Wait for Content Wizard to appear
            await page.wait_for_selector("#page-content", timeout=5000)
            await ss("02_content_wizard")
            print("   ✓ Content Wizard loaded")

            # 3. Open product picker modal
            picker_btn = page.locator('button[onclick="openProductPicker()"]')
            if await picker_btn.count() > 0:
                print("   📦 Opening product picker...")
                await picker_btn.click()
                await asyncio.sleep(2)
                await ss("03_product_picker")

                # Try to click first product
                product_cards = page.locator("#productPickerGrid .product-card")
                count = await product_cards.count()
                if count > 0:
                    # Get first product's text
                    first = product_cards.first
                    text = await first.inner_text()
                    print(f"   🎯 First product ({count} total): {text[:60].strip()}")
                    await first.click()
                    await asyncio.sleep(1.5)
                    await ss("04_product_selected")
                    print("   ✓ Product selected from picker")

                    # Read what was filled
                    title_val = await page.input_value("#productTitle").catch(lambda: "")
                    print(f"   📝 Title filled: {title_val[:50]}")
                else:
                    print("   ⚠️ No product cards found, doing manual fill instead")

            # 4. Manual fill if product picker didn't work
            title_input = page.locator("#productTitle")
            if await title_input.count() > 0:
                current = await title_input.input_value()
                if not current:
                    await title_input.fill("LA GLACE MELTED SUNDAE LIP CLICK")
                    await page.locator("#productDetails").fill(
                        "ลิปไอติมลากลาส 26สี สีระเรื่อ & ปากฉ่ำขั้นสุด ลิปกด ลิปฉ่ำ ราคา ฿218"
                    )
                    print("   ✓ Manual product details filled")

            await ss("04b_form_filled")

            # 5. Click Generate Script
            gen_btn = page.locator('button[onclick="generateScript()"]')
            if await gen_btn.count() > 0:
                print("   🤖 Clicking Generate Script...")
                async with page.expect_response(lambda r: "/scripts/generate" in r.url) as resp_info:
                    await gen_btn.click()
                resp = await resp_info.value
                print(f"   ✓ Script API response: {resp.status}")
                await asyncio.sleep(1)
                await ss("05_script_generated")

                # Read script values
                hook = await page.input_value("#scriptHook")
                value = await page.input_value("#scriptValue")
                cta = await page.input_value("#scriptCta")
                
                print("\n=== 📝 GENERATED SCRIPT ===")
                print(f"  Hook:     {hook[:80]}")
                print(f"  Value:    {value[:80]}")
                print(f"  CTA:      {cta[:60]}")

                # 6. Go to Step 3 (summary)
                step3_btn = page.locator('button[onclick="goToStep3()"]')
                if await step3_btn.count() > 0:
                    await step3_btn.click()
                    await asyncio.sleep(1)
                    await ss("06_step3_summary")
                    print("\n=== 📋 STEP 3 SUMMARY ===")
                    for field_id in ["step3Hook", "step3Value", "step3Cta", "step3Duration", 
                                      "step3Scene", "step3Voice", "step3Prompt", "step3Mood", "step3Hashtags"]:
                        text = await page.locator(f"#{field_id}").text_content()
                        print(f"  {field_id}: {text[:100] if text else 'N/A'}")
                else:
                    print("   ⚠️ Step 3 button not found")

            await ss("07_final")
            print("\n✅ DONE! All screenshots in /tmp/")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            await ss("error")
        finally:
            await browser.close()

asyncio.run(main())
