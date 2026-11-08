// Reuse unchanged HTTP assertions; only adapt async fixture access/imports in an ignored generated copy.
// Unsupported SQLite-specific assertions fail explicitly instead of being reported as PostgreSQL passes.
import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..'), output = join(root, '.expo/pg-legacy');
mkdirSync(output, { recursive: true });
// Cash, offers, customer ratings, email and the frozen API corpus have explicit pg-* counterparts.
const suites = ['chat', 'pickup', 'safety', 'places', 'recipient', 'driver-scope',
  'driver-destination', 'promo', 'courier-block', 'exceptions', 'share', 'schedule',
  'roads', 'route', 'booking-auth', 'driver-signup-alert', 'push-server', 'credit', 'referral', 'parcels', 'map', 'change-destination'];
const filter = process.argv.find(value => value.startsWith('--filter='))?.slice('--filter='.length);
const selected = suites.filter(name => !filter || name === filter);
if (!selected.length) throw new Error('No PostgreSQL legacy suite matches the filter');
const fixtureUrl = pathToFileURL(join(root, 'tests/support/pg-test-server.mjs')).href;
const adaptations = new Map();
function transform(name) {
  const original = join(root, `tests/${name}.test.mjs`);
  let text = readFileSync(original, 'utf8');
  const notes = [];
  const replaceFixture = (before, after, note) => {
    if (!text.includes(before)) throw new Error(`${name}: reviewed fixture adaptation no longer matches the source`);
    text = text.replace(before, after);
    notes.push(note);
  };
  if (['driver-scope', 'driver-destination', 'driver-signup-alert', 'push-server', 'parcels'].includes(name)) {
    replaceFixture('const settle = () => new Promise(resolve => setTimeout(resolve, 50));',
      'const settle = drainOutbox;', 'Push assertions drain the real durable worker on the same schema, using the existing local encrypted provider double.');
    replaceFixture("const call = apiCaller(() => base, realFetch);",
      "const rawCall = apiCaller(() => base, realFetch);\nconst call = async (...args) => { const result = await rawCall(...args); await drainOutbox(); return result; };",
      'Each HTTP call drains committed notifications before the next fixture action, preserving the existing delivery assertions without timing assumptions.');
    // The original destructuring differs per suite; add only the shared fixture capability.
    text = text.replace(/const \{ ([^\n]+) \} = await import\('\.\.\/server\/main\.ts'\);/,
      'const { $1, drainOutbox } = await import(\'../server/main.ts\');');
  }
  if (name === 'push-server') {
    replaceFixture("db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(later - 20 * 60_000, past.id);",
      "db.prepare('UPDATE orders SET scheduled_for = ? WHERE id = ?').run(Date.now() + 10 * 60_000, past.id);",
      'Scheduled release is due relative to actual producer/worker time; the worker still enforces its live release window.');
    text = text.replaceAll('await alertReleasedJobs(later - 10 * 60_000);', 'await alertReleasedJobs();');
    replaceFixture("assert.equal(sent[0].headers.TTL, '600');",
      "assert.ok(Number(sent[0].headers.TTL) > 0 && Number(sent[0].headers.TTL) <= 600);",
      'Durable delivery uses the remaining original offer lifetime, bounded by 600 seconds; retries cannot renew it.');
  }
  if (name === 'map') replaceFixture(
    `const columns = table => db.prepare(\`PRAGMA table_info(\${table})\`).all().map(r => r.name);
  assert.ok(['heading', 'accuracy'].every(c => columns('driver_locations').includes(c)), 'legacy driver_locations upgraded');
  assert.ok(['dropoff_lat', 'dropoff_lng'].every(c => columns('orders').includes(c)));`.replaceAll('\n', text.includes('\r\n') ? '\r\n' : '\n'),
    `const columns = async table => (await db.prepare('SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?').all(table)).map(r => r.name);
  const driverColumns = await columns('driver_locations'), orderColumns = await columns('orders');
  assert.ok(['heading', 'accuracy'].every(c => driverColumns.includes(c)), 'PostgreSQL driver location columns exist');
  assert.ok(['dropoff_lat', 'dropoff_lng'].every(c => orderColumns.includes(c)));`,
    'Column assertions inspect real PostgreSQL catalogs; SQLite legacy-rebuild evidence remains in the original SQLite suite. All HTTP tracking/map assertions remain unchanged.');
  if (name === 'change-destination') {
    text = text.replace("const { db, shutdown, server, promote } = await import('../server/main.ts');",
      "const { db, shutdown, server, promote, drainOutbox } = await import('../server/main.ts');");
    replaceFixture('const call = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`, realFetch);',
      "const rawCall = apiCaller(() => `http://127.0.0.1:${server.address().port}/api`, realFetch);\nconst call = async (...args) => { const result = await rawCall(...args); await drainOutbox(); return result; };",
      'Destination requests notify through the durable outbox on PostgreSQL; each HTTP call drains committed notifications before the next fixture action, preserving the existing delivery assertions.');
  }
  if (name === 'referral') replaceFixture(
    `db.prepare("UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), o.id);`,
    `const assigned = await call('/jobs/' + o.id + '/accept', { token: driver.token, body: {} });
    const collected = await advance(driver.token, await advance(driver.token, assigned));
    await advance(driver.token, collected, { code: o.handoverCode });`,
    'Referral reward fixtures complete through real custody/proof HTTP commands instead of creating completed orders without a driver.');
  if (name === 'parcels') {
    replaceFixture(`UPDATE orders SET status = 'completed' WHERE driver_id = ? AND id <> ? AND status = 'assigned'`,
      `UPDATE orders SET status = 'completed', completed_at = updated_at WHERE driver_id = ? AND id <> ? AND status = 'assigned'`,
      'Bulk historical fixture completion supplies the required completed_at timestamp; HTTP assertions are unchanged.');
    replaceFixture(`const done = \`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_note, dropoff_note, contact, pickup_contact, detail, option, loading_help, price, status, driver_id, created_at, updated_at)`,
      `const done = \`INSERT INTO orders (customer_id, service, shared, pickup_city, dropoff_city, pickup_note, dropoff_note, contact, pickup_contact, detail, option, loading_help, price, status, driver_id, created_at, updated_at, completed_at)`,
      'Historical inserts supply completed_at rather than violate the new database invariant.');
    replaceFixture(`'completed', ?, 1, 1)\`;`, `'completed', ?, 1, 1, 1)\`;`, 'The synthetic history timestamp is the same fixed instant as created_at/updated_at.');
  }
  adaptations.set(name, notes);
  const source = ts.createSourceFile(original, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const statements = new Set(), edits = [];
  const isPrepare = node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.expression.getText(source) === 'db' && node.expression.name.text === 'prepare';
  function discover(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isPrepare(node.initializer)) statements.add(node.name.text);
    ts.forEachChild(node, discover);
  }
  discover(source);
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith('.')) {
      edits.push({ start: node.moduleSpecifier.getStart(source), end: node.moduleSpecifier.end,
        text: JSON.stringify(pathToFileURL(resolve(dirname(original), node.moduleSpecifier.text)).href) });
    }
    if (ts.isMetaProperty(node) && node.getText(source) === 'import.meta') {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.name.text === 'url') {
        edits.push({ start: parent.getStart(source), end: parent.end, text: JSON.stringify(pathToFileURL(original).href) });
        return;
      }
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
        const path = node.arguments[0].text;
        if (path.endsWith('/server/main.ts')) {
          edits.push({ start: node.getStart(source), end: node.end, text: 'openLegacyPgServer()' });
          return;
        }
        if (path.startsWith('.')) edits.push({ start: node.arguments[0].getStart(source), end: node.arguments[0].end,
          text: JSON.stringify(pathToFileURL(resolve(dirname(original), path)).href) });
      }
      const method = node.expression;
      if (ts.isPropertyAccessExpression(method) && ['get', 'all', 'run', 'exec', 'close'].includes(method.name.text)
        && (isPrepare(method.expression) || statements.has(method.expression.getText(source))
          || (method.expression.getText(source) === 'db' && ['exec', 'close'].includes(method.name.text)))
        && !ts.isAwaitExpression(node.parent)) {
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (ts.isFunctionLike(parent)) {
            if (!parent.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword))
              throw new Error(`${name}: fixture query inside a synchronous function needs explicit adaptation`);
            break;
          }
        }
        edits.push({ start: node.getStart(source), end: node.getStart(source), text: '(await ' },
          { start: node.end, end: node.end, text: ')' });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  let generated = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) generated = generated.slice(0, edit.start) + edit.text + generated.slice(edit.end);
  generated = `import { openLegacyPgServer } from ${JSON.stringify(fixtureUrl)};\n${generated}`;
  const target = join(output, `${name}.test.mjs`);
  writeFileSync(target, generated);
  return target;
}
const results = [];
for (const name of selected) {
  try {
    const generated = transform(name);
    if (process.argv.includes('--generate-only')) { results.push({ suite: name, status: 'generated-only' }); continue; }
    const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', generated],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 90_000 });
    writeFileSync(join(output, `${name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    const passed = result.status === 0 && !result.error;
    results.push({ suite: name, status: passed ? 'passed' : 'failed', exitCode: result.status, error: result.error?.message,
      fixtureAdaptations: adaptations.get(name) });
    console.log(`${passed ? 'PASS' : 'FAIL'} PostgreSQL legacy ${name}; ${result.stdout?.trim().split('\n').at(-1) ?? result.error?.message ?? ''}`);
    if (!passed) console.error(result.stderr?.slice(-3000));
  } catch (error) { results.push({ suite: name, status: 'unsupported', error: error.message }); console.error(error.message); }
}
writeFileSync(join(output, 'results.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
if (results.some(result => ['failed', 'unsupported'].includes(result.status))) process.exitCode = 1;
