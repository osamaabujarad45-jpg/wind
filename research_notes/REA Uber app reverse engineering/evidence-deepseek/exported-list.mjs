import { readFileSync } from "node:fs";

const e = JSON.parse(
  readFileSync("C:/Users/osama/AppData/Local/Temp/opencode/uber/evidence/manifest.json", "utf8"),
);
const items = e.normalized_result.components.items;
const exp = items.filter((c) => c.exported === true);

console.log(`components=${items.length} exported=${exp.length}`);
const counts = {};
for (const c of exp) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
console.log(JSON.stringify(counts));

const seen = new Map();
for (const c of exp) seen.set(c.name, (seen.get(c.name) ?? 0) + 1);
for (const [name, n] of [...seen.entries()].sort()) {
  const c = exp.find((x) => x.name === name);
  console.log(`${c.kind}\t${name}\tx${n}\tperm=${c.permission ?? "-"}\tactions=${(c.actions ?? []).join("|")}`);
}

const declared = items.map((c) => c.name);
const dupNames = declared.filter((n, i) => declared.indexOf(n) !== i);
console.log("duplicate_declarations:", JSON.stringify([...new Set(dupNames)]));
