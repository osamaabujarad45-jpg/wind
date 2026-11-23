// The theme provider (src/theme-context.tsx): the saved choice comes back on launch, a new choice is saved on the device, Automatic
// is Night only for a captain after dark, a late saved value never overrides a choice made meanwhile, and storage that never
// answers cannot hold the launch intro.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const theme = require('../src/theme.ts');
const source = ts.transpileModule(readFileSync(new URL('../src/theme-context.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ saved, role = 'customer', hang = false }) {
  let slots = [], cursor = 0, effects = [], timers = [], session = { me: role ? { user: { role } } : null };
  const writes = [];
  let answer;
  const react = {
    createContext: value => ({ Provider: 'Provider', value }),
    useContext: context => context.value,
    useState: init => { const i = cursor++; slots[i] ??= { value: typeof init === 'function' ? init() : init };
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef: value => slots[cursor++] ??= { current: value },
    useEffect: (fn, deps) => { const i = cursor++; if (!slots[i]) { slots[i] = { deps }; effects.push(fn); } },
    useCallback: fn => { const i = cursor++; return (slots[i] ??= { fn }).fn; },
    useMemo: fn => fn(),
  };
  const modules = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    './storage': { storage: {
      get: () => hang ? new Promise(() => {}) : new Promise(resolve => { answer = () => resolve(saved ?? null); }),
      set: async (key, value) => { writes.push([key, value]); },
    } },
    './session': { useSession: () => session },
    './theme': theme, './model': {},
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    setInterval: () => 1, clearInterval() {} };
  runInNewContext(source, context);
  const render = () => {
    cursor = 0;
    const tree = context.exports.ThemeProvider({ children: null });
    for (const fn of effects.splice(0)) fn();
    return tree.props.value;
  };
  return { render, writes, timers, answer: async () => { answer?.(); await new Promise(r => setImmediate(r)); }, session };
}

// a saved Night comes back, and the intro waits for it
{
  const h = harness({ saved: 'night' });
  let value = h.render();
  assert.equal(value.ready, false, 'the launch intro waits for the saved choice');
  assert.equal(value.name, 'day');
  await h.answer();
  value = h.render();
  assert.equal(value.ready, true);
  assert.equal(value.choice, 'night');
  assert.equal(value.name, 'night', 'a saved Night opens on Night');
  assert.equal(value.palette.paper, theme.palettes.night.paper);
  value.setChoice('day');
  value = h.render();
  assert.equal(value.name, 'day');
  assert.deepEqual(h.writes, [['theme', 'day']], 'the choice is saved on this device');
}

// a choice made before the saved value arrives is kept
{
  const h = harness({ saved: 'night' });
  h.render().setChoice('day');
  await h.answer();
  assert.equal(h.render().choice, 'day', 'a late saved value does not override a choice made meanwhile');
}

// junk in storage reads as Automatic; Automatic is Day for a customer whatever the hour
{
  const h = harness({ saved: 'purple' });
  h.render(); await h.answer();
  const value = h.render();
  assert.equal(value.choice, 'auto');
  assert.equal(value.name, 'day');
}

// a captain on Automatic follows the sun (the same rule as resolveTheme, read at the real time now)
{
  const h = harness({ saved: null, role: 'driver' });
  h.render(); await h.answer();
  assert.equal(h.render().name, theme.afterDark(Date.now()) ? 'night' : 'day');
}

// storage that never answers: after the timeout the app opens anyway
{
  const h = harness({ hang: true });
  assert.equal(h.render().ready, false);
  const timeout = h.timers.find(t => !t.cleared);
  assert.ok(timeout && timeout.ms <= 2000, 'a short timeout guards the read');
  timeout.fn();
  assert.equal(h.render().ready, true, 'the intro is released without the saved choice');
}

console.log('Theme provider: saved choice restored and saved, late reads never override, Automatic follows role and sun, read timeout');
