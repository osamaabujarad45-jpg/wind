# DRIVER-SIDE RESEARCH PLAN — the biggest hole in the corpus

**Status:** Play artifacts acquired and verified; manifest/resource study completed in `research_notes/REA-2026-11-13-reference-apps/HAAT-DRIVER.md`. No JADX/REA pass or competitor runtime was performed.
**Why it exists:** **[read]** `research_notes/REA-2026-11-13-reference-apps/CAREEM.md:229-243` contains the
first driver-side study, Careem Captain. **[read]** `HAAT-DRIVER.md` now supplies a second, local driver-side
artifact study. Server behavior, exact state transitions, queue ordering, custody scanning, and cash variance
remain **[U]**; the resource study closes only the gaps it directly evidences.

**Related:** `2026-11-13-haat-gap-research.md` is a supplementary planning brief; it does not contain a
driver-artifact plan.

---

## 1. What is missing, concretely

| Question the plan must answer | Currently answered by | Confidence |
|---|---|---|
| How does a driver actually receive and accept work? | **[read]** `CAREEM.md:286-293` and `HAAT-DRIVER.md` §2.2 observe acceptance/rejection and timed-rejection resources; the complete offer lifecycle remains **[U]** | partial; static only |
| Is there a shift, a queue, or neither? | **[read]** `CAREEM.md:286-293` and `HAAT-DRIVER.md` §2.1 confirm registered shifts; queue ordering remains **[U]** | shift confirmed statically |
| Who scans what, and when does custody change? | **[read]** `HAAT-DRIVER.md` §2.3 finds pickup-code/collection resources, not a scan requirement or per-parcel ledger | **[U]** |
| How is cash handed over and closed? | **[read]** `CAREEM.md:267-284` and `HAAT-DRIVER.md` §2.4 observe debt/balance/history surfaces; close, variance and settlement timing remain **[U]** | partial |
| What does a driver see about earnings before/after a shift? | **[read]** `CAREEM.md:245-265` and `HAAT-DRIVER.md` §2.4 supply earnings taxonomies, not a verified before/after-shift workflow | partial; static only |
| How does a driver refuse work, and what is recorded? | **[read]** `HAAT-DRIVER.md` §2.2 observes confirmation, reason, auto-reject and rejection-limit resources; persisted records remain **[U]** | partial; static only |

`A5` (shift + job board) and `A11` (collected-amount variance) in the gap backlog are the plan's real
customers. **[read]** `CAREEM.md:245-293` provides a partial Careem benchmark; the HAAT/local driver-side
benchmark and server behavior remain **[U]**.

## 2. Candidate artifacts

**Identity must be established before any analysis, not assumed.** **[read]** the competitor index at
`PALESTINIAN-COMPETITORS-INDEX.md:219-221` and `HAAT.md:38` record `com.haat.haatdriver` and
`com.haat.courier`; a later pass referred to `com.haaddriver` / `com.haatcourier`. Neither pair is verified
against a downloaded artifact. Settle it from the public listing and APK manifest (`aapt2 dump badging`)
before writing a finding.

| Candidate | Role it would fill | Notes |
|---|---|---|
| HAAT driver app | Palestinian-scale, Arabic-first, cash — the closest analogue to Wind | **Verified Play artifact:** `com.haat.haatdriver` 9.72(132), three splits, hashes/signature in `HAAT-DRIVER.md` §1 |
| HAAT courier app | Separate courier role with additional collection/rejection surfaces | **Verified Play artifact:** `com.haat.courier` 1.1.1(8), three splits, hashes/signature in `HAAT-DRIVER.md` §1 |
| Careem Captain (`com.careem.adma`) | **Already studied** in `CAREEM.md` §10 — the only driver-side study we have | Re-read before commissioning new work |
| Souq Tulkarm driver surface | Customer app contains the driver JS in the same bundle (`SOUQ-TULKARM.md` F-04) | Partially covered; a dedicated pass would separate the roles |

**Do the cheapest thing first:** **[read]** `CAREEM.md:245-293` already covers earnings taxonomy,
cash-debt wording and shift/acceptance mechanics. Reuse those findings; do not treat them as HAAT evidence.

### 2.1 Acquisition, provenance and split-APK integrity

**Current state: VERIFIED for Play provenance and resource evidence.** **[ran]** Both apps were installed from
official Play listings, pulled without launching, and inspected with `aapt2`/`apksigner`. Driver is 9.72(132);
Courier is **1.1.1(8)**, superseding the older 1.1.0 note and 1.0.0 mirror. **[read]** `HAAT-DRIVER.md` §1
records all six split-file hashes and both signer/source-stamp identities. Exact server behavior remains **[U]**.

