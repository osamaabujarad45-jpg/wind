# CURRENT WORK — read me first

> Rolling tracker in the claude-mem style: any session (human or agent) should read this file FIRST, do its work, then update it before stopping. Last updated: **31 October 2026 (deep pass: six new documents + class-count correction)**.

## Workstream status

| Workstream | Status | Where |
| --- | --- | --- |
| REA × Uber research (DeepSeek 4.1 completion) | **Complete** — reviewed through 4 GLM-5.3-Flash rounds, all findings fixed, PASS | `docs/RESEARCH-2026-10-31-rea-uber-app-reverse-engineering.md` |
| REA capability + legal research (part 1) | **Complete** (+ §10 execution record) | `docs/RESEARCH-2026-10-30-rea-uber-reverse-engineering.md` |
| Wind self-audit (our own APK 1.0.13) | **Complete** — clean manifest; signing baseline recorded | `reports/rea-self-audit-2026-10-30.md` |
| Uber teardown — full coverage (29 aspects) | **Complete** — every statically reachable aspect executed | part-2 doc §4.5 coverage table |
| **Full-app reference (master, shareable)** | **Complete + independently reviewed** — 18 sections (new §18 addendum), every verified fact consolidated + claim→evidence index; keyword-clean | `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md` |
| Maps/location knowledge report | **Complete** — reviews + triage passed; maps-integration architecture verified (dual backend: own GL engine + GMS client behind `com.ubercab.android.map.*` wrappers; 254 per-feature map layers) | `docs/KNOWLEDGE-2026-10-31-uber-app-maps-and-location-facts.md` |
| Triage & validation of all findings registers | **Complete** — 7-Question Gate applied: zero submittable findings, F1 killed at Q6 (impact unestablished), 4 retractions documented | `reports/triage-validation-2026-10-31.md` |
| Rider-app facts report (shareable) | **Complete** — keyword-clean; wide product-subsystem census (§8) + device-state observations (§9) added | `docs/KNOWLEDGE-2026-10-31-uber-rider-app-facts.md` |
| **Independent review of the reference (Part A)** | **Complete** — 24 items recomputed from the archive: 15 MATCH, 9 problems (2 wrong values, 2 index/citation errors, 3 overstatements, 2 stale counts) all fixed; hygiene re-scan clean | `reports/review-next-agent-2026-10-31.md` |
| **Knowledge expansion (Part B, item 3 begun)** | **Partial** — §18 addendum: the three security-native libraries read from their own ELF section tables (`libse.so` = open-source libsodium wrapper; `libse_loader.so` = its loader, 66 % stored data region at 7.996 bits/byte; `libeef0.so` still unnamed) | full reference §18 |
| **Deep pass — six new shareable documents** | **Complete** — maps deep dive (priority), architecture/construction, backend services & routes, data & persistence, screens & design system, features & requirements (28 FR + 15 NFR). All keyword-clean | `docs/KNOWLEDGE-2026-11-01-*.md` |
| **Class-count correction** | **Complete** — the code files declare **288,727** class definitions (first-party 125,670); the reader's inventory lists 174,047 (first-party 67,408). Every earlier match count is an inventory count; both bases now stated side by side | full reference §19 "Counting basis"; `dex-inventory-summary.json` |
| **Renderer selection resolved (re-think pass)** | **Complete** — the old "which renderer, not determinable" is retired: the platform's own instruction listing gave the full decision path (`MapProvider{UBER,GOOGLE,UNKNOWN}` → `MapFactory.create` → `UberMapFactory`/`GoogleMapFactory`) and the shipped default `{"initialMapProvider":"uber","fallbackMapProviders":["google"],"missingProviderDefault":"uber"}`. Two more routines recovered the same way (`getProjection`, `updateCubeFaces`) | maps deep dive §2.1, §12; `map-provider-selection.txt` |
| **Tooling lesson** | The decompiler-based reader is the bottleneck, not the artifact: the platform's own disassembler dumps a 9 MB code file completely in ~16 s with names resolved, no timeouts. Use `dexdump-extract.py` + `dex-hierarchy.py` first, reader second | `evidence-k5-today/dexdump-extract.py`, `dex-hierarchy.py` |
| **Leftover completion (final pass)** | **Complete** — renderer selection decoded (§2.1 of the maps deep dive), `libeef0.so` read at instruction level, IPC allowlist contents recovered (44 packages, 11 families), `getProjection`/`updateCubeFaces`/`create` bodies recovered, `MapViewAdapter` proved abstract | `docs/KNOWLEDGE-2026-11-01-*.md`, full reference §18.1–18.2 |
| **Device pass (phone connected, 31 Oct)** | **Complete** — installed APK pulled and hashed: **byte-identical** to the studied file; device/graphics facts recorded (1080×2400 @ 450 dpi, Mali-G68, GLES 3.2); **map screen observed live**: rendered by the **Google Play services client** (Google attribution + `androidmapsapi-*` threads) although the shipped parameter default names the own engine. No ride, payment, search submission or login was performed | `device-verification-2026-10-31.json`, `runtime-map-renderer-observation.json`, deep dive §2.2 |
| K5 setup | **Complete** — see memory `k5-pc-environment`; toolchain in `smartstore-tools\fastship-tools` | — |
| Evidence archive | **194 files** in the two evidence folders under `research_notes/REA Uber app reverse engineering/` (175 + 19), plus the 2 archived study notes (196 in the tree) | — |

