# Triage & validation record — findings registers of the Uber app reports

**Date:** 31 October 2026 · **Method:** the `triage-validation` 7-Question Gate + pre-severity gate + retraction discipline, applied to every security-relevant finding in the reports produced on 30–31 Oct. · **Evidence:** the 128 archived files under `research_notes/REA Uber app reverse engineering/` (manifest projection, decompiled-gate records, class census, export tables). · **Scope note:** this is a validation exercise over our own research artifacts; no request was sent to any Uber system during validation, and none is proposed outside the gated procedure below.

**Why validate:** the reports deliberately use cautious language ("candidate, not a confirmed vulnerability"). This record proves that caution is earned — and documents which claims were retracted along the way.

## 1. Verdicts summary

| # | Finding (as reported) | Verdict | Severity ceiling |
| --- | --- | --- | --- |
| F1 | Exported parameters-override receiver, no manifest permission, in-code gate defaults enabled | **NOT VALIDATED — killed as a submittable finding, retained as a research candidate** (Q6 fails) | none claimable today; "Info/candidate" at most |
| F2 | DeviceSessionsContentProvider exported without signature permission | **KILLED** — defended in code (Q1 fails at "result") | none |
| F3 | SSOContentProvider exported without signature permission | **KILLED** — same defense pattern; eligibility provider is a stub | none |
| F4 | `uber_performance_debug` scheme accepted by root activity in release | **DOWNGRADED to Info observation** (impact of the debug surface never established, Q6 fails) | Info |
| F5 | WhatsApp OTP receivers accept `com.whatsapp.otp.OTP_RETRIEVED` | **KILLED** — standard integration (Q5/Q7) | none |
| F6 | Payment-SDK activities exported (Adyen/PayPal/Venmo/UberPay) | **KILLED** — expected SDK pattern, host-bound (Q7) | none |
| — | 3 `AIza…` Google API keys in string resources | **KILLED** — client keys in mobile packages are known/expected; restricted via Google's console | none |
| — | Certificate-pinning configuration "not determined" | **N/A (studied absence)** — runtime property, static package contents cannot answer it | n/a |
| — | `libeef0.so` role unknown | **N/A (studied absence)** — registration-at-load-only exports; needs native-lane work on a Linux host | n/a |

**Net: zero submittable findings.** The reports' own framing ("candidate, not confirmed"; "not a finding") survives validation unchanged.

## 2. The 7-Question Gate on F1 (the only candidate) — in full

Claim under test: *"any app on the device can write server-parameter overrides in the Uber rider app via an exported broadcast receiver whose feature gate defaults to enabled."*

1. **Q1 — usable right now, step by step?** Steps 1–2 exist on paper: setup = any co-installed app, no account; request = the broadcast documented in the internal archive (`com.uber.parameters.cli` targeted at the exported receiver — manifest-verified: `exported="true"`, no `android:permission` attribute). **But step 3 (result) is conditional** — unknown namespace/key pairs return `PARAM_NOT_FOUND` and change nothing (evidence: `override-handler.json`) — and **step 4 (impact) is unestablished**: which catalogue parameters are security-relevant is server-side data we never enumerated. *Mechanically passable; impact-incomplete.*
2. **Q2 — on an accepted impact list?** Under Uber's authorized-disclosure scope ("securing user data and company assets"), a configuration broadcast whose security relevance is undemonstrated maps to the "negligible security impact" bucket the program publicly excludes. **FAIL** (as currently evidenced).
3. **Q3 — root cause in scope?** Yes — production rider app, first-party component. Pass.
4. **Q4 — privileged access?** No privilege needed beyond a co-installed app. Pass.
5. **Q5 — already known/accepted?** Unverifiable without program access; no public disclosure found during the study; treated as unknown, which cannot rescue Q2/Q6.
6. **Q6 — impact beyond "technically possible"?** **FAIL — this is the killer.** Nothing shows a parameter whose change produces a concrete, attacker-attainable outcome (no catalogue mapping, no test-account reproduction, no before/after behavior difference). "Technically possible" is exactly what we have.
7. **Q7 — known-invalid class?** "Exported component without permission" is not on the never-submit list by itself, but an absence-of-impact configuration finding is the shape the list exists to catch.

**Pre-severity gate on any draft claim:** the full chain (broadcast → catalogue hit → security-relevant parameter → observable behavior change) has **not** been reproduced even once — let alone twice — and the catalogue step is a server-controlled gate we cannot bypass by study. Therefore: no severity label above Info is claimable, and even Info requires the gated test-account phase first. **Killed as a submission; retained as a candidate with a documented next-step procedure** (internal archive only — never run against production or other users).

## 3. Killed findings — one-line kill reasons

- **F2/F3:** Q1 fails — the providers validate the calling package in code before serving (`ValidateAppForIPCUseCase` pattern, decompiled-gate evidence archived); no request returns data, so there is nothing to report. The allowlist's contents remain unknown (recorded as a studied absence, not a finding).
- **F4:** Q6 fails — "a debug scheme opens a debug surface" has no demonstrated consequence; downgraded to the Info observation the report already labels it.
- **F5/F6:** Q5/Q7 — standard, expected integration patterns (WhatsApp OTP autofill; payment-SDK exported activities). Reporting them would be the mobile equivalent of reporting an embedded client secret: known and accepted.
- **AIza keys:** Q7 — client keys in app resources are expected; the report already states "not a misconfiguration finding". Validation confirms.

## 4. N/A items (studied absences — informative, neutral)

Certificate-pinning configuration, `libeef0.so`'s purpose, the IPC allowlist contents, and the server-driven parameter catalogue are all recorded as **studied absences**: each was probed to the limit of static package inspection, the probe records are archived, and each has a documented next step (runtime lane / Linux host / Dagger-graph walk / gated program engagement). They are not findings and were never claimed as such.

## 5. Retraction appendix (methodological honesty record)

Retracted claims from earlier drafts, kept here per retraction discipline:

1. **"Google Maps is not embedded anywhere."** — Original signal: the map census found 492 first-party classes and no Mapbox/MapLibre. Disproving: the same census file contains **70 `com.google.android.gms.maps.*` classes** (`GoogleMap`, `MapView`, `StreetViewPanorama`) — the Play services Maps client is embedded. Root cause of the error: conflated "no third-party *rendering* SDK" with "no Google map code at all". Retracted 31 Oct; §1 of the maps report rewritten.
2. **"The app also requests background location."** — Disproving: zero occurrences of any background-location permission in the archived manifest (50-entry uses-permission list; foreground-only + `FOREGROUND_SERVICE_LOCATION`). Root cause: assumption imported from part 1's Fastship-side context instead of the manifest. Retracted 31 Oct; §4 corrected.
3. **"`eta` is the single largest first-party subsystem."** — Disproving: of 3,745 first-party matches, only 6 contain the literal token; the bulk is `Metadata`/`Details`/`Completable` substring collision. Root cause: reading a substring count as a semantic category. Retracted 31 Oct; the addendum table now says so.
4. **"We deliberately did not obtain the APK" (part-1 stance).** — Superseded (not disproven) by the owner-directed acquisition the next day; recorded as a scope change in part 2 §2, not an error.

## 6. Validation status of the shareable reports

Both knowledge files (`KNOWLEDGE-2026-10-31-uber-rider-app-facts.md`, `KNOWLEDGE-2026-10-31-uber-app-maps-and-location-facts.md`) carry the findings registers in deliberately neutral language. Validation verdict: **their language survives the 7-Question Gate exactly as written** — no overclaims, no severity inflation, no procedures, no submission-worthy assertions. They are safe to hand over as-is.
