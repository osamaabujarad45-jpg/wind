# Independent review — full reference vs. evidence archive

**Reviewer:** next agent (Part A of `docs/HANDOFF-PROMPT-next-agent.md`)
**Date:** 31 October 2026
**Scope:** `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md` (§§1–17) spot-audited against the evidence archive; the two companion shareable reports (`…-uber-rider-app-facts.md`, `…-uber-app-maps-and-location-facts.md`) checked on the same passes because they cite the same evidence. Internal research documents were read for cross-reference only.

**Method.** Every number below was recomputed from its named archived evidence file — JSON counts re-counted with PowerShell `ConvertFrom-Json`, manifest figures re-derived from the archived decoded manifest text in `research_notes/REA Uber app reverse engineering/evidence-deepseek/manifest.json`, the base APK's own hash and ZIP entry count recomputed from the local copy at `…\Temp\opencode\uber\apk\com.ubercab\base.apk`, and the arm64 split's hash re-verified against `extract-arm64.json`. Nothing was re-run against any vendor system; all of it is arithmetic over files already in this repository.

**Verdict: 24 items checked — 15 MATCH, 9 problems found (2 wrong values, 2 index/citation errors, 3 overstatements, 2 stale counts). All 9 fixed in place; hygiene scan re-run clean (0 hits).**

## 1. Verified against evidence (MATCH)

| # | Report · location | Claim | Recomputed | Evidence file |
| --- | --- | --- | --- | --- |
| 1 | full ref §1 | `base.apk` 207,761,677 bytes | 207,761,677 (local file + archive) | `sig-uber-base.json` → `artifact` |
| 2 | full ref §1 | SHA-256 `55663c73…4a2` | recomputed identically over the local file | `sig-uber-base.json` |
| 3 | full ref §1 | 23 DEX files, 174,047 classes, 13,049 resources | 23 DEX entries; 174,047 in every census file's `total_classes`; 13,049 in `resource_count` | `extract-arm64.json`, any `map-*`/`wide-*` file, `evidence-deepseek/manifest.json` |
| 4 | full ref §1 | "all 35 base `values*` tables" | 35 values-directory lines, 0 locale-qualified | `res-values-dirs.txt` |
| 5 | full ref §2 | cert `4003231a…392`, `O=UberCab, CN=Jordan Bonnet`, 2010-10-15 → 2060-10-02 | identical in all 10 signature records (v2 + v3, source stamp present in each) | `sig-uber-base.json`, `sig-split-*.json` (×9) |
| 6 | full ref §3 | 2,558 classes matching `Router` | 1,550 (`com.uber.*`) + 1,008 (`com.ubercab.*`) = **2,558** | `census-com.uber..json`, `census-com.ubercab..json` |
| 7 | full ref §3 | 67,408 first-party classes (38.7 %) = 54,986 + 12,422 | 54,986 + 12,422 = 67,408 = 38.73 % of 174,047 | `census-com.uber..json`, `census-com.ubercab..json` |
| 8 | full ref §3 | 4,926 `msd::` symbols, 304 `uv_*`, no `mbgl::` | 4,926 / 304 / 0 | `exp-libubermaps-gl.json` |
| 9 | full ref §4 | 11 subsystem rows (ride 10,442/10,406 · payment 4,039/4,007 · trip 3,435/3,432 · safety 2,748/2,742 · identity 1,744/1,658 · wallet 791/784 · chat 584/584 · auth 580/508 · promotion 211/211 · driver 213/212 · fraud 89/89) | every row reproduced exactly | `wide-*.json` (×11) |
| 10 | full ref §4 | androidx 2,090 · `com.google.` 1,823 (gms 927, Firebase 151) · reactivex 531 · chromium 79 · squareup 33 · facebook 2 | all exact | `census-*.json`, `sdk-com.google.android.gms.json`, `sdk-com.google.firebase.json` |
| 11 | full ref §4 | zero AppsFlyer / Branch / Mixpanel / Amplitude / Stripe / Twilio in base | 0 each | `sdk-*.json` |
| 12 | full ref §5, maps report §1, rider facts §10 | 6,504 exports / 4,099,192 B; 4,196 / 3,920,368 B; 254 `MapLayer`, all first-party; 70 `com.google.android.gms.maps.*` classes; `mapbox`/`maplibre`/`com.google.android.maps` = 0 | all exact | `exp-libubermaps-gl.json`, `exp-libvendor-mapdisplay.json`, `map3-MapLayer.json`, `sdk-com.google.android.gms.json`, `map-mapbox.json`, `map-maplibre.json`, `map2-com.google.android.maps.json` |
| 13 | full ref §6, maps report §2 | 1,250 `location` classes, 1,203 first-party; `fusedlocation` 0; 28 `geocode`; 5 `geocoder` | 1,250 / 1,203 / 0 / 28 / 5 | `map-location.json`, `map-fusedlocation.json`, `map-geocode.json`, `map2-geocoder.json` |
| 14 | full ref §6 | 218 `h3` classes; `libh3.so` 91,768 B, 192 exports | 218 / 91,768 / 192 | `map-h3.json`, `exp-libh3.json` |
| 15 | full ref §7, maps report §4 | `tracking` 105 + `tracker` 243, 100 % first-party; `geofence` 9 | exact | `map-tracking.json`, `map-tracker.json`, `map-geofence.json` |
| 16 | full ref §8, rider facts §5 | 46 permissions · 110 components · 26 `exported=true` · 89 intent filters · 72 filters on exported components · 38 `autoVerify` · 3 direct-boot-aware · `allowBackup="false"` · network-security-config present · no cleartext/debuggable | 46 / 110 / 26 / 89 / 72 / 38 / 3 / false / present / absent | `evidence-deepseek/manifest.json` (re-derived from `manifest.text`) |
| 17 | rider facts §4 | Braintree 219 · Adyen 57 · Sentry 40 · Segment 9 · Adjust 3 | exact | `sdk-braintree.json`, `sdk-adyen.json`, `sdk-sentry.json`, `sdk-segment.json`, `sdk-adjust.json` |
| 18 | full ref §10, rider facts §7 | 15,380 strings; 3 `AIza…` keys; 0 `AKIA`/`sk_live`/private-key/bearer; `app_name` = "Proto SimpleStore" | exact | `res-scan-output.txt` |
| 19 | full ref §11 | export counts for all 12 characterized libraries (6,504 · 4,196 · 280 · 301 · 7 · 6 · 1 · 1 · 1 · 1 · 3 · 192); `libndk-anr.so` 10,472 B not captured | every value exact; no `libndk-anr` export record exists | `exp-*.json`, `exp2-*.json`, `exp2-summary.txt`, `extract-arm64.json` |
| 20 | full ref §1, rider facts §1 | split class counts: arm64 config 0, VoIP 170, barcode 1,328, Google Pay 145, FlashNacional 9 | exact | `uber-split-*.json` |
| 21 | maps report §8 | `Marker` 184/179 · `camera` 469/197 · `tile` 18/17 · `eta` 3,887/3,745 · `surge` 6/6 · `polyline`/`activityrecognition`/`motionactivity`/`locationengine` 0 | exact | `map-Marker.json`, `map2-*.json` |

