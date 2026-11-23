import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/install.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
function openGuide(storage, browserLanguage) {
  const nodes = new Map();
  const getElementById = id => {
    if (!nodes.has(id)) nodes.set(id, { addEventListener: (event, handler) => { nodes.get(id)[event] = handler; }, setAttribute() {} });
    return nodes.get(id);
  };
  const documentElement = {};
  const heading = { dataset: { ar: 'دليل التثبيت', en: 'Install guide' } };
  runInNewContext(source, { localStorage: storage, navigator: { language: browserLanguage },
    document: { documentElement, getElementById, querySelector: () => heading, querySelectorAll: () => [heading] },
    window: { matchMedia: () => ({ matches: false }) } });
  return { element: documentElement, toggle: getElementById('language').click, heading };
}

const values = new Map([['language', 'ar']]);
const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
const guide = openGuide(storage, 'en-US');
assert.deepEqual(guide.element, { lang: 'ar', dir: 'rtl' }, 'the app preference wins over the browser language');
guide.toggle();
assert.equal(values.get('language'), 'en');
assert.equal(openGuide(storage, 'ar-PS').heading.textContent, 'Install guide', 'the selected language survives reload');
values.set('language', 'invalid');
assert.equal(openGuide(storage, 'ar-PS').element.lang, 'ar');

const denied = () => { throw new Error('storage unavailable'); };
const privateGuide = openGuide({ getItem: denied, setItem: denied }, 'en-US');
privateGuide.toggle();
assert.deepEqual(privateGuide.element, { lang: 'ar', dir: 'rtl' }, 'the toggle still works when storage is blocked');
assert.match(shell, /<noscript>.*lang="ar".*lang="en".*<\/noscript>/s, 'the app fallback is readable in both languages');
console.log('Install guide uses the shared language preference, with a working fallback when storage is blocked');
