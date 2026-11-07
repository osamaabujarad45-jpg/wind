// Measures the rendered app against the UI rules that can be checked objectively:
// touch target size, accessible names, colour contrast, type size, text truncation,
// horizontal overflow and heading structure. Reads the exported web build, so it
// measures what the user actually gets (react-native-web output), not the source.
//
//   node scripts/ui-audit.mjs                     audit every screen, both languages
//   node scripts/ui-audit.mjs --only=home,book    audit a subset
//   node scripts/ui-audit.mjs --width=360         a narrower phone
//   node scripts/ui-audit.mjs --no-build          reuse the last export
//
// The API is a throwaway seeded instance on a temporary database; wind.db is never touched.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',');
const width = Number(args.find(a => a.startsWith('--width='))?.slice(8)) || 360; // the A53 is a 360 dp phone
const height = Number(args.find(a => a.startsWith('--height='))?.slice(8)) || 800;
const API_PORT = 4100, WEB_PORT = 4101;
const webDir = join(root, '.screens', 'web');
const outDir = join(root, 'reports');
const MIN_TOUCH = 44; // 44 pt iOS / 48 dp Android; 44 is the floor for both
const MIN_BODY = 12; // px: nothing smaller than this is readable body text

// ---------- 1. throwaway API with seeded data ----------
const dbDir = mkdtempSync(join(tmpdir(), 'wind-ui-audit-'));
process.env.DB_PATH = join(dbDir, 'audit.db');
for (const key of ['WIND_DATABASE_URL', 'WIND_POSTGRES_TEST_ONLY', 'WIND_POSTGRES_TEST_SCHEMA', 'DATABASE_URL']) delete process.env[key];
process.env.WIND_ENABLED_SERVICES = 'parcel,ride,freight';
process.env.WIND_IDENTITY_MODE = 'self-service';
const { db, server, promote } = await import('../server/main.ts');
const { quote, defaultSettings } = await import('../src/model.ts');
const { scheduleSlots } = await import('../src/booking.ts');
await new Promise(resolve => server.listen(API_PORT, resolve));
const api = `http://localhost:${API_PORT}/api`;

