// The driver jobs screen re-renders every second only while it is focused and shows an offer with a countdown.
// useSecondTick runs against a stub React and stub timers, so the timer lifecycle is asserted, not assumed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = ts.transpileModule(read('src/use-second-tick.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
  const slots = [], timers = new Map();
  let cursor = 0, nextId = 1, clock = 1_000, cleanup = null;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useEffect(run, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) { cleanup?.(); slots[index] = deps; cleanup = run() ?? null; }
    },
  };
  const add = (kind, fn, ms) => { const id = nextId++; timers.set(id, { kind, fn, ms }); return id; };
  const sandbox = {
    module: { exports: {} }, require: name => { assert.equal(name, 'react'); return react; },
    Date: { now: () => clock },
    setTimeout: (fn, ms) => add('timeout', fn, ms), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => add('interval', fn, ms), clearInterval: id => timers.delete(id),
  };
  sandbox.exports = sandbox.module.exports;
  runInNewContext(source, sandbox);
  const { useSecondTick } = sandbox.module.exports;
  return {
    render: active => { cursor = 0; return useSecondTick(active); },
    timers, advance(ms) { clock += ms; },
    fire(kind) { for (const timer of [...timers.values()]) if (timer.kind === kind) timer.fn(); },
  };
}

const h = harness();
assert.equal(h.render(false), 1_000, 'starts at the current time');
assert.equal(h.timers.size, 0, 'no timer runs while nothing counts down');
h.advance(5_000);
assert.equal(h.render(false), 1_000, 'an idle screen does not re-read the clock');
h.render(true);
assert.deepEqual([...h.timers.values()].map(t => [t.kind, t.ms]).sort(), [['interval', 1000], ['timeout', 0]], 'an offer starts one immediate refresh and a 1 s tick');
h.fire('timeout');
assert.equal(h.render(true), 6_000, 'the stale idle value is replaced as soon as the tick turns on');
h.advance(1_000); h.fire('interval');
assert.equal(h.render(true), 7_000, 'ticks every second while active');
h.render(false);
assert.equal(h.timers.size, 0, 'losing focus or the last offer stops every timer');

// The screen wires it to focus and visible offers, and keeps no timer of its own.
const screen = read('src/app/driver/index.tsx');
assert.ok(/const now = useSecondTick\(focused && !!jobs\?\.some\(job => job\.dispatch\)\);/.test(screen), 'driver clock gated on focus and offers');
assert.ok(!/setInterval|setNow/.test(screen), 'the driver screen runs no clock of its own');
console.log('second tick: idle screens run no timer; offers tick each second and refresh immediately');
