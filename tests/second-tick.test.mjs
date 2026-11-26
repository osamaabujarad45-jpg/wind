// The driver jobs screen re-renders every second only while it is focused and shows an offer with a countdown.
// useSecondTick runs against a stub React and stub timers, so the timer lifecycle is asserted, not assumed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = ts.transpileModule(read('src/use-second-tick.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

// Hooks are slots in call order. Layout effects run after the render returns (after commit, before paint),
// and an unmount runs the last cleanup. `painted` is the value of the render React actually paints: a state
// update from a layout effect re-renders before paint.
function harness() {
  const slots = [], timers = new Map();
  let cursor = 0, nextId = 1, clock = 1_000, cleanup = null, pending = null;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useLayoutEffect(run, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) { slots[index] = deps; pending = run; }
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
    render(active) {
      cursor = 0; const value = useSecondTick(active);
      if (pending) { cleanup?.(); cleanup = pending() ?? null; pending = null; }
      return value;
    },
    painted(active) { this.render(active); cursor = 0; return useSecondTick(active); },
    unmount() { cleanup?.(); cleanup = null; },
    timers, advance(ms) { clock += ms; },
    fire(kind) { for (const [id, timer] of [...timers]) if (timer.kind === kind) { if (kind === 'timeout') timers.delete(id); timer.fn(); } },
  };
}

const h = harness();
assert.deepEqual({ ...h.render(false) }, { now: 1_000, current: false }, 'starts at the current time, not current while idle');
assert.equal(h.timers.size, 0, 'no timer runs while nothing counts down');
h.advance(40 * 60_000);
assert.equal(h.render(false).now, 1_000, 'an idle screen does not re-read the clock');
const first = h.render(true);
assert.equal(first.current, false, 'the render before the layout effect does not trust the idle value');
assert.deepEqual([...h.timers.values()].map(t => [t.kind, t.ms]), [['interval', 1000]], 'one 1 s tick');
assert.deepEqual({ ...h.render(true) }, { now: 2_401_000, current: true }, 'the painted frame already has the real time');
assert.equal(h.timers.size, 1, 'a repeat render adds no timers');
h.advance(1_000); h.fire('interval');
assert.equal(h.render(true).now, 2_402_000, 'ticks every second while active');
assert.equal(h.render(false).current, false, 'losing focus or the last offer makes it not current');
assert.equal(h.timers.size, 0, 'and stops every timer');
h.advance(60_000);
assert.deepEqual({ ...h.painted(true) }, { now: 2_462_000, current: true }, 'reactivating paints the real time, not the value from before');
h.unmount();
assert.equal(h.timers.size, 0, 'unmounting stops every timer');

// The screen wires it to focus and visible offers, gates the countdown and both answers on `current`, and runs no clock of its own.
const screen = read('src/app/driver/index.tsx');
assert.match(screen, /useSecondTick\(\s*focused\b[^)]*\.dispatch\?\.myOffer/, 'clock gated on focus and an offer with a countdown');
assert.match(screen, /myOffer && !clock\.current \? c\.accept_wait_status/, 'accept waits for a current clock');
assert.match(screen, /myOffer && clock\.current && <OfferClock/, 'no countdown is shown or announced from a stale clock');
assert.match(screen, /c\.dispatchDecline[^\n]*!clock\.current/, 'decline waits for a current clock');
assert.doesNotMatch(screen, /setInterval\(/, 'the driver screen runs no clock of its own');
console.log('second tick: idle screens run no timer; offers tick each second and never use a stale clock');
