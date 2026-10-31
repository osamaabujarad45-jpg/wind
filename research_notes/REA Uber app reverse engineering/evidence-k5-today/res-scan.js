const fs = require("fs");
const s = fs.readFileSync("apktool-out/res/values/strings.xml", "utf8");
const get = n => { const m = s.match(new RegExp('<string name="' + n + '">([^<]*)<')); return m ? m[1] : "NOT_FOUND"; };
for (const n of ["sso_third_party_scheme", "line_auth_scheme", "ub__fb_login_protocol_scheme", "app_name"]) console.log(n, "=", get(n));
const pats = {
  AIza: /AIza[0-9A-Za-z_\-]{20,}/g,
  AKIA: /AKIA[0-9A-Z]{16}/g,
  sk_live: /sk_live/g,
  begin_key: /-----BEGIN/g,
  ghp: /ghp_[0-9A-Za-z]{30,}/g,
  api_key_named: /api[_\-]?key/i,
  secret_named: /secret/i,
  bearer: /bearer /i,
  firebaseio: /https:\/\/[^"']*firebaseio/g,
};
console.log("total <string> entries:", (s.match(/<string /g) || []).length);
for (const [n, r] of Object.entries(pats)) console.log("pattern", n, ":", (s.match(r) || []).length, "matches");
