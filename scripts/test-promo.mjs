import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const out = new URL('../docs/design/promo-redesign/qa/', import.meta.url);
await mkdir(out, { recursive:true });
try {
 for (const lang of ['th','en','zh']) {
  for (const width of [320,360,390,768,1024,1440,1920]) {
   await page.setViewportSize({ width, height:900 });
   await page.goto('http://127.0.0.1:4321/th/' + (lang === 'th' ? '' : lang+'.html'));
   await page.evaluate(() => document.fonts.ready);
   assert.equal(await page.locator('.feature-card').count(),21);
   assert.equal(await page.locator('h1').count(),1);
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,lang+' overflow '+width);
   assert.equal(await page.locator('a[href="#"]').count(),0);
   await page.locator('details summary').first().click();
   assert.equal(await page.locator('details').first().getAttribute('open'),'');
   await page.locator('details summary').first().click();
   if(width<1024) {
    await page.locator('.menu-toggle').click();
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
   }
   const urls=await page.locator('.destination [data-app]').evaluateAll(nodes=>nodes.map(n=>n.href));
   assert.ok(urls[0].includes('area=koh-sichang'));
   assert.ok(urls[1].includes('area=samui'));
   if(lang==='th') {
    await page.locator('img').evaluateAll(images => images.forEach(img=>img.loading='eager'));
    await page.waitForFunction(()=>[...document.images].every(img=>img.complete));
    await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
    assert.equal(await page.locator('img').evaluateAll(images=>images.every(img=>img.naturalWidth>0)),true,'All images load');
    await page.locator('summary').first().evaluate(el=>el.blur());
    await page.evaluate(()=>{ document.activeElement?.blur(); window.scrollTo({top:0,behavior:'instant'}); });
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({ path:new URL('promo-'+width+'.png',out).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true });
   }
   console.log('PASS',lang,width);
  }
 }
 await page.goto('http://127.0.0.1:4321/th/');
 await page.selectOption('#language','en');
 await page.waitForURL('**/th/en');
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 await page.goBack();
 assert.equal(await page.locator('html').getAttribute('lang'),'th');
 await page.context().setOffline(true);
 await page.waitForFunction(()=>!document.querySelector('#offline').hidden);
 assert.equal(await page.locator('#offline').isVisible(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS language navigation, browser Back, offline banner, no script errors');
} finally { await browser.close(); }
