# Handoff prompt — paste this to the next AI agent

Work up to 31 October 2026 is **baselined and closed**: do not redo it, do not rewrite it. Your job starts at "YOUR TASK" below. Everything you need is in this repository.

## Context (read first, in this order)

1. `docs/CURRENT-WORK.md` — the rolling tracker: workstream statuses, pending owner decisions, key facts, tooling notes.
2. The three shareable knowledge reports (all keyword-clean, all evidence-anchored):
   - `docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md` — the consolidated full-app reference (17 sections + claim→evidence index).
   - `docs/KNOWLEDGE-2026-10-31-uber-rider-app-facts.md` — topical: build, vendors, subsystems, device state.
   - `docs/KNOWLEDGE-2026-10-31-uber-app-maps-and-location-facts.md` — topical: maps, location, tracking.
3. `reports/triage-validation-2026-10-31.md` — the validation record: every security-relevant observation was put through a formal 7-question gate on 31 Oct; **zero reportable findings**; 4 retractions documented. Do not re-litigate these verdicts without new evidence.
4. Evidence archive: 143 files under `research_notes/` in two dated folders (124 from the 31 Oct study, 19 earlier). The full reference's §16 maps each report section to its evidence files.
5. Internal docs (the two dated internal research documents in `docs/` and the self-audit report in `reports/`) are the audit trail — internal only, never hand them to third parties, never copy their procedure content into shareable files.

## Hard rules (non-negotiable)

- **Language:** the three shareable reports must stay free of flag-prone terminology (no references to the study method, no tool names, no commands, no procedures). Write everything as verified knowledge: "the package contains X", "the export table shows Y". Before finishing, re-run the hygiene scan: the canonical term list is in `docs/CURRENT-WORK.md` (§ Tooling decisions) — zero hits is the bar.
- **No live interaction with the vendor's systems, ever.** No requests to production services, no scripted traffic, no intercepting anything. The only permitted runtime observation is passive use of the app on the owner's own test device with the owner watching — and any account-affecting UI action (dialogs, forms, logins) is forbidden unless the owner performs it themselves.
- **F1 stays closed** (the exported parameters-override component): killed at the impact question by the validation record; the probe procedure exists only in the internal archive and requires the owner's separate decision plus the vendor's authorized disclosure program. Do not execute, refine, or move it.
- **Every new claim needs an archived evidence file.** Save raw tool output as JSON/text into the evidence folder, then cite it. No claim without a file.
- **One statement style:** if something is not determined, write "not determined" with the reason. Never guess, never inflate. (The existing reports retracted 4 claims for exactly this failure — keep the standard.)

## YOUR TASK

### Part A — independent review (do first)

Spot-audit the full reference (`KNOWLEDGE-2026-10-31-uber-app-full-reference.md`) against the evidence archive like this:

1. Pick 12 numbers at random across sections (at least one per section).
2. Recompute each from its named evidence file (the §16 index tells you which).
3. Re-run the keyword scan on all three shareable reports.
4. Check internal cross-references and the evidence file counts in the source notes.
5. Record your verdict in a new file `reports/review-next-agent-<date>.md`: per checked item — MATCH / MISMATCH / UNVERIFIABLE, with the recomputed value. If any MISMATCH: fix the report, note the fix, and re-scan.

Do not rubber-stamp. If you find a real error, fixing it with evidence is the expected outcome, not a failure.

### Part B — expand the knowledge (the actual new work)

Pick from this prioritized list of studied absences (each has a documented next step; do them in any order, one evidence file per step):

1. **Runtime map-backend choice** (the one open maps question): with the owner present and operating their own account on the test phone, observe a map screen and record which renderer initializes (bounded device-log capture of that session). Passive for you — the owner taps.
2. **Release-to-release comparison**: when a second build of the app becomes available (next store update on the test device), capture the same identity/packaging/permission/component records and produce a change report (new permissions, new exported components, new vendors, version delta).
3. **Native-library internals** (`libeef0.so` role, engine internals): requires a Linux or WSL host with an ELF image-analysis engine — the current Windows machines cannot read these ELF images beyond export tables. If you gain such a host, start with `libeef0.so` (1,045,609 bytes, exports only a 34 KB load-time registration function) and the secure-engine pair.
4. **The IPC allowlist contents**: the caller-validation allowlist is dependency-injection-bound with obfuscated implementations; a manual walk of the generated binding modules would resolve it. Medium value (the providers are defended either way).
5. **Driver app** (`com.ubercab.driver`): a separate product — the same study pattern applies end to end if the owner installs it on the test device.

For each: add findings to the full reference as a dated addendum section (same style: tables, exact counts, "not determined" where true), archive the evidence, update the §16 index and file counts.

### Part C — finish protocol

1. Update `docs/CURRENT-WORK.md`: statuses, your review file, new evidence counts, new pending decisions.
2. Update the agent-memory files if you have them (they point at CURRENT-WORK.md as the read-first/update-last contract).
3. Report back in this format: review verdict (items checked, mismatches found/fixed), knowledge added (sections + evidence files), open items you could not reach and why.

## Environment notes

- Heavy inspection runs on the second PC: `ssh k5` (Windows, reachable; if the hostname fails, see the tracker for the IP). Toolkit entry point there: the environment-baked launcher script in `smartstore-tools\fastship-tools\` (the `run-*.cmd` helper; details in the tracker). Each full-package load takes ~70 s — run loads sequentially, never two at once.
- The studied package copies: `uber-base.apk` on K5 (SHA-256 must start `55663c73`), full split set under this PC's temp `opencode\uber\apk\com.ubercab\`.
- The test phone (SM-A5360) attaches to this PC when needed.
- Subagent pattern: background agents die at ~10 minutes on this plan; use synchronous agents, at most two in parallel, with disjoint lanes.
