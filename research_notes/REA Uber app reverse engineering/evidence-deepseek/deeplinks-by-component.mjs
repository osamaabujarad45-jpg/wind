import { readFileSync } from "node:fs";

const e = JSON.parse(
  readFileSync("C:/Users/osama/AppData/Local/Temp/opencode/uber/evidence/manifest.json", "utf8"),
);
const xml = e.normalized_result.manifest.text;

const blocks = [...xml.matchAll(/<(activity|activity-alias)\b([\s\S]*?)<\/\1>/g)].map((m) => ({
  kind: m[1],
  body: m[0],
}));

const attr = (body, name) => {
  const m = body.match(new RegExp(`android:${name}="([^"]*)"`));
  return m ? m[1] : null;
};
const all = (body, name) => [...body.matchAll(new RegExp(`android:${name}="([^"]*)"`, "g"))].map((m) => m[1]);

const rows = blocks.map((b) => ({
  kind: b.kind,
  name: attr(b.body, "name"),
  exported: attr(b.body, "exported"),
  schemes: [...new Set(all(b.body, "scheme"))],
  hosts: [...new Set(all(b.body, "host"))],
  filters: (b.body.match(/<intent-filter/g) || []).length,
}));

const wildcard = rows.filter((r) => r.hosts.includes("*"));
console.log("components_with_host_wildcard:");
console.log(JSON.stringify(wildcard, null, 1));

console.log("\ncomponents_with_custom_scheme:");
console.log(
  JSON.stringify(
    rows.filter((r) => r.schemes.some((s) => !["http", "https"].includes(s))),
    null,
    1,
  ),
);

console.log("\nhttp_components:");
console.log(
  JSON.stringify(
    rows.filter((r) => r.schemes.includes("http") || r.schemes.includes("https")),
    null,
    1,
  ),
);
