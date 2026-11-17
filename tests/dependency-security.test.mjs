import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const zod = require('zod');

test('Expo deepmerge and its browser bundle keep attacker keys out of result prototypes', async () => {
  const expoRequire = createRequire(require.resolve('@expo/config'));
  const bundle = await readFile(new URL('../vendor/deepmerge/dist/umd.js', import.meta.url), 'utf8');
  const browser = {};
  runInNewContext(bundle, browser);
  for (const merge of [expoRequire('deepmerge'), browser.deepmerge]) {
    const poison = JSON.parse('{"__proto__":{"polluted":true}}');
    const result = merge(poison, { nested: { safe: true } });
    assert.equal(Object.getPrototypeOf(result).polluted, undefined);
    assert.equal(result.polluted, undefined);
    assert.equal(Object.hasOwn(result, '__proto__'), true);
    assert.equal(result.__proto__.polluted, true, 'an own data key cannot change the prototype');
    const both = merge(poison, JSON.parse('{"__proto__":{"injected":true}}'));
    assert.equal(both.injected, undefined);
    assert.equal(Object.getPrototypeOf(both).injected, undefined);
    const nullTarget = Object.assign(Object.create(null), poison);
    assert.equal(merge(nullTarget, {}).polluted, undefined);
    assert.equal(merge({}, poison).polluted, undefined);
    assert.equal({}.polluted, undefined);
  }
});

test('patched deepmerge preserves arrays, symbols, clones and custom merge compatibility', () => {
  const merge = createRequire(require.resolve('@expo/config'))('deepmerge');
  const symbol = Symbol('synthetic');
  const target = { list: [{ a: 1 }], nested: { a: 1 }, [symbol]: { a: 1 } };
  const result = merge(target, { list: [{ b: 2 }], nested: { b: 2 }, [symbol]: { b: 2 } });
  assert.deepEqual(result.list, [{ a: 1 }, { b: 2 }]);
  assert.deepEqual(result.nested, { a: 1, b: 2 });
  assert.deepEqual(result[symbol], { a: 1, b: 2 });
  assert.notEqual(result.list[0], target.list[0]);
  assert.notEqual(result.nested, target.nested);
  assert.deepEqual(merge.all([{ nested: { a: 1 } }, { nested: { b: 2 } }]), { nested: { a: 1, b: 2 } });
  assert.deepEqual(merge({ list: [1] }, { list: [2] }, { arrayMerge: (_a, b) => b }), { list: [2] });
  assert.deepEqual(merge({ nested: { a: 1 } }, { nested: { b: 2 } }, {
    customMerge: key => key === 'nested' ? () => ({ custom: true }) : undefined,
  }), { nested: { custom: true } });
});

test('Expo build tools resolve patched Zod 4 and reject oversized bounded arrays before walking items', () => {
  assert.match(require('zod/package.json').version, /^4\.6\.[6-9]\d*$/);
  let parsed = 0;
  const schema = zod.array(zod.any().superRefine(() => { parsed += 1; })).max(2);
  const result = schema.safeParse([1, 2, 3]);

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].code, 'too_big');
  assert.equal(parsed, 0);
});

