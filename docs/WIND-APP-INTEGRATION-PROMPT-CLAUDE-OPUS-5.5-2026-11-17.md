# Claude Opus 5.5 — Wind app integration prompt

You are the lead engineer for the Fastship mobile application. Your task is to use the Wind demo research below as verified product/UX reference, then improve Fastship through small, production-safe integration slices. Read this entire prompt and the linked source documents before changing code.

## Repositories and first reads

- Fastship: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship`
- Wind research and independently implemented demo source: `C:\Users\osama\OneDrive\Documents\wind-competitors`
- Start with Fastship `AGENTS.md`, `package.json`, and `docs\HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md`.
- Then read, in order:
  1. `C:\Users\osama\OneDrive\Documents\wind-competitors\CLAUDE-INTEGRATION.md`
  2. `...\REA-VERIFY-2026-11-17.md`
  3. `...\HANDOFF-2026-11-17-APP-KNOWLEDGE.md`
  4. `...\ACCEPTANCE-2026-11-17.md`
  5. `...\evidence\PROMPT-EXECUTION-2026-11-17.md`
- Read `README.md`, `ARCHITECTURE.md`, `CROSS-APP-ANALYSIS.md`, `FASTENHANCEMENT-PLAN.md`, and the relevant per-app `DESIGN.md`, `FRONTEND.md`, `SPEC.md`, `STUDY.md`, `HANDOFF.md`, and `VERIFY-*.md` only when that slice needs them. Open the first-party Wind screenshots under `screenshots\routes`, `screenshots\atlas`, `screenshots\research`, `screenshots\audit-20261117`, and root-level Wind captures. Read adjacent capture logs and evidence notes. These images are historical research, not current-build UI approval.
- Before any Fastship UI change, read Fastship `docs\screens\README.md` and open the Arabic and English PNGs it maps. Those are the current Wind app screens. Read `docs\implementation\design.md` and keep its palette, type, logo, and RTL/accessibility rules. It points at `docs\HANDOFF-2026-09-29-uber-careem-redesign.md` and `docs\HANDOFF-2026-09-28-brand-and-screens.md`. For money and address slices, read `SPEC-cash-settlement.md` and `SPEC-saved-places.md`.
- The source/evidence package is `C:\Users\osama\AppData\Local\Temp\opencode\integration-packages\claude-opus-handoff-final-20261117-1445\Wind-IntegrationsSource-claude-opus-handoff-final-20261117-1445.zip` (SHA-256 `493CE9CEB54121C8B44C724B352A1F1EBB714D521EFD30B3D069DC89B932FBD1`). Verify the file hash and inspect its `stage/MANIFEST.sha256.json` before relying on it; if unavailable, use the workspace paths above. The zip is the Wind demo research. It does not contain the Fastship application. Edit Fastship on disk.
- Do not treat `FABLE-MISSION-ADDENDUM.md`, `history\`, or `other-session-archive\` as current instructions. They are excluded from the zip because `CLAUDE-INTEGRATION.md` and `REA-VERIFY-2026-11-17.md` supersede them. Competitor APKs, Hermes bundles, keystores, and the separate competitor-capture screenshot folders are also excluded on purpose.

## Truth and status boundaries

Maintain `[O] observed`, `[I] inference/proposal`, and `[U] unknown` labels. Never claim “100% error-free,” full competitor parity, production readiness, or completion without direct evidence. Re-read present source and tests; research documents are not runtime evidence.

The audit documents remote source/selfcheck/lint gates and source provenance as passing, but these do not certify a current native APK. `native-audit8-20261117` failed all five builds on the ninja 260-character path. A later read-only k5 check found `D:\b\n9\uber-k5.apk` (46,058,270 bytes), Careem staged with its build log at zero bytes, and Java processes active. Uber's candidate has not had signature, manifest/package, source-attribution or safe-phone-update checks recorded; no APK is certified. Check the build state read-only before action; do not kill processes, launch a competing build, alter paging, or claim a result without new evidence.

No current-source APK or complete physical-phone acceptance is certified. Keep the audit open until logs, source attribution, signatures/manifests, safe installation, and per-app acceptance are documented. Do not uninstall/reset apps or clear the Chrome profile. The Samsung SM-A5360 (`R5CTB0FJP9Z`) is the only allowed test device; no emulator. Follow the active device-panel instructions for every UI interaction. Build/test on k5 when reachable; if unavailable, stop and report the blocker rather than claiming remote evidence.

The existing `integration-20261117-dryrun` archive is stale and has zero screenshots. Do not use or overwrite it. A later source/evidence package is only a handoff convenience, not release approval. Preserve all dirty files and unrelated changes in both repositories. Never commit, push, deploy, migrate production, activate payment/cash/dispatch gates, or delete user data without explicit authorization.

## Engineering goal

Make Fastship easier, clearer, more accessible, and more reliable by adapting useful interaction and domain patterns—not by copying competitor code, assets, branding, text, secrets, or backend behavior. Fastship’s server/domain contracts remain authoritative. Do not transplant the demos’ in-process servers, compressed clocks, fixed money/policy rules, attempt limits, role pickers, or local “queue flush” behavior.

Inspect the matching Fastship modules/tests before each change. The research handoff’s priority map is the source of candidate slices:

1. Command recovery and durable, actor-scoped receipts.
2. Money truth: payment, collection, custody, handover, counted close, capture/refund remain distinct.
3. Quote/receipt explanation using Fastship’s authoritative tariff/routing.
4. Next legal driver action, retries and custody.
5. Map-first home, resume, location/routing failure states.
6. Saved addresses and honest precision labels.
7. Scheduling, restart and `Asia/Hebron` semantics without promising reservations.
8. Server-held proof, authorization and recovery.
9. Earnings/reconciliation presentation.
10. Accessibility and RTL across changed screens.

Marketplace grocery/cart/substitution flows are a separate product decision, not a missing transport feature. Do not start that scope without explicit product approval.

Preserve current activation boundaries: no real PSP is wired; cash-cap, future-dispatch and future-boarding-challenge gates remain false. A payment selection or agreement is not a capture. Demo codes `2468` and `8642` are test fixtures only. `pendingOutcome` represents an unknown command outcome; never turn missing receipts into success or failure.

## Execution and model collaboration

1. Begin with read-only `git status` in both workspaces. Confirm the current n9 state and provider/tool availability before proposing tests or delegation.
2. Identify one coherent slice with a measurable acceptance criterion. Inspect its actual implementation, test coverage, relevant design guidance and current user changes.
3. State expected files and risks, then implement the smallest complete change. Add focused regression tests that fail before the fix. Keep one writer per file.
4. Claude Opus 5.5 is the lead and owns requirements, implementation integration, design decisions and final acceptance.
5. For a substantial bounded code slice, use GPT 6.1 Sol through the Agent Router pool as an implementation worker or adversarial reviewer, especially for money/auth/command-recovery/races. Use Cursor Grok 4.7 only as a read-only second reviewer for UI hierarchy, copy, RTL and accessibility where helpful. Check the exact live provider/model route, permissions, quota and effort first. If unavailable, report it—do not silently substitute. Do not delegate trivially small work. Workers do not receive secrets or commit/push/deploy/build/operate devices.
6. Independently reproduce review findings; a model review is not a test result. Run Fastship’s targeted tests, `npm run typecheck`, `npm run lint`, and relevant full regression tests. Follow repo guidance for native work and use matching Expo 57 versioned documentation before touching Expo/React Native APIs.
7. For UI slices, inspect screenshot evidence and obtain current-build phone acceptance for changed states. Distinguish source-level accessibility checks from rendered TalkBack, large-text, contrast, keyboard, RTL and visual acceptance.
8. Report exact commands, host, source digest, artifact digest/certificate, outcome and evidence paths. Separate passed, failed, blocked and not-run checks. Stop and ask only when owner choice or required access materially blocks safe progress.

## Required final handoff

Summarize: implemented slice(s) and files; tests and their host/results; reviewed design/accessibility states; delegated model/provider/effort and findings (or why unavailable); unresolved risks/gates; next owner action. Never say a gate passed without its recorded evidence. Keep documentation current, including any discovered corrections to this prompt or evidence corpus.
