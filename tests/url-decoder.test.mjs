import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const query = require('query-string');
const decoderPath = createRequire(require.resolve('query-string')).resolve('decode-uri-component');
const decode = require(decoderPath);
assert.equal(typeof decode, 'function');
assert.deepEqual({ ...query.parse('name=%D8%B7%D9%88%D9%84%D9%83%D8%B1%D9%85&note=one+two&tag=a&tag=b') }, {
  name: 'طولكرم', note: 'one two', tag: ['a', 'b'],
});
for (const [encoded, expected] of [['%E2%82%AC', '€'], ['%F0%9F%9A%9A', '🚚'], ['%41%FF%42', 'A%FFB'], ['%24%26%FF', '$&%FF'], ['%C0%AF', '%C0%AF'], ['%', '%']]) assert.equal(decode(encoded), expected);
assert.throws(() => decode(null), TypeError);
// The vulnerable recursive decoder stalls on malformed runs; enforce a process deadline.
const child = spawnSync(process.execPath, ['-e', `const d=require(${JSON.stringify(decoderPath)});const s='%FF'.repeat(25000)+'%41';if(d(s)!=='%FF'.repeat(25000)+'A')process.exit(1)`], { timeout: 3000, encoding: 'utf8' });
assert.equal(child.error, undefined, child.error?.message);
assert.equal(child.status, 0, child.stderr);
console.log('Patched URL decoder: CommonJS compatibility, Arabic/query arrays and bounded malformed input passed');
