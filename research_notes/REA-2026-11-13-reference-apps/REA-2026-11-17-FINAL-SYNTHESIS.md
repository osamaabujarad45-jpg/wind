# REA 2026-11-17 — Final synthesis: wind-comp verification + driver-side pass

**Date:** 17 November 2026 · **Method:** lawful static analysis only (github.com/morluto/rea
DISCLAIMER): artifacts already on this machine / owner's phone, no app launches of competitor
apps, no competitor server contact, no auth bypass, no dynamic instrumentation. Patterns and
short identifiers only as evidence; no proprietary code/assets copied; no secrets recorded.
Labels: **[O]** observed · **[I]** inference · **[U]** not established · **[D]** derived ·
**[ran]** command run this session · **[read]** file read.

## 0. Tooling state (this session, [ran])

- `rea update` moved the global install rea-agents 6.7.0 → **6.9.0** (npm latest, matches
  github.com/morluto/rea). The PATH `rea` then refused to run: engine check requires Node
  ≥ 24.22.1, machine has 24.12.0. Fix: Node **v24.22.3** installed at
  `C:\Users\osama\AppData\Local\Temp\opencode\node24` and wrapper
  `C:\Users\osama\AppData\Local\Temp\opencode\rea24.cmd`. Smoke test passed:
  `rea24 --version` → 6.9.0; `inspect-android-package` and `search-android-classes` on
  `WindRide-1.0.0.apk` → exit 0. jadx env per index §6 (`REA_JADX_MCP_JAR` 0.7.1 jar,
  Temurin 17, heap 8192 MiB, op timeout 900 s).
- Multiagent execution: two subagents on the NVIDIA pool, model
  `nvidia-pool/nemotron-3-ultra-550b-a55b#max` (`reasoning_effort: "max"` added to the model
  entry + `#max` variant in `opencode.json`; pool probe confirmed `max` accepted with tools):
  - W2 `ses_e18fa3608ffes14aSJWA472dZy` — wind-comp APK verification + parity matrix.
  - W3 `ses_e18fa3604ffexNlR7TqA1BUvb1` — driver-side class-level static pass.

## 1. W2 — the five wind-comp apps meet the real apps ([O] unless noted)

Full report: `C:\Users\osama\OneDrive\Documents\wind-competitors\REA-VERIFY-2026-11-17.md`;
ledger section appended to `wind-competitors\LEDGER.md` ("2026-11-17 REA verification").
Independent re-measurement of all 6 APK SHA-256 values by the lead matched the report exactly.

- **Integrity/signing:** 6/6 APKs match recorded hashes; `apksigner` v2=true and single cert
  SHA-1 `57:AF:6D:DB:35:87:C5:7E:77:E1:17:B9:42:6F:C4:A3:2E:F9:45:2F` on all 6. Hash
  discrepancy resolved: LEDGER's 11-16 "current" table held the **before-rolefix** Captain
  hash `2BEFD81D…`; current Captain is `CFD49B7C…`; both files coexist and are valid.
- **Manifest:** all `com.windcomp.*` 1.0.0, `allowBackup=false`, `usesCleartextTraffic=false`,
  no `RECORD_AUDIO`, Maps meta-data present.
- **Maps key containment:** zero `AIza` hits in all five source trees; embedded key matches
  `C:\b\maps-key.txt` (recorded only as SHA-256
  `1041E21A63812262EDBDC73DBBA857E1BC14B349BB3259B6435C9EF0E5DBA1BA` — the literal value was
  redacted from both docs after review).
- **Rules:** 58/58 expected bundle/source rule hits found in the correct apps (27 further cells
  are "not in this app" by design); Captain role-fix proven (`domain.ts:130` no-op,
  focus re-assert in `index.tsx`/`captain.tsx`, distinct APK hashes before/after).
- **Parity matrix:** 12 core slices + 5 optional patterns vs UBER-4.655-rider / CAREEM / HAAT /
  SHIPLY / SOUQ-TULKARM studies → **58/60 ✅, 2 ⚠️** (Shiply QR-vs-code for delivery proof;
  Careem map-interface vs direct wrapper — different mechanism, same intent), **25/25 optional
  ✅**. Verdict: every slice has a proven Wind implementation and a proven real-app counterpart.

## 2. W3 — driver-side gap closed (statically)