test('node-forge stays on the 1.4.0 base and guards nested DigestAlgorithm children', async () => {
  assert.equal(require('node-forge/package.json').version, '1.4.0');
  assert.equal(require('node-forge/package.json').license, '(BSD-3-Clause OR GPL-2.0)');
  const rsaSource = await readFile(new URL('../vendor/node-forge/lib/rsa.js', import.meta.url), 'utf8');

  assert.match(rsaSource, /obj\.value\[0\]\.value\.length\s*!==/);
  assert.match(rsaSource, /'parameters' in capture/);

  // Upstream forge#1152's low-exponent e=3 forgery vector. It previously
  // verified despite an extra unconsumed element inside DigestAlgorithm.
  const modulus = new (require('node-forge').jsbn.BigInteger)([
    '2943851338959486749023220128247883872673446416188780128906858510',
    '0507839535636256317277708295678804401391394313946142335874609638',
    '6660819509361141525748702240343825617847432837639613499808068190',
    '7802897559477710338828027239284411238090037450817022107555351764',
    '1170327441791034393719271744724924194371070527213991317221667249',
    '0779727008421990374037994805699108447010306443226160454080397152',
    '7839457232809919202392450307767317822761454935119120485180507635',
    '9472439160130994385433568113626206477097769842080459156024112389',
    '4062006872333417793816670825914214968706669312685485046743622307',
    '25756397511775557878046572472650613407143',
  ].join(''), 10);
  const publicKey = require('node-forge').pki.rsa.setPublicKey(
    modulus,
    new (require('node-forge').jsbn.BigInteger)('3'),
  );
  const forgedSignature = Buffer.from([
    'a4ae63dd5e7712b78f4870d0f51e294df5503d4f16c5d27ae33370981fb57f0de49f',
    '50f3d6a04666774cd984cd13972db9bf8e12bd294ef0ddc916c7c86cbae63efd7b6b',
    '97885e69760c208a40f1aecc76a90d7af5145177efce1bb55807a8d05c20b1596753',
    'ba710642fc9acdde6c160232654662c77cc4466c8257a38edb49f894e8845d0fd987',
    'b857ced88f4b62505a080bd87ef700d35d392a6e8f6fde34250c50b86fae606cb551',
    '215e8f4813239b77651d5565ad453698c071d48c31e8e526fb4a37610f64b3e1fb8e',
    '5be5898e408ad08197a0947794a530b54f84485377ce4a7488ed485ce4e5e105dd89',
    '698a472f390c3b1b76bc16b73276c4d1c81d',
  ].join(''), 'hex').toString('binary');

  assert.throws(
    () => publicKey.verify('', forgedSignature, undefined, {
      _parseAllDigestBytes: true,
      _skipPaddingChecks: true,
    }),
    /ASN\.1 object does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo value\./,
  );
});

test('patched Forge still verifies a valid Node RSA/SHA-256 signature and rejects a changed message', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } });
  const message = Buffer.from('Synthetic Expo signing compatibility check');
  const signature = sign('sha256', message, keys.privateKey).toString('binary');
  const key = require('node-forge').pki.publicKeyFromPem(keys.publicKey);
  assert.equal(key.verify(createHash('sha256').update(message).digest('binary'), signature), true);
  assert.equal(key.verify(createHash('sha256').update('Changed synthetic message').digest('binary'), signature), false);
});


// GHSA-fc5q-39xc-vjpf: picomatch <= 4.0.7 backtracks exponentially on repeated extglobs whose branch holds a `*`.
// No patched release exists; both majors in the tree are vendored with a guard (vendor/picomatch-{2,4}).
const picomatches = { 2: require('../vendor/picomatch-2'), 4: require('../vendor/picomatch-4') };

test('every installed picomatch consumer resolves the vendored ReDoS guard of its own major', () => {
  const from = (base, name) => createRequire(base).resolve(name);
  const expo = require.resolve('expo');
  const consumers = { micromatch: [require.resolve('micromatch'), '2'], 'jest-util': [require.resolve('jest-util'), '2'],
    tinyglobby: [require.resolve('tinyglobby'), '4'], expo: [expo, '4'], '@expo/metro-config': [require.resolve('@expo/metro-config'), '4'],
    '@expo/cli': [from(expo, '@expo/cli'), '4'] };
  for (const [name, [base, major]] of Object.entries(consumers)) {
    const manifest = createRequire(base)('picomatch/package.json');
    assert.match(manifest.description, /GHSA-fc5q-39xc-vjpf/, `${name} resolves picomatch ${manifest.version} without the guard`);
    assert.equal(manifest.version.split('.')[0], major, `${name} needs picomatch ${major}.x`);
  }
});

