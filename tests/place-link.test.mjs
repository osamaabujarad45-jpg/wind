import assert from 'node:assert/strict';

// GEO-03: the server reads a short map link by following redirects itself. A scripted fetch stands in for the network:
// each answer is one response in order, 'hang' answers only when aborted, and every request is recorded.
const { resolveSharedLink, LinkError } = await import('../server/domain/place-link.ts');

function script(answers) {
  const calls = [];
  const send = (url, init) => {
    calls.push(url);
    assert.equal(init.redirect, 'manual', 'redirects are followed by the server, one hop at a time');
    const answer = answers.shift();
    if (!answer) return Promise.reject(new Error(`unexpected fetch ${url}`));
    if (answer === 'hang') {
      // AbortSignal.timeout's timer is unref'd: keep this process alive until the abort, as a live socket would.
      const alive = setTimeout(() => {}, 5000);
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => { clearTimeout(alive); reject(new Error('aborted')); }));
    }
    return Promise.resolve(new Response(null, answer));
  };
  return { send, calls };
}
const redirect = location => ({ status: 302, headers: { location } });
const SHORT = 'https://maps.app.goo.gl/AbC123';
const RAMALLAH_AT = 'https://www.google.com/maps/place/Ramallah/@31.9038,35.2034,17z';
const refusal = (promise, code = 'link_not_resolved') => assert.rejects(promise, error => error instanceof LinkError && error.code === code);

// Three redirects are the most that are followed: the point comes from the third target.
{
  const { send, calls } = script([redirect('https://www.google.com/a'), redirect('https://www.google.com/b'), redirect(RAMALLAH_AT)]);
  assert.deepEqual(await resolveSharedLink(SHORT, { send }), { latitude: 31.9038, longitude: 35.2034 });
  assert.equal(calls.length, 3);
}

// A chain of four redirects is refused, and the coordinates behind the fourth are never fetched.
{
  const { send, calls } = script([redirect('https://www.google.com/a'), redirect('https://www.google.com/b'), redirect('https://www.google.com/c'), redirect(RAMALLAH_AT)]);
  await refusal(resolveSharedLink(SHORT, { send }));
  assert.equal(calls.length, 4);
}

// A redirect to a host off the allowlist is refused before anything is fetched from it.
{
  const { send, calls } = script([redirect('https://evil.example/maps/@31.9038,35.2034,17z')]);
  await refusal(resolveSharedLink(SHORT, { send }));
  assert.deepEqual(calls, [SHORT]);
}
// So is a redirect to plain http on an allowed host, and to a Google page that is not a map.
for (const location of ['http://www.google.com/maps/@31.9038,35.2034,17z', 'https://accounts.google.evil.example/x', 'https://consent.google.example/']) {
  const { send, calls } = script([redirect(location)]);
  await refusal(resolveSharedLink(SHORT, { send }));
  assert.equal(calls.length, 1, location);
}
// A redirect target that names a point outside the served area is refused.
{
  const { send } = script([redirect('https://www.google.com/maps/@32.7940,34.9896,17z')]);
  await refusal(resolveSharedLink(SHORT, { send }));
}
// A page that answers without redirecting names no point, so it is refused, and its body is never read.
{
  const { send, calls } = script([{ status: 200, headers: {} }]);
  await refusal(resolveSharedLink(SHORT, { send }));
  assert.equal(calls.length, 1);
}

// The 3-second budget covers the whole chain: a hop that never answers is aborted and refused.
{
  const { send } = script(['hang']);
  const started = Date.now();
  await refusal(resolveSharedLink(SHORT, { send, timeoutMs: 40 }));
  assert.ok(Date.now() - started < 1000, 'the read gives up at its budget');
}
// The budget is shared across hops: a fast first redirect does not buy the second hop more time.
{
  const { send, calls } = script([redirect('https://www.google.com/a'), 'hang']);
  await refusal(resolveSharedLink(SHORT, { send, timeoutMs: 40 }));
  assert.equal(calls.length, 2);
}
// Only the caller's input is checked before a request: https on an allowlisted host.
for (const input of ['http://maps.app.goo.gl/AbC123', 'https://evil.example/maps/@31.9038,35.2034,17z', 'not a url', 'https://www.google.evil.example/maps/@31.9038,35.2034,17z']) {
  const { send, calls } = script([]);
  await refusal(resolveSharedLink(input, { send }), 'invalid_input');
  assert.equal(calls.length, 0, input);
}

// A full map link that already names its point needs no request at all.
{
  const { send, calls } = script([]);
  assert.deepEqual(await resolveSharedLink('https://maps.google.com/?q=32.3116,35.0279', { send }), { latitude: 32.3116, longitude: 35.0279 });
  assert.equal(calls.length, 0);
}

console.log('Place link checks passed');
