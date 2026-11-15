// Native v27→v28 pending-command upgrade acceptance. Only the first committed POST's client response becomes 409.
// Package installation uses adb -r; every UI action requires the existing agent-device transport.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adb, open, snapshot, tap, apiCall, pause } from './check-phone-tests.mjs';
import { copy } from '../src/copy.ts';

const proxyPort = 4193, targetPort = 4192, pkg = 'ps.wind.app.testcustomer';
if ((process.env.WIND_PHONE_TEST_PORT ?? '') !== String(proxyPort)) throw new Error('Build the customer test app with WIND_PHONE_TEST_PORT=4193');
assert.ok(process.env.WIND_AGENT_DEVICE?.includes('agent-device'), 'Upgrade UI requires WIND_AGENT_DEVICE; direct adb UI is forbidden');
const sandboxName = `phone-qa-${proxyPort}`;
const provision = JSON.parse(readFileSync(resolve('.expo', sandboxName, 'provision.json'), 'utf8'));
assert.equal(provision.apiUrl, `http://127.0.0.1:${proxyPort}`);
const output = resolve('.expo', sandboxName, 'device', 'upgrade-results.json');
const v27Apk = resolve(process.env.WIND_UPGRADE_V27_APK ?? '.expo/phone-qa-4193/upgrade-v27/apks/wind-customer.apk');
const v28Apk = resolve(process.env.WIND_UPGRADE_V28_APK ?? '.expo/phone-qa-4193/upgrade-v28/apks/wind-customer.apk');
const aapt = resolve(process.env.LOCALAPPDATA ?? '', 'Android/Sdk/build-tools/36.0.0/aapt.exe');
const artifact = (path, expectedVersion) => {
  const badging = execFileSync(aapt, ['dump', 'badging', path], { encoding: 'utf8', timeout: 30_000 });
  const line = badging.split(/\r?\n/).find(value => value.startsWith('package: ')) ?? '';
  const name = line.match(/name='([^']+)'/)?.[1];
  const versionCode = Number(line.match(/versionCode='(\d+)'/)?.[1]);
  const versionName = line.match(/versionName='([^']+)'/)?.[1];
  assert.equal(name, pkg, `${path}: wrong package`);
  assert.equal(versionCode, expectedVersion, `${path}: wrong versionCode`);
  return { path, package: name, versionCode, versionName, bytes: statSync(path).size,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
};
const artifacts = { v27: artifact(v27Apk, 27), v28: artifact(v28Apk, 28) };
const packageInfo = () => {
  const text = adb('shell', 'dumpsys', 'package', pkg).toString();
  return { package: pkg, versionCode: Number(text.match(/versionCode=(\d+)/)?.[1]),
    versionName: text.match(/versionName=([^\s]+)/)?.[1] ?? null,
    firstInstallTime: text.match(/firstInstallTime=(.*)/)?.[1]?.trim() ?? null,
    lastUpdateTime: text.match(/lastUpdateTime=(.*)/)?.[1]?.trim() ?? null };
};
const install = (path, expectedVersion) => {
  const serial = process.env.WIND_PHONE_SERIAL?.trim() || 'R5CTB0FJP9Z';
  const result = execFileSync('adb', ['-s', serial, 'install', '-r', path], { encoding: 'utf8', timeout: 180_000 });
  assert.match(result, /Success/, `adb install -r failed for versionCode ${expectedVersion}`);
  const installed = packageInfo();
  assert.equal(installed.versionCode, expectedVersion, `Installed versionCode ${expectedVersion} was not read back`);
  return { result: result.trim(), installed };
};
const c = copy.ar;
const prior = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : null;
const priorPosts = prior?.events?.filter(event => event.method === 'POST' && event.path === '/api/orders') ?? [];
const receiptOnly = priorPosts.length === 2 && priorPosts[0].injected409 && priorPosts[0].upstreamStatus === 200
  && priorPosts[0].clientStatus === 409 && priorPosts[1].clientStatus === 200
  && priorPosts[0].requestId === priorPosts[1].requestId && priorPosts[0].orderId === priorPosts[1].orderId;
const resume = !receiptOnly && priorPosts.length === 1 && priorPosts[0].injected409
  && ['submit-v27', 'pending-v27', 'install-v28', 'open-v28', 'retry-v28'].includes(prior?.stage) && !prior?.automaticRecovery;