Full report: `DRIVER-SIDE-REA-2026-11-17.md` (this folder); appends in `HAAT-DRIVER.md` §10.7,
`CAREEM.md` §10.6–10.7; index §5 updated. Raw evidence: 190 JSON outputs under
`C:\Users\osama\AppData\Local\Temp\opencode\rea-work-20261117\` (110 haat*, 42 careem*).

- Artifacts: `com.haat.haatdriver` 9.72(132), `com.haat.courier` 1.1.1(8),
  `com.careem.adma` 89.70.2(89702), each with base-APK SHA-256 recorded; 60,549 classes loaded
  for adma; 48 adma + 9 haatdriver + 6 courier class inspections.
- Answered with [O]: step-based job workflow (Careem), booked shifts + HDL driver-pull queue,
  customer PIN at pickup (`CollectOrderWithPinRequest.pin`), typed cash collection with receipt
  + standing float with auto-block, line-item earnings taxonomy (`money_in`/`money_out`), typed
  cancellation policy, HAAT Courier daily/shift rejection limits, foreground location + async
  push worker.
- Index §5: **gap 2 (no driver-side artifact) CLOSED** for all three artifacts.
- Remains **[U]** by method (static cannot establish): gap 5 server behavior, gap 9 competitor
  economics, queue ordering/dispatch algorithm, settlement timing, PIN server-validation.

## 3. Proven blocked items (exact owner step + verifying command)

1. **Map tiles blank in all 5 wind-comp apps** — key's Cloud project has "Maps SDK for Android"
   disabled (403 "This API is not activated on your API project"; no gcloud/credentials here,
   [ran] probe recorded in LEDGER). Owner step: Google Cloud Console → enable Maps SDK for
   Android on the project owning `C:\b\maps-key.txt`; add Android-app restrictions for the 5
   `com.windcomp.*` packages + SHA-1 `57:AF:…:45:2F`. Verify: reopen any app on `R5CTB0FJP9Z`,
   tiles render and logcat no longer shows the Authorization failure line. No rebuild needed.
2. **`scripts/selfcheck.mjs` not re-run locally** — no `node_modules` in the five trees, and the
   `k5` SSH keys are refused (`Permission denied (publickey)`, per AGENTS.md 2026-10-29).
   LEDGER §47 records pass on k5 2026-11-16 [read] → **[U]** locally. Verify: with deps
   installed, `node scripts\selfcheck.mjs` in each `wind-comp-*` tree (expect pass), or re-run
   on k5 once the owner supplies the authorized key.
3. **PATH `rea` unusable on system Node** — engine floor ≥ 24.22.1 vs installed 24.12.0.
   Workaround in place: `rea24.cmd` wrapper [ran, verified]. Owner step if a bare `rea` is
   wanted: install Node ≥ 24.22.1 system-wide; verify with `node --version` and `rea --version`.

## 4. Hygiene / secret scan (this session, [ran])

- `AIzaSy` → **zero hits** across `wind-competitors\` and `research_notes\` after redacting the
  Maps key literal from `REA-VERIFY-2026-11-17.md` (3 spots) and `LEDGER.md` (1 spot); the
  SHA-256 above is the recorded reference instead.
- No keystore passwords, tokens, or credential values in any file written today (grep for
  password/secret/private-key patterns: no value hits).
- `docs\KNOWLEDGE-*.md` untouched this session; new/edited files live in `research_notes\` and
  `wind-competitors\` only. No Fastship product code changed; no git commits or pushes made.

## 5. Files written/edited today

| File | Change |
|---|---|
| `wind-competitors\REA-VERIFY-2026-11-17.md` | new — W2 full verification report |
| `wind-competitors\LEDGER.md` | appended 2026-11-17 verification section + corrected current hashes (key redacted) |
| `research_notes\...\DRIVER-SIDE-REA-2026-11-17.md` | new — W3 cross-artifact driver-side report |
| `research_notes\...\HAAT-DRIVER.md` | appended §10.7 class-level pass |
| `research_notes\...\CAREEM.md` | appended §10.6–10.7 |
| `research_notes\...\PALESTINIAN-COMPETITORS-INDEX.md` | §5 gap-2 closure note |
| `research_notes\...\REA-2026-11-17-FINAL-SYNTHESIS.md` | this file |
| `~/.config\opencode\opencode.json` | nemotron-3-ultra-550b-a55b: `body.reasoning_effort=max` + `#max`/`#high` variants (JSON validated) |
| `Temp\opencode\rea24.cmd`, `node24\` | rea 6.9.0 wrapper + Node 24.22.3 |

## 6. Bottom line

All five Wind competitor apps are verified against their signed APKs, source rules, and the
five real-app studies — the 12-slice copy plan is met (2 slices intentionally differ in mechanism).
The driver-side reference gap is closed statically for Careem Captain, HAAT Driver, HAAT Courier.
Only owner-side items remain: the Google Cloud Maps enablement (§3.1), an optional local
selfcheck re-run (§3.2), and optionally a system Node upgrade for a bare `rea` (§3.3). Server-side
behavior of competitors stays **[U]** — it cannot be established by static analysis and was not
claimed anywhere.
