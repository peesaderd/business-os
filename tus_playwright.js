// TUS Content Wizard — Playwright Automation
// Usage: xvfb-run node tus_playwright.js

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    // Step 1: Open TUS
    console.log('📱 Opening TUS Web UI...');
    await page.goto('http://localhost:8105/tiktok/', { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: '/tmp/tus_01_home.png' });
    console.log('   ✓ Page loaded, screenshot: /tmp/tus_01_home.png');

    // Step 2: Switch to Studio tab (Content Wizard)
    // The SPA uses switchTab('content')
    const studioBtn = await page.$('button[data-tab="content"]');
    if (studioBtn) {
      await studioBtn.click();
      await page.waitForTimeout(1000);
      console.log('   ✓ Clicked Studio tab');
    }

    // Wait for the Content Wizard page to render
    await page.waitForSelector('#page-content', { timeout: 5000 }).catch(() => {
      console.log('   ℹ️  #page-content not found, checking page-content...');
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/tus_02_content_wizard.png' });
    console.log('   ✓ Content Wizard loaded, screenshot: /tmp/tus_02_content_wizard.png');

    // Step 3: Try to open product picker modal
    // The product picker button has onclick="openProductPicker()"
    const productPickerBtn = await page.$('button[onclick="openProductPicker()"]');
    if (productPickerBtn) {
      console.log('   📦 Clicking product picker...');
      await productPickerBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/tus_03_product_picker.png' });
      console.log('   ✓ Product picker opened, screenshot: /tmp/tus_03_product_picker.png');
      
      // Try to click the first product in the grid
      const productGrid = await page.$('#productPickerGrid');
      if (productGrid) {
        const productCards = await productGrid.$$('.product-card');
        if (productCards.length > 0) {
          console.log(`   🎯 Clicking first product (${productCards.length} available)...`);
          await productCards[0].click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: '/tmp/tus_04_product_selected.png' });
          console.log('   ✓ Product selected, screenshot: /tmp/tus_04_product_selected.png');
        }
      }
    }

    // Step 4: Fill in product details manually if we have the title field
    const productTitle = await page.$('#productTitle');
    if (productTitle) {
      await productTitle.fill('LA GLACE MELTED SUNDAE LIP CLICK');
      console.log('   ✓ Filled product title');
    }
    
    const productDetails = await page.$('#productDetails');
    if (productDetails) {
      await productDetails.fill('ลิปไอติมลากลาส 26สี สีระเรื่อ & ปากฉ่ำขั้นสุด ลิปกด ลิปฉ่ำ ราคา ฿218');
      console.log('   ✓ Filled product details');
    }

    // Step 5: Select UGC Style (default is "holding" which is fine)
    // Step 6: Select duration (8s is default)

    // Step 7: Click "Next: Generate Script →"
    const genScriptBtn = await page.$('button[onclick="generateScript()"]');
    if (genScriptBtn) {
      console.log('   🤖 Clicking Generate Script...');
      await genScriptBtn.click();
      await page.waitForTimeout(5000); // Wait for Mistral API call
      await page.screenshot({ path: '/tmp/tus_05_script_generated.png' });
      console.log('   ✓ Script generated, screenshot: /tmp/tus_05_script_generated.png');
    }

    // Step 8: Read what was generated
    const hook = await page.$eval('#scriptHook', el => el.value).catch(() => 'N/A');
    const value = await page.$eval('#scriptValue', el => el.value).catch(() => 'N/A');
    const cta = await page.$eval('#scriptCta', el => el.value).catch(() => 'N/A');
    
    console.log('\n=== 📝 GENERATED SCRIPT ===');
    console.log(`  Hook:     ${hook}`);
    console.log(`  Value:    ${value}`);
    console.log(`  CTA:      ${cta}`);

    // Step 9: Click "Next: สรุปรายละเอียด →" to go to Step 3
    const step3Btn = await page.$('button[onclick="goToStep3()"]');
    if (step3Btn) {
      await step3Btn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '/tmp/tus_06_step3_summary.png' });
      console.log('\n   ✓ Step 3 Summary page, screenshot: /tmp/tus_06_step3_summary.png');
      
      // Read Step 3 values
      const s3Hook = await page.$eval('#step3Hook', el => el.textContent).catch(() => 'N/A');
      const s3Value = await page.$eval('#step3Value', el => el.textContent).catch(() => 'N/A');
      const s3Cta = await page.$eval('#step3Cta', el => el.textContent).catch(() => 'N/A');
      const s3Duration = await page.$eval('#step3Duration', el => el.textContent).catch(() => 'N/A');
      const s3Scene = await page.$eval('#step3Scene', el => el.textContent).catch(() => 'N/A');
      const s3Voice = await page.$eval('#step3Voice', el => el.textContent).catch(() => 'N/A');
      const s3Prompt = await page.$eval('#step3Prompt', el => el.textContent).catch(() => 'N/A');
      const s3Mood = await page.$eval('#step3Mood', el => el.textContent).catch(() => 'N/A');
      const s3Hashtags = await page.$eval('#step3Hashtags', el => el.textContent).catch(() => 'N/A');

      console.log('\n=== 📋 SUMMARY PAGE ===');
      console.log(`  ⏱️ Duration:  ${s3Duration}`);
      console.log(`  🎞️ Scene:     ${s3Scene}`);
      console.log(`  🎙️ Voice:     ${s3Voice}`);
      console.log(`  🤖 Prompt:    ${s3Prompt}`);
      console.log(`  🎨 Mood:      ${s3Mood}`);
      console.log(`  🏷️ Hashtags:  ${s3Hashtags}`);
    }

    console.log('\n✅ DONE! Screenshots saved to /tmp/tus_*.png');
    
  } catch(e) {
    console.error('❌ Error:', e.message);
    await page.screenshot({ path: '/tmp/tus_error.png' });
  } finally {
    await browser.close();
  }
})();
