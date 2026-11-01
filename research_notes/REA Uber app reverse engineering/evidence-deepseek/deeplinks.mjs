import { readFileSync } from "node:fs";

const e = JSON.parse(
  readFileSync("C:/Users/osama/AppData/Local/Temp/opencode/uber/evidence/manifest.json", "utf8"),
);
const xml = e.normalized_result.manifest.text;
const grab = (re) => [...xml.matchAll(re)].map((m) => m[1]);

const schemes = grab(/android:scheme="([^"]+)"/g);
const hosts = grab(/android:host="([^"]+)"/g);
const prefixes = grab(/android:pathPrefix="([^"]+)"/g);
const patterns = grab(/android:pathPattern="([^"]+)"/g);
const uniq = (a) => [...new Set(a)].sort();

console.log(
  JSON.stringify(
    {
      intent_filters: (xml.match(/<intent-filter/g) || []).length,
      schemes: uniq(schemes),
      hosts: uniq(hosts),
      path_prefixes: uniq(prefixes),
      path_patterns: uniq(patterns),
    },
    null,
    1,
  ),
);
