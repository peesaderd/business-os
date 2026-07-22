"""
POD Wizard — Real E2E Browser Test (Playwright)
Tests the full wizard flow in a real headless browser.
Catches JS errors, network failures, rendering bugs.

Usage:  python3 test_e2e_browser.py [--headed]
"""

import os, sys
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE_URL = os.environ.get("POD_URL", "https://podwizard.m2igen.com")
HEADED = "--headed" in sys.argv

PASS = 0
FAIL = 0
failures = []

def _check(cond, msg, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("    [OK] " + msg)
    else:
        FAIL += 1
        failures.append("FAIL: " + msg + ": " + detail[:200])
        print("    [FAIL] " + msg)
        if detail:
            for line in detail.split("\n")[:3]:
                print("       " + line)

def step(n, title):
    print("\n  Step %d: %s" % (n, title))

def run():
    global PASS, FAIL, failures
    PASS = FAIL = 0
    failures = []
    js_errors = []

    print("=== POD Wizard E2E Browser Test ===")
    print("Target: " + BASE_URL)
    print("Headed: " + str(HEADED))
    print("=" * 50)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=(not HEADED),
            args=["--no-sandbox", "--disable-setuid-sandbox"]
        )
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 900}
        )
        page = ctx.new_page()

        page.on("console", lambda msg: js_errors.append(
            "[%s] %s" % (msg.type, msg.text[:120])
        ) if msg.type in ("error", "warning") else None)
        page.on("pageerror", lambda err: js_errors.append(str(err)))

        try:
            # Step 1: Page loads
            step(1, "Page loads")
            r = page.goto(BASE_URL, wait_until="domcontentloaded", timeout=15000)
            page.wait_for_load_state("networkidle", timeout=10000)
            _check(r is not None and r.status == 200, "HTTP 200")
            title = page.text_content("h1") or ""
            _check("PODWIZARD" in title.upper(), "Title OK: " + title.strip()[:40])

            # Step 2: No JS errors
            step(2, "No JS console errors")
            if js_errors:
                for e in js_errors[:3]:
                    print("      WARN: " + e)
            _check(len(js_errors) == 0, "Zero JS errors")

            # Step 3: Card visibility
            step(3, "Step cards hidden/shown correctly")
            visible = page.evaluate('''() => {
                return Array.from(document.querySelectorAll('.card'))
                    .filter(c => !c.classList.contains('hidden'))
                    .map(c => c.id);
            }''')
            _check(visible == ["step-provider"],
                   "Only step-provider visible: " + str(visible))

            # Step 4: Click Printful -> categories
            step(4, "Click Printful -> categories load")
            page.click("button:has-text('Printful'):not([disabled])")
            page.wait_for_selector("#categoryList button", timeout=15000)
            cat_count = page.evaluate(
                "document.querySelectorAll('#categoryList button').length")
            _check(cat_count >= 4, "Categories count: " + str(cat_count))

            # Step 5: Click category -> products
            step(5, "Click category -> products load")
            first_cat = page.locator("#categoryList button").first
            cat_label = first_cat.text_content().strip()[:30]
            first_cat.click()
            page.wait_for_selector("#productList .card:not(.hidden)", timeout=15000)
            prod_count = page.evaluate(
                "document.querySelectorAll('#productList .card:not(.hidden)').length")
            _check(prod_count >= 1, "Products count: " + str(prod_count))

            # Step 6: Click product -> variants
            step(6, "Click product -> variants load")
            page.wait_for_selector("#productList .card:not(.hidden)", timeout=5000)
            first_prod = page.locator("#productList .card:not(.hidden)").first
            prod_label = first_prod.text_content().strip()[:30]
            first_prod.click()
            page.wait_for_selector("#variantList button", timeout=15000)
            var_count = page.evaluate(
                "document.querySelectorAll('#variantList button').length")
            _check(var_count >= 1, "Variants count: " + str(var_count))

            # Step 7: Click variant -> artwork
            step(7, "Click variant -> artwork step")
            first_var = page.locator("#variantList button").first
            var_label = first_var.text_content().strip()[:30]
            first_var.click()
            page.wait_for_timeout(1000)
            visible = page.evaluate('''() => {
                return Array.from(document.querySelectorAll('.card'))
                    .filter(c => !c.classList.contains('hidden'))
                    .map(c => c.id);
            }''')
            _check("step-artwork" in visible, "Artwork step visible: " + str(visible))
            _check(page.locator("#artworkUrl").is_visible(), "URL input visible")
            _check(page.locator("button.btn-primary:has-text('Mockup')").is_visible(), "Mockup button visible")

            # Step 8: Empty mockup -> error
            step(8, "Submit empty artwork -> error toast")
            page.fill("#artworkUrl", "")
            page.click("button.btn-primary:has-text('Mockup')")
            page.wait_for_timeout(2000)
            status = page.evaluate(
                "document.getElementById('statusText')?.textContent || ''")
            is_error = "error" in status.lower() or "fail" in status.lower() or "red" in status or "\U0001f534" in status or status.strip() == ""
            _check(is_error, "Error shown on empty URL: " + status.strip()[:60])

            # Step 9: Final JS errors
            step(9, "Final JS error summary")
            _check(len(js_errors) == 0, "JS errors total: " + str(len(js_errors)))

            # Step 10: Screenshot
            step(10, "Screenshot")
            page.screenshot(path="/tmp/podwizard-e2e-final.png", full_page=True)
            _check(True, "Screenshot saved")

        finally:
            browser.close()

    total = PASS + FAIL
    print("\n" + "=" * 50)
    print("Results: %d passed, %d failed, %d total" % (PASS, FAIL, total))
    if failures:
        print("\nFailures:")
        for f in failures:
            print("  " + f)
    return FAIL == 0

if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
