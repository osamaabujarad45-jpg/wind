import { readFileSync } from "node:fs";

const e = JSON.parse(
  readFileSync("C:/Users/osama/AppData/Local/Temp/opencode/uber/evidence/manifest.json", "utf8"),
);
const xml = e.normalized_result.manifest.text;
const needle = 'android:host="*"';

let i = -1;
const hits = [];
while ((i = xml.indexOf(needle, i + 1)) !== -1) hits.push(i);

console.log(`wildcard_hits=${hits.length}`);
for (const h of hits) {
  const before = xml.slice(Math.max(0, h - 1200), h + 200);
  // name of the nearest enclosing component declaration
  const owners = [...before.matchAll(/<(activity|activity-alias|service|receiver|provider)\b[^>]*android:name="([^"]+)"/g)];
  const owner = owners.length ? owners[owners.length - 1][2] : "UNKNOWN";
  console.log("---");
  console.log(`owner=${owner}`);
  console.log(before.slice(-700));
}
