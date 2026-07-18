import { chromium } from 'playwright';

const BASE = 'https://m2igen.com/tiktok';
const HEADLESS = true;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const results = { passed: [], failed: [], warnings: [] };
  function pass(msg) { results.passed.push(msg); console.log(`  ✅ ${msg}`); }
  function fail(msg) { results.failed.push(msg); console.log(`  ❌ ${msg}`); }
  function warn(msg) { results.warnings.push(msg); console.log(`  ⚠️ ${msg}`); }

  try {
    // ─── Step 1: Load dashboard ───
    console.log('\n📋 Step 1: Load Dashboard');
    await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);
    const dashUrl = page.url();
    console.log(`  URL: ${dashUrl}`);
    const dashTitle = await page.title();
    console.log(`  Title: ${dashTitle}`);

    // Check for visible content
    const bodyText = await page.textContent('body');
    const hasError = bodyText.includes('error') || bodyText.includes('Error') || bodyText.includes('404');
    if (hasError) {
      fail('Dashboard shows error/404 page');
      console.log(`  Body preview: ${bodyText.substring(0, 300)}`);
    } else {
      pass('Dashboard loaded successfully');
    }

    // Look for key elements - wait a moment for SPA to render
    await sleep(3000);
    
    // Take screenshot for debugging
    await page.screenshot({ path: '/tmp/tiktok-test-01-dashboard.png', fullPage: false });

    // ─── Step 2: Check dashboard elements ───
    console.log('\n📋 Step 2: Dashboard Elements');
    
    // Look for common dashboard elements
    const dashboardElements = await page.evaluate(() => {
      const all = document.querySelectorAll('*');
      const texts = [];
      const ids = [];
      const classes = [];
      for (const el of all) {
        if (el.id) ids.push(el.id);
        if (el.className && typeof el.className === 'string' && el.className.length > 3) classes.push(el.className);
        const t = el.textContent?.trim();
        if (t && t.length > 3 && t.length < 50) texts.push(t);
      }
      return { ids: ids.slice(0, 30), classes: classes.slice(0, 30), texts: texts.slice(0, 40) };
    });
    
    console.log(`  IDs found: ${dashboardElements.ids.length > 0 ? dashboardElements.ids.slice(0, 15).join(', ') : 'none'}`);
    console.log(`  Classes: ${dashboardElements.classes.length > 0 ? dashboardElements.classes.slice(0, 10).join(', ') : 'none'}`);
    console.log(`  Key texts: ${dashboardElements.texts.slice(0, 20).join(' | ')}`);

    // ─── Step 3: Check if we can find a new-pipeline/create button ───
    console.log('\n📋 Step 3: Pipeline Creation Flow');
    
    // Try clicking links/buttons related to pipeline or create
    const clickableTexts = ['New Pipeline', 'Create', '+', 'Start', 'Pipeline', 'Generate'];
    let clickedSomething = false;
    for (const txt of clickableTexts) {
      const link = page.locator(`text=${txt}`).first();
      if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`  Found clickable: "${txt}"`);
        clickedSomething = true;
        break;
      }
    }
    if (!clickedSomething) {
      warn('No pipeline creation button found on dashboard');
    } else {
      pass('Pipeline creation button found');
    }

    // ─── Step 4: Check API health ───
    console.log('\n📋 Step 4: Backend Health Check');
    try {
      const healthResp = await page.evaluate(() =>
        fetch('/api/tiktok/health').then(r => r.json()).catch(() => ({ error: 'fetch failed' }))
      );
      console.log(`  Health API: ${JSON.stringify(healthResp)}`);
      if (healthResp.status === 'ok') pass('Backend health endpoint OK');
      else warn(`Health response: ${JSON.stringify(healthResp)}`);
    } catch (e) {
      warn(`Cannot reach health endpoint: ${e.message}`);
    }

    // ─── Step 5: Check available routes/endpoints ───
    console.log('\n📋 Step 5: Available API Endpoints');
    
    // Try to list jobs/pipelines
    try {
      const jobsResp = await page.evaluate(() =>
        fetch('/api/tiktok/pipeline/list').then(r => r.json()).catch(() => ({ error: 'fetch failed' }))
      );
      console.log(`  Pipeline list: ${JSON.stringify(jobsResp).substring(0, 200)}`);
      if (!jobsResp.error) pass('Pipeline list endpoint available');
      else warn(`Pipeline list: ${JSON.stringify(jobsResp)}`);
    } catch (e) {
      warn(`Pipeline list error: ${e.message}`);
    }

    // ─── Step 6: Check dashboard nav/sidebar ───
    console.log('\n📋 Step 6: Navigation Structure');
    const navLinks = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a, button, [role="button"], [role="tab"], [role="menuitem"]');
      return Array.from(anchors).slice(0, 25).map(a => ({
        text: a.textContent?.trim().substring(0, 30),
        href: a.href || a.getAttribute('data-path') || '',
        tag: a.tagName
      })).filter(a => a.text?.length > 0);
    });
    
    if (navLinks.length > 0) {
      console.log(`  Nav items found: ${navLinks.length}`);
      for (const n of navLinks) {
        console.log(`    [${n.tag}] ${n.text}\t${n.href ? n.href.substring(0, 60) : ''}`);
      }
      pass(`Navigation has ${navLinks.length} items`);
    } else {
      warn('No navigation links found');
    }

    // ─── Step 7: Check what routes exist in the SPA ───
    console.log('\n📋 Step 7: SPA Routes');
    const routes = ['/tiktok', '/tiktok/#dashboard', '/tiktok/#create', '/tiktok/#pipelines', '/tiktok/#settings'];
    for (const route of routes) {
      try {
        await page.goto(`${BASE.replace('/tiktok', '')}${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await sleep(1500);
        const err = await page.textContent('body').then(t => t.includes('404') || t.includes('not found'));
        console.log(`  ${route}: ${err ? '⚠️ 404/content issue' : '✅ Loaded'}`);
      } catch (e) {
        console.log(`  ${route}: ❌ Error - ${e.message.substring(0, 60)}`);
      }
    }

    // ─── Summary ───
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`  ✅ Passed: ${results.passed.length}`);
    console.log(`  ❌ Failed: ${results.failed.length}`);
    console.log(`  ⚠️  Warnings: ${results.warnings.length}`);
    for (const p of results.passed) console.log(`    ✅ ${p}`);
    for (const f of results.failed) console.log(`    ❌ ${f}`);
    for (const w of results.warnings) console.log(`    ⚠️  ${w}`);

  } catch (err) {
    console.error(`\n💥 CRITICAL ERROR: ${err.message}`);
    console.error(err.stack);
    results.failed.push(`Script crashed: ${err.message}`);
  } finally {
    await browser.close();
  }

  return results;
}

main().then(r => {
  console.log(`\nDone. Passed: ${r.passed.length}, Failed: ${r.failed.length}, Warnings: ${r.warnings.length}`);
  process.exit(r.failed.length > 0 ? 1 : 0);
}).catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