assert.ok(!prior || receiptOnly || resume || priorPosts.length === 0, `Prior upgrade evidence is not safely resumable: ${prior?.stage}; ${prior?.error}`);
assert.ok(!prior?.passed, 'The native upgrade acceptance already passed; refusing to create another order');
const events = receiptOnly || resume ? prior.events : [];
let injected = receiptOnly || resume;
let stage = prior?.stage ?? 'preflight';
const evidence = {
  schemaVersion: 1, startedAt: prior?.startedAt ?? new Date().toISOString(), proxyPort, targetPort,
  artifacts, initialPackage: prior?.initialPackage ?? null, baselinePackage: prior?.baselinePackage ?? null,
  upgradedPackage: prior?.upgradedPackage ?? null, baselineInstall: prior?.baselineInstall ?? null,
  upgradeInstall: prior?.upgradeInstall ?? null, sourceOrderId: prior?.sourceOrderId ?? null,
  automaticRecovery: prior?.automaticRecovery ?? false, receiptOrderId: prior?.receiptOrderId ?? null,
  failures: prior?.failures ?? [], events,
};
const save = () => writeFileSync(output, JSON.stringify({ ...evidence, at: new Date().toISOString(), stage, events }, null, 2));
const json = text => { try { return JSON.parse(text); } catch { return null; } };
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks), headers = { ...req.headers };
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
    save();
    res.writeHead(clientStatus, { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
    res.end(responseBody);
  } catch (error) {
    events.push({ method: req.method, path: req.url, proxyError: error.name });
    save();
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'synthetic_proxy_failure' }));
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(proxyPort, '127.0.0.1', resolve); });
const targetProvision = { ...provision, apiUrl: `http://127.0.0.1:${targetPort}` };
const call = path => apiCall(targetProvision, path, 'customer');
const tapText = (ui, text) => {
  const matches = ui.filter(node => [node.text, node['content-desc']].some(value => value && (value === text || value.startsWith(`${text} `))) && node.enabled !== 'false');
  assert.ok(matches.length, `Missing native control ${text}; visible: ${ui.map(n => n.text || n['content-desc']).filter(Boolean).join(' | ')}`);
  tap(matches[0]);
};
const finish = async () => {
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
  assert.equal(packageInfo().versionCode, 28);
  evidence.receiptOrderId = receipt.orderId;
  evidence.orderPosts = orderPosts;
  evidence.screenshots = ['upgrade-v27-form', 'upgrade-v27-pending', 'upgrade-v28-pending', 'upgrade-recovered'];
  evidence.passed = true;
  stage = 'passed';
  save();
  console.log(`Native v27-to-v28 pending-command Retry passed: order ${receipt.orderId}, same requestId/order, read-only receipt confirmed. Evidence: ${output}`);
};
try {
  adb('reverse', `tcp:${proxyPort}`, `tcp:${proxyPort}`);
  const current = packageInfo();
  evidence.initialPackage ??= current;
  if (!receiptOnly && !resume) {
    stage = 'agent-preflight';
    save();
    open('customer'); // Claim the device before package replacement can interrupt another session's app.
    if (current.versionCode !== 27) {
      stage = 'install-v27';
      evidence.baselineInstall = install(v27Apk, 27);
    }
    evidence.baselinePackage = packageInfo();
    assert.equal(evidence.baselinePackage.versionCode, 27);
  }
  const orders = await call('/orders');
  const source = orders.find(order => order.id === evidence.sourceOrderId) ?? orders.find(order => order.status === 'completed');
  assert.ok(source, 'A completed synthetic order supplies a valid order-again form');
  evidence.sourceOrderId = source.id;
  if (receiptOnly) await finish();
  else {
    if (!resume) {
      stage = 'submit-v27';
      open('customer', `book?again=${source.id}`);
      await pause(6000);
      const form = await snapshot('upgrade-v27-form', pkg);
      tapText(form, c.request);
      await pause(6000);
      const pending = await snapshot('upgrade-v27-pending', pkg);
      assert.ok(pending.some(node => node.text?.includes(c.bookingPending) || node['content-desc']?.includes(c.bookingPending)), 'The v27 native pending card remains after the forced 409');
      stage = 'pending-v27';
      save();
    }
    if (packageInfo().versionCode !== 28) {
      stage = 'install-v28';
      save();
      evidence.upgradeInstall = install(v28Apk, 28);
      assert.equal(packageInfo().firstInstallTime, evidence.baselinePackage.firstInstallTime, 'Upgrade preserves the package installation identity');
    }
    evidence.upgradedPackage = packageInfo();
    stage = 'open-v28';
    save();
    open('customer', `book?again=${source.id}`);
    await pause(6000);
    const upgraded = await snapshot('upgrade-v28-pending', pkg);
    const hasPending = upgraded.some(node => node.text?.includes(c.bookingPending) || node['content-desc']?.includes(c.bookingPending));
    if (!hasPending) {
      const first = events.find(event => event.method === 'POST' && event.path === '/api/orders');
      assert.ok(first?.requestId && first?.orderId, 'The committed request is identified before reconciliation');
      const receipt = await call(`/orders/commands/${encodeURIComponent(first.requestId)}`);
      evidence.receiptOrderId = receipt.orderId;
      evidence.automaticRecovery = receipt.orderId === first.orderId;
      save();
      throw new Error(`Post-upgrade pending card is unavailable: automatic receipt reconciliation ${evidence.automaticRecovery ? `recovered order ${receipt.orderId}` : 'did not confirm the order'}; Retry was not offered`);
    }
    stage = 'retry-v28';
    save();
    tapText(upgraded, c.retry);
    await pause(6000);
    await snapshot('upgrade-recovered', pkg);
    await finish();
  }
} catch (error) {
  evidence.failures.push({ at: new Date().toISOString(), stage, error: error.message });
  save();
  throw error;
} finally {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
