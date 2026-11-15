// Fails when an exported bundle still names an API host the app no longer uses (scripts/retired-api-hosts.json).
// app.config.js refuses such a host as EXPO_PUBLIC_API_URL; this catches one hard-coded anywhere else in the bundle.
// Usage: node scripts/check-retired-hosts.mjs <export dir>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const retired = JSON.parse(readFileSync(new URL('./retired-api-hosts.json', import.meta.url), 'utf8'));
const root = process.argv[2];
if (!root) { console.error('usage: check-retired-hosts.mjs <export dir>'); process.exit(2); }
const hits = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|hbc|json|html|map)$/.test(name)) {
      const text = readFileSync(path, 'latin1');
      for (const host of retired) if (text.includes(host)) hits.push(`${path}: ${host}`);
    }
  }
};
walk(root);
if (hits.length) { console.error(`retired API host in the bundle:\n${hits.join('\n')}`); process.exit(1); }
console.log(`no retired API host in ${root}`);