1. Resolve the official public listing before downloading. Candidate URLs derived from the existing notes are
   `https://play.google.com/store/apps/details?id=com.haat.haatdriver` and
   `https://play.google.com/store/apps/details?id=com.haat.courier`. The alternative spellings in §2 remain
   **[U]** until a listing and the base-APK manifest agree.
2. Record retrieval timestamp, final listing/download URL, distributor, displayed versionName/versionCode,
   every filename and byte size. Prefer the official public distribution; if another public artifact source is
   used, label its distributor separately rather than calling it a Play artifact.
3. Preserve the base APK and every split unchanged. Record SHA-256 and signer certificate for each artifact;
   never identify a build from its filename alone.
4. Treat a split set as one build but not as one file: identify the base with `aapt2 dump badging`, enumerate
   all DEX files across the set, inspect architecture/language/density splits separately, and do not claim a
   complete class/resource census from the base alone. Do not merge, rename, or modify splits; if a tool requires
   a transformed copy, record the exact transformation and hash both input and output.
5. Write an evidence manifest before findings: package/version, artifact paths, sizes, SHA-256 values,
   signer-certificate digests, source URLs, acquisition time, tool versions, commands, and output anchors.
   Any missing field stays **[U]**.

The following identity/provenance commands **were run**; REA/JADX commands in §3 remain planned:

```powershell
Get-FileHash -Algorithm SHA256 <apk>
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt2.exe" dump badging <base.apk>
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt2.exe" dump permissions <base.apk>
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\apksigner.bat" verify --print-certs <apk>
```

## 3. Method — the commands that already exist

**[read]** `research_notes/REA-2026-11-13-reference-apps/PALESTINIAN-COMPETITORS-INDEX.md:259-281`
records the environment and exact `rea` invocations. Reuse them rather than inventing a new pipeline:

```powershell
rea inspect-android-package <apk> --format json --full-output
rea search-android-classes  <apk> <query> --format json --full-output
rea inspect-android-class    <apk> <class> --format json --full-output
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt2.exe" dump resources <apk>
```

**[read]** `PALESTINIAN-COMPETITORS-INDEX.md:241-243` records that `rea decode-android-resources` was
unusable because apktool was absent (use `aapt2`). **[read]** `UBER-4.655-rider.md:60` records that
`rea inspect-signature` is macOS-only (use `apksigner`).

## 4. Labelling — use the convention that already works

`UBER-4.655-rider.md` §0.1 defines four labels, and every finding here must carry one: **`[O]`**
observed in a tool output with a cited anchor, **`[I]`** inference from observed structure, **`[U]`**
not establishable from the artifact, **`[D]`** derived representation (decompiled method, never
"original source"). A finding without a label is a defect.

## 5. What counts as answered

A question in §1 is answered only when it has `[O]` evidence plus a cited anchor, **or** an explicit
`[U]` stating what artifact would be required. Three outcomes are explicitly *not* answers:

- "The customer app implies…" — that is the gap this plan exists to close.
- A screen description without the state vocabulary behind it.
- An API shape inferred from a class name.

## 6. Lawful boundary — non-negotiable

Publicly distributed artifacts, static analysis only. **No** contacting any competitor system, **no**
credential use or reuse, **no** circumventing authentication, rate limits, obfuscation or bot
protection, **no** copying code, assets, icons, copy text or string sets into this repository. Findings
are short identifiers, field names and status tokens quoted as evidence — the same discipline the
existing eight studies follow, stated in the index at lines 291-294.

## 7. Order

1. **Completed:** existing Careem findings are reflected in §1.
2. **Completed:** official Play identities were resolved and confirmed against each base-APK manifest.
3. **Completed:** all three splits per package were acquired, hashed, signer-verified and inventoried.
4. **Completed at resource level:** shift / offer / custody / earnings vocabulary is recorded in
   `HAAT-DRIVER.md` §2–3. Queue algorithms, exact state transitions and server invariants remain **[U]**.
5. **Completed:** `HAAT-DRIVER.md` is written with `[O]`/`[I]`/`[U]` labels.
6. **Backlog linkage:** A5 and A11 now point to that study. Do not size scanning or variance work until
   a later static/runtime pass establishes the missing contract.

## 8. What this plan deliberately does not do

It does not estimate A5 or A11. Those estimates are guesswork until step 4 produces a real driver-side
state vocabulary; sizing them now would bake the customer-side assumption into the plan.
