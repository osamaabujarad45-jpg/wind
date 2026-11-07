import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const map = await readFile(new URL('../public/map.html', import.meta.url), 'utf8');
const script = fileURLToPath(new URL('../scripts/check-deployment.mjs', import.meta.url));
let defect = '';
let origin;
const server = createServer((request, response) => {
  const path = new URL(request.url, origin).pathname;
  const json = value => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };
  if (path === '/api/health') return json({ ok: true });
  if (path === '/api/ready') {
    if (defect === 'html-ready') { response.setHeader('content-type', 'text/html'); return response.end('<html>unavailable</html>'); }
    return json({ ok: true, schema: 3 });
  }
  if (path === '/api/auth/options') return json(defect === 'old-api' ? { registrationOpen: true } : { registrationOpen: true, emailReset: false });
  if (path === '/api/orders/1/live') { response.statusCode = defect === 'missing-route' ? 404 : 401; return json({ error: 'unauthorized' }); }
  if (path === '/map.html') { response.setHeader('content-type', 'text/html'); return response.end(defect === 'old-map' ? 'old map' : map); }
  if (path === '/map/v1/map.html') {
    response.statusCode = defect === 'missing-versioned-map' ? 404 : 200;
    response.setHeader('content-type', 'text/html');
    response.setHeader('cache-control', defect === 'uncached-map' ? 'no-cache' : 'public, max-age=86400');
    return response.end(map);
  }
  if (path === '/') {
    response.setHeader('content-type', 'text/html');
    const source = defect === 'external-script' ? 'https://external.example/_expo/static/js/web/index.js' : '/_expo/static/js/web/index.js';
    return response.end(`<script src="${source}"></script>`);
  }
  if (path === '/_expo/static/js/web/index.js') return response.end(`const api = "${defect === 'wrong-origin' ? 'https://old.example' : origin}"`);
  response.setHeader('content-type', 'text/html'); response.end('<html>' + 'content'.repeat(20) + '</html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
async function run() {
  const child = spawn(process.execPath, [script, '--origin', origin, '--fixture'], { env: { ...process.env, NODE_ENV: 'test' }, windowsHide: true });
  let output = ''; child.stdout.on('data', part => { output += part; }); child.stderr.on('data', part => { output += part; });
  const [status] = await once(child, 'exit'); return { status, output };
}
try {
  assert.equal((await run()).status, 0, 'healthy deployment passes');
  for (const [name, label] of [['html-ready', '/api/ready'], ['old-api', 'authentication capabilities'],
    ['missing-route', 'unauthenticated tracking access'], ['old-map', 'current map page'], ['wrong-origin', 'web bundle API origin'],
    ['external-script', 'web bundle API origin'], ['missing-versioned-map', 'versioned map page'], ['uncached-map', 'versioned map page']]) {
    defect = name;
    const result = await run();
    assert.equal(result.status, 1, name);
    assert.ok(result.output.includes(`FAIL ${label}`), result.output);
    if (name === 'external-script') assert.ok(result.output.includes('Unexpected cross-origin URL'));
  }
  console.log('Deployment probe: healthy fixture and eight stale, unsafe or unavailable deployment failures passed');
} finally { await new Promise(resolve => server.close(resolve)); }
