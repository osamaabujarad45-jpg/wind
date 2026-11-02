import assert from 'node:assert/strict';
import { loadGoogleMaps } from '../src/google-maps-loader.ts';

const original = { window: globalThis.window, document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
const tags = new Set(), timers = new Set();
globalThis.window = {};
globalThis.document = {
  getElementById: id => [...tags].find(tag => tag.id === id),
  createElement: () => { const tag = { remove: () => tags.delete(tag) }; return tag; },
  head: { appendChild: tag => tags.add(tag) },
};
globalThis.setTimeout = callback => { timers.add(callback); return callback; };
globalThis.clearTimeout = timer => timers.delete(timer);
try {
  const first = loadGoogleMaps('restricted key');
  assert.equal(loadGoogleMaps('restricted key'), first, 'concurrent maps share one script');
  assert.equal(tags.size, 1);
  assert.match([...tags][0].src, /key=restricted%20key/);
  const rejected = assert.rejects(first, /timeout/);
  [...timers][0]();
  await rejected;
  assert.equal(tags.size, 0, 'timed out script is removed so retry can fetch');
  const second = loadGoogleMaps('restricted key');
  const failed = assert.rejects(second, /failed to load/);
  [...tags][0].onerror();
  await failed;
  assert.equal(tags.size, 0);
  const third = loadGoogleMaps('restricted key');
  const maps = { Map: class {} };
  window.google = { maps };
  window.windGoogleMapsReady();
  assert.equal(await third, maps);
  assert.equal(await loadGoogleMaps('restricted key'), maps, 'initialized SDK reused on navigation');
  assert.equal(timers.size, 0);
  console.log('google-maps-loader: ok (concurrency, timeout/retry, network failure, callback and reuse)');
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
