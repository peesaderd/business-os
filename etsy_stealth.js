const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    bypassCSP: true,
  });

  const page = await context.newPage();
  
  console.log('Navigating to Etsy...');
  await page.goto('https://www.etsy.com/your/shops/me/dashboard', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });

  const url = page.url();
  console.log('URL:', url);

  // Check if we got blocked
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Page text:', bodyText);

  // Take screenshot
  await page.screenshot({ path: '/tmp/etsy_dash.png', fullPage: false });
  console.log('Screenshot saved');

  await browser.close();
})();
