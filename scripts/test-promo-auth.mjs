// Run ONLY with the disposable local API (CHIVAGO_DB=:memory:) on port 8787.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
if(process.env.PROMO_DISPOSABLE_API !== '1') throw new Error('Start the in-memory API and set PROMO_DISPOSABLE_API=1');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:4321/th/');
 await page.locator('.feature-card').nth(4).click();
 await page.getByText('สมัครสมาชิก',{exact:true}).click();
 const fields=page.locator('input');
 for (const [i,value] of ['Promo integration test','promo-'+Date.now()+'@example.invalid','0800000000','TestOnly!2843','TestOnly!2843'].entries()) await fields.nth(i).fill(value);
 await page.getByRole('checkbox').click();
 await page.getByRole('button',{name:'สมัครสมาชิก',exact:true}).click();
 await page.getByText('ข้าม',{exact:true}).click({timeout:30000});
 await page.getByText('ยังไม่มีการผจญภัยที่เผยแพร่ในพื้นที่นี้',{exact:true}).waitFor({timeout:20000});
 assert.ok(page.url().includes('screen=adventure'));
 assert.deepEqual(errors,[]);
 console.log('PASS real local registration → onboarding → Adventure empty state; no mock service');
} finally { await browser.close(); }
