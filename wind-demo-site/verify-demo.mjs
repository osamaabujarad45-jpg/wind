// Verifies the public demo on the attached A53 via Chrome/CDP (fresh CDP page).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { copy } from 'file:///C:/Users/osama/.local/share/opencode/worktree/b44bf6/wind-demo-2026-11-11/src/copy.ts';

const outDir = 'C:\\Users\\osama\\.local\\share\\opencode\\worktree\\b44bf6\\wind-demo-2026-11-11\\wind-demo-site';
mkdirSync(outDir, { recursive: true });
const base = 'https://wind-demo-qa.web.app';
const target = base + `/?verify=${Date.now()}`;
const cdp = 'http://127.0.0.1:9228';
const browser = await chromium.connectOverCDP(cdp, { timeout: 30_000 });
for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().startsWith(base)) { try { await p.close(); } catch { } }

const page = await browser.contexts()[0].newPage({ viewport: { width: 1080, height: 2400 } });
page.setDefaultTimeout(30_000);
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
const cdpSession = await page.context().newCDPSession(page);
await cdpSession.send('Network.setCacheDisabled', { cacheDisabled: true });
const c = copy.en;

await page.goto(target, { waitUntil: 'domcontentloaded' });
const bootKeys = await page.evaluate(() => JSON.stringify(Object.keys(localStorage)));
console.log('STORAGE AFTER BOOT:', bootKeys);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
const bootText = await page.evaluate(() => document.body.innerText);
console.log('BOOT TEXT:', JSON.stringify(bootText.slice(0, 300)));
await page.screenshot({ path: join(outDir, 'demo-home.png') });

await page.getByRole('tab', { name: 'Orders', exact: true }).click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(800);
console.log('ORDERS:', JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 400)));
await page.screenshot({ path: join(outDir, 'demo-orders.png') });

await page.goto(base + '/book?from=ramallah&to=nablus&service=ride');
await page.waitForLoadState('networkidle');
await page.getByRole('button', { name: c.pickupOnMap, exact: true }).click();
const confirm = page.getByRole('button', { name: c.confirmPin, exact: true });
await page.waitForTimeout(4000);
if (!(await confirm.isEnabled().catch(() => false))) {
  const box = await page.getByRole('img', { name: 'Map for choosing a location' }).locator('.maplibregl-canvas').boundingBox();
  if (box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx + 2, cy - 80, { steps: 12 }); await page.mouse.up();
  }
  await page.waitForTimeout(1500);
}
await confirm.click({ timeout: 20000 });
await page.locator('.maplibregl-marker').first().waitFor();
await page.waitForTimeout(1200);
await page.getByLabel(c.pickupNote_ride, { exact: true }).fill('Near the municipality');
await page.getByLabel(c.dropoffNote_ride, { exact: true }).fill('Main market street');
await page.getByLabel(c.dropoffNote_ride, { exact: true }).evaluate(input => input.blur());
await page.getByRole('button', { name: /^Request/ }).click();
await page.waitForURL(/\/order\/\d+$/);
await page.getByText(c.findingTitle, { exact: true }).waitFor();
await page.screenshot({ path: join(outDir, 'demo-searching.png') });
console.log('ORDER CREATED, WAITING FOR DRIVER (~25s)...');
await page.waitForFunction(() => document.body.innerText.includes('000-7') || !document.body.innerText.includes('Finding a driver'), null, { timeout: 45_000 }).catch(() => console.log('assignment never landed in UI'));
await page.waitForTimeout(1200);
console.log('ORDER TEXT:', JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 600)));
await page.screenshot({ path: join(outDir, 'demo-assigned.png') });
await browser.close();