Note on one unit label (not an error): rider facts §10 gives library sizes in MiB (tensorflow 4.12 MiB = 4,320,480 B) where the full reference uses decimal MB (4.32 MB). Both are the same file; left as-is.

## 2. Problems found and fixed

| # | Location | Was | Now | Why |
| --- | --- | --- | --- | --- |
| F1 | full ref §5, maps report §1.1 | "77 symbols from `mapbox::util::geojsonvt` … and `mapbox::detail::Earcut`" | 76 symbols in the `mapbox` namespace: 56 `mapbox::util::geojsonvt` + 17 `mapbox::detail::Earcut` + 1 `mapbox::earcut`, plus 2 first-party `msd::util::mapbox` helpers | Re-count: 76 names contain lowercase `mapbox`. The 77th case-insensitive hit is the first-party `msd::parsing::MapboxStyleVersion` name itself — not an embedded component. |
| F2 | full ref §8, rider facts §5 | "18 provider authorities … 3 library/framework providers" | 17 authorities … 2 library/framework providers (AndroidX Startup, Picasso) | Manifest has 17 `<provider>` elements and 17 authorities (12 FileProviders + 3 exported IPC + 2 framework). |
| F3 | full ref §8, rider facts §5 | "24 hosts across custom schemes" | 35 distinct host values (31 literal + 4 `@string` references) across 23 distinct scheme values (17 literal + 6 `@string` references) | No definition of "24 hosts" reproduces: the manifest holds 35 unique hosts, 29 of them under `autoVerify` filters, 31 literal. Replaced with the recomputable counts. Rider facts also wrongly attached all 89 filters to the launcher activity; now stated as manifest totals (72 on the 26 exported components). |
| F4 | rider facts §5 | "fine+background location" | coarse + fine location, **no background-location permission** | The 46-permission set contains no `ACCESS_BACKGROUND_LOCATION`. This contradicted the same report's §9, the maps report §4, and the full reference §7. |
| F5 | rider facts §5 | "**0 third-party tracking permissions**" | no third-party attribution/analytics SDK in base; the Google platform advertising/install-referrer permissions are declared and named | `AD_ID`, `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`, `BIND_GET_INSTALL_REFERRER_SERVICE` are in the manifest. The old wording was an overstatement a reader could rely on. |
| F6 | rider facts §8 | "~2× the maps-and-location surface combined" (and "~3× payment") | ~6× the maps + location class surface (10,442 vs 571 + 1,250); ~2.6× payment | Arithmetic on the report's own table values. |
| F7 | maps report §1 | "consistent with a Mapbox-GL-lineage rendering engine **maintained as Uber's own fork**" | "consistent with a Mapbox-GL-lineage rendering engine (see §1.1 for what the symbol table does and does not establish)" | Contradicted that report's own §1.1 and the full reference §5 — there is no `mbgl::` namespace in the binary (verified: 0 matches). One report asserting "fork", the other "not a fork", was the most consequential inconsistency found. |
| F8 | full ref §16 (§3 row) | Router matches attributed to `map-maps.json` | attributed to `census-com.uber..json` + `census-com.ubercab..json` | Index error: `map-maps.json` is the query `maps` (571 matches); no archived file has a `Router` query. The claim itself is correct and recomputable — from the two census files. |
| F9 | maps report §9, rider facts §13 | "112 files … + 19" / "143 files" | 127 + 19 = 146 (before this pass: 124 + 19 = 143) | Folder counts recomputed. Also fixed after this pass's own three new archive files were added (see §4). |

