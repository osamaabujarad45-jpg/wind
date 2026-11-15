// Native post-commit ambiguity: inject one 409 after the real sandbox commits, then retry the same command.
// The proxy is loopback-only and logs status/requestId/orderId only—never Authorization or payload fields.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adb, open, snapshot, tap, apiCall, pause } from './check-phone-tests.mjs';
import { copy } from '../src/copy.ts';

const proxyPort = Number(process.env.WIND_AMBIGUOUS_PROXY_PORT ?? 4193), targetPort = 4192;
if (!Number.isSafeInteger(proxyPort) || proxyPort < 1024 || proxyPort > 65535) throw new Error('Invalid ambiguous proxy port');
if ((process.env.WIND_PHONE_TEST_PORT ?? '') !== String(proxyPort)) throw new Error('Build the customer test app with WIND_PHONE_TEST_PORT=4193');
const sandboxName = `phone-qa-${proxyPort}`;
const provision = JSON.parse(readFileSync(resolve('.expo', sandboxName, 'provision.json'), 'utf8'));
assert.equal(provision.apiUrl, `http://127.0.0.1:${proxyPort}`);
const output = resolve('.expo', sandboxName, 'device', 'ambiguous-results.json');
const c = copy.ar;
const prior = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : null;
const priorPosts = prior?.events?.filter(event => event.method === 'POST' && event.path === '/api/orders') ?? [];
const resume = prior?.error === 'The native pending card remains after the forced 409'
  && priorPosts.length === 1 && prior.events.some(event => event.injected409);
const receiptOnly = prior?.error === 'fetch failed' && priorPosts.length === 2
  && priorPosts[0].injected409 && priorPosts[0].upstreamStatus === 200 && priorPosts[0].clientStatus === 409
  && priorPosts[1].clientStatus === 200 && priorPosts[0].requestId === priorPosts[1].requestId
  && priorPosts[0].orderId === priorPosts[1].orderId;
const events = resume || receiptOnly ? prior.events : [];
let injected = resume || receiptOnly;
const json = text => { try { return JSON.parse(text); } catch { return null; } };
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = { ...req.headers };
    for (const key of ['host', 'content-length', 'connection', 'accept-encoding']) delete headers[key];
    const upstream = await fetch(`http://127.0.0.1:${targetPort}${req.url}`, {
      method: req.method, headers, ...(body.length ? { body } : {}),
    });
    const text = await upstream.text(), value = json(text), request = json(body.toString('utf8'));
    let clientStatus = upstream.status, responseBody = text, fault = false;
    if (!injected && req.method === 'POST' && new URL(req.url, 'http://loopback').pathname === '/api/orders' && upstream.status === 200 && value?.id) {
      injected = fault = true;
      clientStatus = 409;
      responseBody = JSON.stringify({ error: 'quote_consumed' });
    }
    events.push({ method: req.method, path: new URL(req.url, 'http://loopback').pathname,
      requestId: request?.requestId ?? null, upstreamStatus: upstream.status, clientStatus,
      orderId: value?.id ?? null, injected409: fault });
    res.writeHead(clientStatus, { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
    res.end(responseBody);
  } catch (error) {
    events.push({ method: req.method, path: req.url, proxyError: error.name });
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'synthetic_proxy_failure' }));
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(proxyPort, '127.0.0.1', resolve); });
const targetProvision = { ...JSON.parse(readFileSync(resolve('.expo', targetPort === 4191 ? 'phone-qa' : `phone-qa-${targetPort}`, 'provision.json'), 'utf8')), apiUrl: `http://127.0.0.1:${targetPort}` };
const call = path => apiCall(targetProvision, path, 'customer');
const tapText = (ui, text) => {
  const matches = ui.filter(node => [node.text, node['content-desc']].some(value => value && (value === text || value.startsWith(`${text} `))) && node.enabled !== 'false');
  assert.ok(matches.length, `Missing native control ${text}; visible: ${ui.map(n => n.text || n['content-desc']).filter(Boolean).join(' | ')}`);
  tap(matches[0]);
};
const finish = async sourceOrderId => {
  const orderPosts = events.filter(event => event.method === 'POST' && event.path === '/api/orders');
  assert.equal(orderPosts.length, 2, 'One ambiguous attempt and one Retry');
  assert.equal(orderPosts[0].upstreamStatus, 200, 'The first request committed before the synthetic 409');
  assert.equal(orderPosts[0].clientStatus, 409);
  assert.equal(orderPosts[0].injected409, true);
  assert.equal(orderPosts[1].clientStatus, 200, 'Retry replays the committed order');
  assert.ok(orderPosts[0].requestId && orderPosts[0].requestId === orderPosts[1].requestId, 'Retry preserves requestId');
  assert.ok(orderPosts[0].orderId && orderPosts[0].orderId === orderPosts[1].orderId, 'Retry lands on the same committed order');
  const receipt = await call(`/orders/commands/${encodeURIComponent(orderPosts[0].requestId)}`);
  assert.equal(receipt.orderId, orderPosts[0].orderId, 'The read-only command receipt identifies the committed order');
  const result = { at: new Date().toISOString(), proxyPort, targetPort, sourceOrderId,
    orderPosts, receiptOrderId: receipt.orderId,
    screenshots: ['ambiguous-form', 'ambiguous-pending', 'ambiguous-recovered'] };
  writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(`Native ambiguous-command recovery passed: committed order ${receipt.orderId}, forced client 409, same-request retry returned that order. Evidence: ${output}`);
};
try {
  adb('reverse', `tcp:${proxyPort}`, `tcp:${proxyPort}`);
  const orders = await call('/orders');
  const source = orders.find(order => order.status === 'completed');
  assert.ok(source, 'A completed synthetic order supplies a valid order-again form');
  if (receiptOnly) {
    await finish(source.id);
  } else {
    open('customer', `book?again=${source.id}`);
    await pause(6000);
    const form = await snapshot('ambiguous-form', 'ps.wind.app.testcustomer');
    if (resume) assert.ok(form.some(node => node.text?.includes(c.bookingPending)), 'Resume the preserved pending order');
    else tapText(form, c.request);
    await pause(6000);
    const pending = await snapshot('ambiguous-pending', 'ps.wind.app.testcustomer');
    assert.ok(pending.some(node => node.text?.includes(c.bookingPending) || node['content-desc']?.includes(c.bookingPending)), 'The native pending card remains after the forced 409');
    tapText(pending, c.retry);
    await pause(6000);
    await snapshot('ambiguous-recovered', 'ps.wind.app.testcustomer');
    await finish(source.id);
  }
} catch (error) {
  writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), error: error.message, events }, null, 2));
  throw error;
} finally {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
