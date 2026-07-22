const { chromium } = require('playwright');

(async () => {
  // Connect to running Chrome instance
  const browser = await chromium.connectOverCDP('http://127.0.0.1:18800');
  const contexts = browser.contexts();
  
  // Try existing page
  let page = null;
  for (const ctx of contexts) {
    const pages = ctx.pages();
    for (const p of pages) {
      if (p.url().includes('etsy')) {
        page = p;
        break;
      }
    }
  }
  
  if (!page) {
    console.log('No Etsy page found, creating new one...');
    const ctx = contexts[0] || await browser.newContext();
    page = await ctx.newPage();
    await page.goto('https://www.etsy.com/your/shops/me/dashboard', { waitUntil: 'domcontentloaded' });
  }
  
  console.log('Current URL:', page.url());
  console.log('Waiting for page to load...');
  await page.waitForTimeout(3000);
  
  // Try frames
  const frames = page.frames();
  console.log('Frames:', frames.length);
  
  for (const f of frames) {
    console.log('Frame URL:', f.url().substring(0, 100));
    if (f.url().includes('captcha-delivery') || f.url().includes('geo.captcha')) {
      console.log('Found captcha frame!');
      
      try {
        await f.waitForSelector('[role="slider"], [aria-role="slider"], .slider, [class*="slider"]', { timeout: 5000 });
        console.log('Slider found!');
        
        // Try to get slider dimensions
        const slider = await f.$('[role="slider"]') || await f.$('.slider');
        if (slider) {
          const box = await slider.boundingBox();
          console.log('Slider box:', box);
          
          if (box) {
            // Drag slider from left to right
            await page.mouse.move(box.x + 5, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width, box.y + box.height / 2, { steps: 50 });
            await page.mouse.up();
            console.log('Slider drag completed');
          }
        } else {
          console.log('Found captcha frame but no slider element by selector');
          // Try to find any interactive element
          const interactives = await f.evaluate(() => {
            const els = document.querySelectorAll('button, div[role="button"], a, input, [tabindex]');
            return Array.from(els).map(e => ({
              tag: e.tagName,
              text: (e.textContent || '').substring(0, 30),
              rect: e.getBoundingClientRect(),
              role: e.getAttribute('role'),
              class: e.className
            }));
          });
          console.log('Interactive elements:', JSON.stringify(interactives.slice(0, 20), null, 2));
        }
      } catch (e) {
        console.log('No slider found:', e.message);
      }
      
      console.log('Captcha frame content:', await f.evaluate(() => document.body.innerText.substring(0, 300)));
    }
  }
  
  await page.screenshot({ path: '/tmp/etsy_captcha_result.png', fullPage: true });
  console.log('Screenshot saved');
  
  console.log('Final URL:', page.url());
  console.log('Title:', await page.title());
  
  await browser.close();
})();