async function call(path, token, body, expected = 200) {
  if (path.endsWith('/advance') && body && !body.expectedStatus) {
    const order = await call(path.slice(0, -'/advance'.length), token);
    body = { ...body, expectedStatus: order.status, requestId: randomUUID() };
  }
  const res = await fetch(api + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (res.status !== expected) throw new Error(`${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}
const register = (phone, name, extra = {}) => call('/auth/register', null, { phone, name, email: `${phone}@example.test`, consent: true, password: 'Screenshot_Secret1', ...extra });

const layla = await register('0599000001', 'ليلى حداد');
const omar = await register('0599000004', 'عمر ناصر');
const ahmad = await register('0599000002', 'أحمد يوسف', { role: 'driver', vehicle: 'car' });
const sami = await register('0569000003', 'سامي خليل', { role: 'driver', vehicle: 'van' });
const boss = await register('0599000009', 'إدارة ويند');
await promote('0599000009');
await call(`/admin/users/${ahmad.user.id}/approve`, boss.token, {});
const laylaSub = await call('/subscriptions', layla.token, {});
await call(`/admin/subscriptions/${laylaSub.subscription.id}`, boss.token, { action: 'activate' });
await call('/subscriptions', omar.token, {});
await call('/subscriptions', ahmad.token, {});

async function order(who, plus, o) {
  const body = { shared: false, option: o.service === 'ride' ? '1' : 'small', contact: who.user.phone, detail: '', loadingHelp: false, ...o };
  body.quotedPrice = quote(defaultSettings, { ...body, plus });
  return call('/orders', who.token, body);
}
async function smartOrder(who, o) {
  const body = { shared: false, option: 'small', contact: who.user.phone, detail: '', loadingHelp: false, pricing: 'smart', ...o };
  body.quotedPrice = (await call('/price', who.token, body)).price;
  return call('/orders', who.token, body);
}
const completed = await order(layla, true, { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'nablus',
  pickupNote: 'محل الزهراء، شارع ركب', dropoffNote: 'دوار الشهداء، بجانب الصيدلية', detail: 'صندوق ملابس وهدية', option: 'medium' });
const inTransit = await order(layla, true, { service: 'ride', pickupCity: 'ramallah', dropoffCity: 'bethlehem',
  pickupNote: 'دوار المنارة', dropoffNote: 'ساحة المهد', option: '2', detail: 'معي عربة أطفال' });
const searching = await smartOrder(layla, { service: 'ride', option: '1', pickupCity: 'bireh', dropoffCity: 'tulkarm',
  pickupNote: 'مكتبة الجامعة', dropoffNote: 'مدخل السوق' });
const scheduled = await order(layla, true, { service: 'parcel', pickupCity: 'ramallah', dropoffCity: 'hebron', pickupNote: 'مكتب البريد', dropoffNote: 'باب الزاوية',
  detail: 'أوراق جامعية', scheduledFor: scheduleSlots().find(s => s > Date.now() + 20 * 3_600_000) });
await order(omar, false, { service: 'freight', pickupCity: 'hebron', dropoffCity: 'jericho', option: 'large', loadingHelp: true,
  pickupNote: 'عين سارة، عمارة 4', dropoffNote: 'شارع عمّان', detail: 'ثلاجة وغسالة، الطابق الثاني' });
await call(`/jobs/${completed.id}/accept`, ahmad.token, {});
await call(`/orders/${completed.id}/advance`, ahmad.token, {});
await call(`/orders/${completed.id}/advance`, ahmad.token, {});
await call(`/orders/${completed.id}/advance`, ahmad.token, { code: completed.handoverCode });
await call(`/orders/${completed.id}/rate`, layla.token, { rating: 5 });
await call(`/jobs/${inTransit.id}/accept`, ahmad.token, {});
await call(`/orders/${inTransit.id}/advance`, ahmad.token, {});
await call(`/orders/${inTransit.id}/advance`, ahmad.token, {});
const courier = await register('0599000006', 'يوسف عودة', { role: 'driver', vehicle: 'van' });
await call(`/admin/users/${courier.user.id}/approve`, boss.token, {});
const idle = await register('0599000007', 'كريم علي', { role: 'driver', vehicle: 'car' });
await call(`/admin/users/${idle.user.id}/approve`, boss.token, {});
await call(`/jobs/${searching.id}/offer`, idle.token, { price: searching.price - 3 });
const proof = await order(layla, true, { service: 'parcel', pickupCity: 'bireh', dropoffCity: 'nablus', recipientName: 'هدى سمارة', recipientPhone: '0599123456',
  pickupNote: 'مكتبة الجامعة', dropoffNote: 'دوار الشهداء', detail: 'طرد هدية', option: 'small' });
await call(`/jobs/${proof.id}/accept`, courier.token, {});
await call(`/orders/${proof.id}/advance`, courier.token, {});
await call(`/orders/${proof.id}/advance`, courier.token, {});
for (let i = 0; i < 5; i++) await call(`/orders/${proof.id}/advance`, courier.token, { code: '0000' }, 400);
for (const [pickupCity, dropoffCity, pickupNote, dropoffNote, onBoard] of [['ramallah', 'nablus', 'محل الزهراء', 'شارع فيصل', true],
  ['bireh', 'nablus', 'مكتبة الجامعة', 'رفيديا', true], ['ramallah', 'jenin', 'دوار المنارة', 'مستشفى جنين', false]]) {
  const parcel = await order(omar, false, { service: 'parcel', pickupCity, dropoffCity, pickupNote, dropoffNote, detail: 'طرد' });
  await call(`/jobs/${parcel.id}/accept`, courier.token, {});
  if (onBoard) for (let step = 0; step < 2; step++) await call(`/orders/${parcel.id}/advance`, courier.token, {});
}

// ---------- 2. web build + static server ----------
if (!args.includes('--no-build') || !existsSync(join(webDir, 'index.html'))) {
  console.log('Building the web app…');
  rmSync(webDir, { recursive: true, force: true });
  const built = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', webDir], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, CI: '1', WIND_LOCAL_TEST: '1', EXPO_PUBLIC_API_URL: `http://localhost:${API_PORT}`, EXPO_PUBLIC_SUPPORT_WHATSAPP: '970590000000' },
  });
  if (built.status !== 0) throw new Error('expo export failed');
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json' };
const web = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(webDir, path);
  if (!file.startsWith(webDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(webDir, 'index.html');
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise(resolve => web.listen(WEB_PORT, resolve));

// ---------- 3. the screens to measure ----------
const screens = [
  { id: 'welcome', route: '/', role: null, onboarded: false },
  { id: 'sign-in', route: '/auth', role: null },
  { id: 'sign-up', route: '/auth', role: null, click: { en: 'New account', ar: 'حساب جديد' } },
  { id: 'help', route: '/help?topic=password', role: null },
  { id: 'home', route: '/', role: 'customer' },
  { id: 'book-parcel', route: '/book?service=parcel', role: 'customer' },
  { id: 'book-ride', route: '/book?service=ride', role: 'customer' },
  { id: 'book-freight', route: '/book?service=freight', role: 'customer' },
  { id: 'book-again', route: `/book?again=${completed.id}`, role: 'customer' },
  { id: 'orders', route: '/orders', role: 'customer' },
  { id: 'order-searching', route: `/order/${searching.id}`, role: 'customer' },
  { id: 'order-scheduled', route: `/order/${scheduled.id}`, role: 'customer' },
  { id: 'order-live', route: `/order/${inTransit.id}`, role: 'customer' },
  { id: 'order-parcel-live', route: `/order/${proof.id}`, role: 'customer' },
  { id: 'order-done', route: `/order/${completed.id}`, role: 'customer' },
  { id: 'receipt', route: `/receipt/${completed.id}`, role: 'customer' },
  { id: 'account', route: '/account', role: 'customer' },
  { id: 'profile', route: '/profile', role: 'customer' },
  { id: 'driver-pending', route: '/driver', role: 'pending' },
  { id: 'driver-jobs', route: '/driver', role: 'driver' },
  { id: 'driver-trips', route: '/driver/trips', role: 'driver' },
  { id: 'driver-run-sheet', route: '/driver/trips', role: 'courier' },
  { id: 'driver-earnings', route: '/driver/earnings', role: 'driver' },
  { id: 'driver-order', route: `/order/${inTransit.id}`, role: 'driver' },
  { id: 'driver-account', route: '/driver/account', role: 'driver' },
  { id: 'driver-receipt', route: `/receipt/${completed.id}`, role: 'driver' },
  { id: 'admin-dashboard', route: '/admin', role: 'admin' },
  { id: 'admin-orders', route: '/admin/orders', role: 'admin' },
  { id: 'admin-users', route: '/admin/users', role: 'admin' },
  { id: 'admin-subscriptions', route: '/admin/subscriptions', role: 'admin' },
  { id: 'admin-settings', route: '/admin/settings', role: 'admin' },
  { id: 'admin-account', route: '/admin/account', role: 'admin' },
  { id: 'admin-order', route: `/order/${proof.id}`, role: 'admin' },
  { id: 'roads', route: '/roads', role: 'customer' },
].filter(s => !only || only.includes(s.id));
const tokens = { customer: layla.token, driver: ahmad.token, courier: courier.token, idle: idle.token, pending: sami.token, admin: boss.token };

// ---------- 4. measure ----------
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const results = [];

const measure = () => {
  const parse = value => {
    const m = String(value || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[,/]/).map(p => p.trim()).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (fg, bg) => {
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const effectiveBackground = el => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) return over(bg, effectiveBackgroundParent(node));
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const effectiveBackgroundParent = el => {
    let node = el.parentElement;
    while (node) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) return bg;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const ownText = el => [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ').trim();
  // An icon font is a glyph, not text: its line height and contrast are the icon rules, not the text rules.
  const isGlyph = t => /[\uE000-\uF8FF]/.test(t);
  // The map vendor paints its own attribution and hints over the map: not the app's text to fix.
  const isVendor = el => !!el.closest?.('[class*="gm-"], [class*="gmap"], [class*="mapbox"], [class*="maplibre"]');
  // A horizontal rail is meant to run off the screen: what matters is that the page itself does not scroll sideways.
  const inRail = el => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const visible = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = el => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) {
      const parts = labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    const text = el.innerText?.replace(/\s+/g, ' ').trim();
    return text || '';
  };
  const interactive = [...document.querySelectorAll('[role="button"],[role="link"],[role="radio"],[role="checkbox"],[role="tab"],[role="switch"],[role="menuitem"],[role="textbox"],input,textarea,select')].filter(visible);
  const controls = interactive.map(el => {
    const r = el.getBoundingClientRect();
    return {
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      name: label(el).slice(0, 80),
      w: Math.round(r.width), h: Math.round(r.height),
      x: Math.round(r.left), y: Math.round(r.top),
      rail: inRail(el),
      disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled === true,
    };
  });
  const texts = [...document.querySelectorAll('div,span,p,input,textarea')].filter(visible).map(el => {
    const text = ownText(el);
    if (!text) return null;
    if (/zoom the map/i.test(text) && !window.__probed) {
      window.__probed = true;
      const chain = [];
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) chain.push(`${n.tagName.toLowerCase()}[${[...n.classList].join('|')}]`);
      window.__mapChain = chain.join(' < ');
    }
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const fg = parse(s.color); if (!fg) return null;
    const bg = effectiveBackground(el);
    const size = parseFloat(s.fontSize);
    const weight = Number(s.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const cr = ratio(over(fg, bg), bg);
    return {
      text: text.slice(0, 90), size: Math.round(size * 10) / 10, weight,
      lineHeight: s.lineHeight === 'normal' ? size * 1.2 : parseFloat(s.lineHeight),
      color: s.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      contrast: Math.round(cr * 100) / 100, large,
      glyph: isGlyph(text), vendor: isVendor(el), rail: inRail(el),
      clipped: el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible',
      overflowX: (r.left < -0.5 || r.right > window.innerWidth + 0.5),
      w: Math.round(r.width), x: Math.round(r.left),
    };
  }).filter(Boolean);
  const headings = [...document.querySelectorAll('[role="heading"],[aria-level]')].filter(visible)
    .map(el => ({ level: el.getAttribute('aria-level') || el.tagName.toLowerCase(), text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) }));
  const liveRegions = [...document.querySelectorAll('[aria-live],[role="alert"],[role="status"]')].filter(visible)
    .map(el => ({ live: el.getAttribute('aria-live') || el.getAttribute('role'), text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) }));
  const scrollX = document.documentElement.scrollWidth > window.innerWidth + 1;
  return { controls, texts, headings, liveRegions, scrollX, docWidth: document.documentElement.scrollWidth, viewWidth: window.innerWidth, mapChain: window.__mapChain };
};

for (const language of ['ar', 'en']) {
  for (const screen of screens) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: language === 'ar' ? 'ar-PS' : 'en-GB', reducedMotion: 'reduce' });
    await context.addInitScript(({ token, language, onboarded }) => {
      localStorage.clear();
      localStorage.setItem('language', language);
      if (onboarded) localStorage.setItem('onboarded', '1');
      if (token) localStorage.setItem('token', token);
    }, { token: screen.role ? tokens[screen.role] : null, language, onboarded: screen.onboarded !== false });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    try {
      // The app polls, so 'networkidle' never settles: wait for the DOM and then for the first paint of content.
      await page.goto(`http://localhost:${WEB_PORT}${screen.route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector('#root div', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1800);
      if (screen.click) {
        // The sign-up tab is a radio, not a button: match on the text so both languages work.
        const name = typeof screen.click === 'string' ? screen.click : screen.click[language];
        const target = page.getByText(name, { exact: true }).first();
        if (await target.count()) { await target.click(); await page.waitForTimeout(800); }
        else console.log(`  ! "${name}" not found on ${screen.id} (${language})`);
      }
      const data = await page.evaluate(measure);
      results.push({ screen: screen.id, route: screen.route, role: screen.role, language, errors, ...data });
      console.log(`measured ${screen.id} (${language})`);
    } catch (e) {
      results.push({ screen: screen.id, route: screen.route, role: screen.role, language, failed: String(e).slice(0, 160), controls: [], texts: [], headings: [], liveRegions: [] });
      console.log(`FAILED ${screen.id} (${language}): ${String(e).slice(0, 120)}`);
    }
    await context.close();
  }
}
await browser.close();
server.close();
web.close(); // the static server keeps the event loop alive: without this the run never exits
db.close?.();
rmSync(dbDir, { recursive: true, force: true });

// ---------- 5. report ----------
const findings = [];
for (const r of results) {
  const where = `${r.screen} [${r.language}]`;
  for (const c of r.controls ?? []) {
    if (!c.name) findings.push({ level: 'HIGH', rule: 'accessible-name', where, detail: `unnamed ${c.role} control` });
    else if (c.w < MIN_TOUCH || c.h < MIN_TOUCH) findings.push({ level: c.w < 32 || c.h < 32 ? 'HIGH' : 'MEDIUM', rule: 'touch-target', where, detail: `${c.role} "${c.name}" is ${c.w}×${c.h}px (min ${MIN_TOUCH})` });
    if (c.x < 0 && !c.rail) findings.push({ level: 'HIGH', rule: 'overflow', where, detail: `${c.role} "${c.name}" starts off-screen at x=${c.x}` });
  }
  for (const t of r.texts ?? []) {
    if (t.vendor) continue; // the map vendor paints its own overlays
    if (t.glyph) {
      // an icon is a graphic, not text: 3:1 (WCAG 1.4.11) is the bar
      if (t.contrast < 3) findings.push({ level: 'HIGH', rule: 'contrast', where, detail: `icon ${t.contrast}:1 ${t.size}px "${t.text}" (${t.color} on ${t.bg})` });
      continue;
    }
    if (!t.large && t.contrast < 4.5) findings.push({ level: t.contrast < 3 ? 'HIGH' : 'MEDIUM', rule: 'contrast', where, detail: `${t.contrast}:1 ${t.size}px "${t.text}" (${t.color} on ${t.bg})` });
    else if (t.large && t.contrast < 3) findings.push({ level: 'HIGH', rule: 'contrast', where, detail: `${t.contrast}:1 large ${t.size}px "${t.text}" (${t.color} on ${t.bg})` });
    if (t.size < MIN_BODY) findings.push({ level: 'MEDIUM', rule: 'font-size', where, detail: `${t.size}px "${t.text}"` });
    if (!t.large && t.lineHeight < t.size * 1.45 && t.size >= 13) findings.push({ level: 'LOW', rule: 'line-height', where, detail: `${t.size}px/${t.lineHeight}px "${t.text}"` });
    if (t.clipped) findings.push({ level: 'MEDIUM', rule: 'truncation', where, detail: `clipped "${t.text}" (${t.w}px wide)` });
    if (t.overflowX && !t.rail) findings.push({ level: 'HIGH', rule: 'overflow', where, detail: `"${t.text}" at x=${t.x} leaves the ${r.viewWidth}px viewport` });
  }
  if (r.scrollX) findings.push({ level: 'HIGH', rule: 'overflow', where, detail: `the page scrolls sideways (${r.docWidth}px in ${r.viewWidth}px)` });
  if (!(r.headings ?? []).length) findings.push({ level: 'MEDIUM', rule: 'heading', where, detail: 'the screen has no heading for a screen reader to land on' });
  if (r.errors?.length) findings.push({ level: 'MEDIUM', rule: 'console', where, detail: r.errors.slice(0, 2).join(' | ').slice(0, 200) });
}

const byRule = findings.reduce((acc, f) => { (acc[f.rule] ??= []).push(f); return acc; }, {});
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
writeFileSync(join(outDir, `ui-audit-${stamp}.json`), JSON.stringify({ viewport: { width, height }, results, findings }, null, 2));
const md = [
  `# UI audit — rendered app, ${width}×${height}px viewport`,
  '',
  `Measured with \`node scripts/ui-audit.mjs\` against the exported web build. ${results.length} screen/language combinations.`,
  '',
  '| Rule | Level | Count |', '|---|---|---|',
  ...Object.entries(byRule).map(([rule, list]) => `| ${rule} | ${list[0].level} | ${list.length} |`),
  '',
  ...Object.entries(byRule).flatMap(([rule, list]) => [
    `## ${rule}`,
    '',
    ...list.map(f => `- **${f.where}** — ${f.detail}`),
    '',
  ]),
].join('\n');
writeFileSync(join(outDir, `ui-audit-${stamp}.md`), md);
console.log(`\n${findings.length} findings → reports/ui-audit-${stamp}.md`);
for (const [rule, list] of Object.entries(byRule)) console.log(`  ${rule}: ${list.length}`);