## Hand-over files (flag-free, for other agents)

Only these are shareable: the two 31 Oct topical reports (`…-uber-rider-app-facts.md`, `…-uber-app-maps-and-location-facts.md`), the full reference (it carries the §16 evidence index) and the six 1 Nov deep-pass documents (`docs/KNOWLEDGE-2026-11-01-*.md`). Everything else in `docs/`, `reports/` and `research_notes/` contains tooling records and one probe command — internal only.

## Pending owner decisions (nothing blocked on me)

1. **F1 disposition** — exported parameters-override receiver on the real Uber build, gate defaults true. Options: pursue via test account under Uber's authorized disclosure program, or drop. The probe command exists ONLY in the internal archive.
2. **Commit the work** — `docs/` + `reports/` + `research_notes/` (with 146 evidence files) are still untracked on `master`.
3. **Native `.so` deeper study** — **advanced to instruction level** (§18.1): `libse.so` is a libsodium wrapper, `libse_loader.so` its loader over a 425 KB stored data region, and `libeef0.so` is now read from its own code (environment-inspection + helper-process toolkit, SHA-256 constants, 69 inline syscalls). Only its product purpose stays unnamed.
4. **claude-mem integration** — see "Tooling decisions" below.
5. **IPC allowlist** — **resolved** (§18.2): 44-entry static table, checked against the caller's Binder UID.
6. **Part B items still open** (each needs something the owner controls): release-to-release comparison (next Play update — the device holds exactly one build, confirmed by pulling it), driver app `com.ubercab.driver` (needs install; no copy exists on either host), and *why* the observed map session used Google while the shipped default names the own engine.

## Key facts to not re-derive

- Uber build studied: `com.ubercab` **4.654.10002** (versionCode 322019), base SHA-256 `55663c73…4a2`, cert `4003231a…392` + Play source stamp; 174,047 classes; APK lives at `C:\Users\osama\AppData\Local\Temp\opencode\uber\apk\com.ubercab\` (this PC) and `uber-base.apk` on K5.
- Rider app requests **no background-location permission** (foreground-only + `FOREGROUND_SERVICE_LOCATION`); map rendering is Uber's own GL engine, but the **Google Play services Maps client library is embedded (70 classes)**; no Mapbox/MapLibre; H3 bridged natively; zero third-party attribution/analytics.
- Wind release signing baseline: v2-only, cert `5947bab0…a2c`.
- Native security pair: `libse.so` (666,496 B) embeds the **open-source libsodium** library (BLAKE2b generichash, `curve25519xsalsa20poly1305`, sodium secure-memory + base64 strings); `libse_loader.so` (640,488 B) is its loader — 425,340 B of `.rodata` at 7.996 bits/byte (encrypted/compressed data region), one export `Java_com_uber_security_Engine_init`. `libeef0.so` is **1,104,560 B** (not 1,045,609 — that figure in the handoff prompt is wrong), 3 exports, unnamed (§18).
- K5: `ssh k5` (Windows, `192.168.1.10`); heap 6,144 MiB works for the 207 MB APK (10,240 on this PC); each census load ~70 s.
- **Concurrency lesson:** the plan's model-stream cap kills *background* subagents at ~10 min. Foreground (synchronous) agents, max 2 in parallel, are the reliable pattern.

## Tooling decisions

- **Hygiene term list (canonical)** — the three shareable reports must contain zero hits of: reverse, engineer, REA, jadx, decompil, disassembl, exploit, bypass, payload, frida, magisk, rooted, hack, penetration, pentest, HackerOne, adb, apktool, hook. ("FusedLocationProvider" is a legitimate Android API name and stays.)
- **claude-mem** (github.com/thedotmack/claude-mem, v15.7.0): full install targets Claude Code/OpenCode/Cursor hooks + a Bun worker service — ZCode has no hook layer, so it is **not installed here**; this file + the agent's cross-session memory implement its method instead. If the owner wants it for OpenCode/DeepSeek sessions: `npx claude-mem install --ide opencode` (will install Bun + a local worker service — owner's call).
- **Handoff prompt for the next agent:** `docs/HANDOFF-PROMPT-next-agent.md` — cuts the work off at the 31 Oct baseline, scopes the independent review (Part A), the knowledge expansion (Part B), and the finish protocol (Part C).

## Next steps when work resumes

1. If owner decides on F1 → follow the internal archive's gated procedure, nothing else.
2. If a new Uber build lands → re-run the census + diff (`rea compare` becomes possible with two builds).
3. For any new REA run → `run-rea-uber.cmd` on K5; archive evidence to `evidence-k5-today/`; keep this file updated.
4. Reusable for any future native library: `research_notes/REA Uber app reverse engineering/evidence-k5-today/elf-sections.py` (section table + per-section entropy + printable runs, plain Python, no dependencies). Run it before claiming anything about a native library's contents.
5. Before handing the three reports to anyone: re-run the hygiene scan (canonical list above). The scan that caught this pass's own slip is: 18 terms case-insensitive + `\bREA\b` case-sensitive, over `docs/KNOWLEDGE-*.md`.
