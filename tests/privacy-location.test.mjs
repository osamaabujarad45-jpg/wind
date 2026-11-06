import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'wind-privacy-'));
process.env.DB_PATH = join(dir, 'test.db');
const { server, shutdown } = await import('../server/main.ts');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/privacy`);
  assert.equal(response.status, 200);
  const page = await response.text();
  const english = page.match(/<li><b>Driver location:<\/b>(.*?)<\/li>/)?.[1] ?? '';
  const arabic = page.match(/<li><b>موقع السائق:<\/b>(.*?)<\/li>/)?.[1] ?? '';
  assert.match(english, /every 3 seconds/);
  assert.match(english, /online-presence.*before an assignment/);
  assert.match(english, /if background access is allowed/);
  assert.match(arabic, /كل 3 ثوان/);
  assert.match(arabic, /قبل تعيين الطلب/);
  console.log('Privacy describes native tracking and opt-in presence in both languages');
} finally { await shutdown(); rmSync(dir, { recursive: true, force: true }); }
