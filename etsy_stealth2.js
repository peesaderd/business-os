const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
  });

  const page = await context.newPage();
  
  console.log('Step 1: Navigate...');
  await page.goto('https://www.etsy.com/your/shops/me/dashboard', { 
    waitUntil: 'domcontentloaded', timeout: 30000 
  });
  
  await sleep(5000);
  
  let url = page.url();
  console.log('URL after 5s:', url);
  
  // Check all iframes/frames
  const frames = page.frames();
  console.log('Frames:', frames.length);
  
  // Check HTML structure briefly
  const html = await page.evaluate(() => document.body ? document.body.innerHTML.substring(0, 2000) : 'no body');
  console.log('HTML snippet:', html.substring(0, 1000));
  
  // Wait longer
  await sleep(8000);
  console.log('URL after 13s:', page.url());
  
  // Try again with the full page text
  const text = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 1000) : 'no body');
  console.log('Body text:', text);

  await page.screenshot({ path: '/tmp/etsy_dash2.png', fullPage: true });
  console.log('Screenshot saved');

  await browser.close();
})();
