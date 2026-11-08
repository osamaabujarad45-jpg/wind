import assert from 'node:assert/strict';
import { Agent, request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'wind-shutdown-'));
process.env.DB_PATH = join(dir, 'test.db');
const { server, persistence, shutdown } = await import('../server/main.ts');
const agent = new Agent({ keepAlive: true });
let release, entered;
const gate = new Promise(resolve => { release = resolve; });
const started = new Promise(resolve => { entered = resolve; });
let requestStarted = false;
server.prependListener('request', () => { requestStarted = true; });
const scope = persistence.scope.bind(persistence);
persistence.scope = async work => {
  const pause = requestStarted;
  requestStarted = false;
  const result = await scope(work);
  if (pause) { entered(); await gate; }
  return result;
};
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let closing;
try {
  const reply = new Promise((resolve, reject) => {
    request(`http://127.0.0.1:${server.address().port}/api/health`, { agent }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, connection: response.headers.connection, body }));
      response.on('error', reject);
    }).on('error', reject).end();
  });
  void reply.catch(() => {});
  await started;
  closing = shutdown();
  release();
  const response = await reply;
  assert.equal(response.status, 200, 'shutdown preserves the active response');
  assert.deepEqual(JSON.parse(response.body), { ok: true });
  let timer;
  try {
    const finished = await Promise.race([closing.then(() => true), new Promise(resolve => {
      timer = setTimeout(() => resolve(false), 5_000);
    })]);
    assert.equal(finished, true, 'completed active response must not hold shutdown for keep-alive');
  } finally { clearTimeout(timer); }
  assert.equal(response.connection, 'close', 'draining response cannot advertise connection reuse');
  console.log('shutdown-keepalive: ok');
} finally {
  release();
  agent.destroy();
  await (closing ?? shutdown());
  rmSync(dir, { recursive: true, force: true });
}