test('patched picomatch refuses repeated star extglobs in bounded time and keeps ordinary globs', () => {
  // Each shape's own unit repeated, then a `/` that `[^/]` cannot consume. Counts are set so an unguarded copy takes
  // seconds (2^n shapes at 28 units, the slower-growing `a|aa` family at 40), so a regression fails instead of passing.
  const shapes = [['+(*)', 'a'], ['+(*a)', 'a'], ['*(*a)', 'a'], ['+(a*)', 'a'], ['+(x*a)', 'xa'], ['+(**)', 'a'], ['+(a[*)', 'a['],
    ['+([a*)', '[a'], ['+(a*(?:b))', 'ab'], ['+(a|*b)', 'b'], ['+(ab*|cd)', 'ab'],
    // Variable-width or ambiguous branches without a star: negation, a repeat behind another group, overlaps.
    ['+(!(a))', 'b'], ['+(!(a)|b)', 'b'], ['+(@(+(a)))', 'a'], ['+([a-z]|a)', 'a'], ['+(ab|ab)', 'ab'], ['+(a?|a)', 'a'],
    ['+("a"|a)', 'a'], ['+(a|"a")', 'a'], ['+({a,aa})', 'a', 40], ['+(@(a|aa))', 'a', 40], ['+("a"|aa)', 'a', 40],
    ['+(a|A)', 'a', 28, { nocase: true }], ['+(*(a))', 'a', 28, { maxExtglobRecursion: false }],
    ['+(*(a)|b)', 'a', 28, { maxExtglobRecursion: false }], ['+(*a)', 'a', 28, { maxExtglobRecursion: false }]];
  for (const [major, picomatch] of Object.entries(picomatches)) {
    for (const [glob, unit, count = 28, options] of shapes) {
      const started = performance.now();
      assert.equal(picomatch.isMatch(unit.repeat(count) + '/x', glob, options), false, `${major} ${glob}`);
      assert.ok(performance.now() - started < 250, `picomatch ${major}: ${glob} ${JSON.stringify(options ?? {})} backtracked`);
    }
    // Ordinary globs, multi-branch extglobs without a star and Jest's default testMatch still match as before.
    assert.equal(picomatch.isMatch('src/a.js', 'src/*.js'), true);
    assert.equal(picomatch.isMatch('a/b/c.ts', '**/*.ts'), true);
    assert.equal(picomatch.isMatch('abba', '+(a|b)'), true);
    assert.equal(picomatch.isMatch('foo.js', '*.+(js|ts)'), true);
    assert.equal(picomatch.isMatch('foo.md', '*.+(js|ts)'), false);
    assert.equal(picomatch.isMatch('src/a.test.tsx', '**/?(*.)+(spec|test).[jt]s?(x)'), true);
    assert.equal(picomatch.isMatch('src/a.tsx', '**/?(*.)+(spec|test).[jt]s?(x)'), false);
    // Fixed-width repeats keep their meaning; a star inside a repeat is now literal (`[*]` included), by design.
    assert.equal(picomatch.isMatch('file-123.js', 'file-+([0-9]).js'), true);
    // Alternatives that share a prefix but decode uniquely keep matching (`js|jsx`, `ts|tsx`, `md|mdx`, `json|json5`).
    for (const [file, glob] of [['a.jsx', '*.+(js|jsx)'], ['a.js', '*.+(js|jsx)'], ['src/b/c.tsx', '**/*.+(js|jsx|ts|tsx)'],
      ['README.mdx', '*.+(md|mdx)'], ['x.json5', '*.+(json|json5)'], ['ababb', '+(a|ab|bb)']]) assert.equal(picomatch.isMatch(file, glob), true, `${major} ${glob} ${file}`);
    assert.equal(picomatch.isMatch('abac', '+(a?)'), true);
    assert.equal(picomatch.isMatch('**', '+([*])'), false);
    // 4.x flattens all-single-character star branches to one class; 2.x never matched these, and still does not.
    assert.equal(picomatch.isMatch('aab', '+(*(a)|*(b))'), major === '4');
  }
});