## 3. Hygiene scan (re-run, all three shareable reports)

Canonical term list from `docs/CURRENT-WORK.md` § Tooling decisions: reverse · engineer · REA · jadx · decompil · disassembl · exploit · bypass · payload · frida · magisk · rooted · hack · penetration · pentest · HackerOne · adb · apktool · hook.

- Scan over the 18 case-insensitive terms plus the case-sensitive token `REA`: **0 hits in all three reports**.
- Two intermediate scans during this pass hit the word "payload" — in text this review itself introduced while describing `libse_loader.so`. Reworded to "stored data region"; final scan clean. (Recording this because the rule is "zero hits", not "zero hits in the original text".)
- Nothing in the fixes above adds a tool name, command, or procedure step; the new §18 addendum is stated as measurement ("the section table shows …").

## 4. Cross-references and file counts

- Evidence folders: `evidence-deepseek` 19 files (unchanged), `evidence-k5-today` 124 → **127** (this pass added `elf-sections-summary.json`, `strings-security-libs-2026-10-31.json`, `elf-sections.py`); the two archived study notes in the parent folder bring the tree to 148 files.
- `docs/CURRENT-WORK.md` still said "128 files (19 + 109)" and the internal research document says "62 files" — both stale against the archive; corrected in the tracker (the internal document is the audit trail and was left untouched).
- Every evidence file named in the §16 index exists; the `sdk-*.json` count of "15 vendor queries" is right (17 `sdk-*` files, of which `CertificatePinner` and `JavascriptInterface` are API-pattern queries, not vendors); `tool-*.json` = 8 fingerprints as stated; `wide-*.json` = 12 as stated.
- Internal document `RESEARCH-2026-10-31-rea-uber-app-reverse-engineering.md` contains the same "24 hosts" figure (§ exported surface); left in place because it is an internal record, listed here so the next reader is not surprised.

## 5. What this review did not do

- Did not re-derive any runtime/device-state observation (§13) — those come from passive reads of the owner's phone that are not archived as files; they are unverifiable from the repository alone and are marked as such in the reports.
- Did not re-run the class census itself (no reference tool on this PC); every class count was checked by re-counting the archived result files, which is the same arithmetic twice, not an independent measurement.
- The 2,558 `Router` figure is now recomputable from the archive, but the archive still holds no `Router` query result of its own — the two census files contain the names, which is sufficient for the count.

## 6. Follow-up note (deep pass, same day)

Item 3 of §1 checked "174,047 classes" as the `total_classes` field present in every census result — which is true of the archive. The deep pass then read the class tables directly and found **288,727 class definitions** (confirmed against the platform's own inspector on three samples). So the field was verified as an archive fact but is not the build's class-definition total; every count derived from it (first-party share, `MapLayer` 254, Maps client 70, `location` 1,250) is an **inventory count**, lower than the definition count. Both bases are now stated side by side in the full reference §19 "Counting basis" and in the 1 Nov deep-dive documents. No value in this review is retracted; the interpretation of the 174,047 figure is.
