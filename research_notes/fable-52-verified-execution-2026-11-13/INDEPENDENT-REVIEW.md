# Independent Fable 5.2 re-verification record

**Date:** 2026-11-13  
**Lead:** `kimi-pool/kimi-k3.1-pro`  
**Result:** NO-GO stands, with material corrections. Workers supplied source/log reviews; the lead independently checked every adopted material correction. Worker claims are not automatically lead-verified facts.

## Reviewers and execution

| Reviewer | Scope | Completion / evidence |
|---|---|---|
| NVIDIA NIM `nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b`, high reasoning, native background agent `ses_e2d5e7759ffe2Wa4Cjx6xhYUx4` | Tests, booking, typecheck | Completed. Raw worker report: [final-classification-report.md](./final-classification-report.md). Cross-provider `delegate_task` first failed with `provider_unavailable: Provider instance nvidia is not registered`; the native agent then ran the requested NVIDIA model. |
| Claude `claude-opus-5-5`, high effort, delegated task `4f95428c-0bb8-41c6-9195-8eefa30eb002` | Payments, infrastructure, recovery, scaling | Completed through harness notification. [Review thread](t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Afb27eb96-dc69-44a0-a009-c02d42043e3b%3Adelegate-task%3A4f95428c-0bb8-41c6-9195-8eefa30eb002). |
| Claude `claude-sonnet-5-5`, high effort, delegated task `d88d8676-be02-433f-ac32-9db7e78f54a5` | Report consistency, evidence boundaries, missing priorities | Completed through harness notification. [Review thread](t3-thread://v2/4717e1f7-4946-418a-9070-8ff2ced6fe2c/thread:delegated-task:command%3Amcp%3Afb27eb96-dc69-44a0-a009-c02d42043e3b%3Adelegate-task%3Ad88d8676-be02-433f-ac32-9db7e78f54a5). |

All three shared the current dirty checkout. No reviewer ran tests, AWS calls, device work, or production operations. Monitoring used start/completion notifications, not polling.

## Lead reconciliation

| Topic | Worker finding | Lead verdict and action |
|---|---|---|
| Booking | All relevant reviewers confirmed the broad-4xx command clear and fresh regression. | **Confirmed.** `src/app/book.tsx:371-385`; `integration-current.log:102-114`. Remains a release blocker. PostgreSQL Part A remains unexecuted. |
| Test classifications | NVIDIA confirmed 99 files, 103 results, 96 pass/7 fail; four PostgreSQL environment blockers, clean-typecheck timeout, unresolved parcel flake. | **Confirmed.** The 103/99 difference is not an open defect: `dependency-security.test.mjs` contains five top-level tests and the other 98 files one each, accounting for four extra results. Direct execution remains noncanonical. |
| Seven TypeScript errors | NVIDIA/Opus accepted the recorded errors; Sonnet identified the audit config's Expo-versus-Node type conflict. | **Product claim refuted by fresh execution.** `npx tsc --noEmit -p tsconfig.server.json --pretty false` exited 0. The audit config inherited Expo types; the canonical server config uses Node types. The seven errors are retracted as application defects. See `typecheck-server-recheck.log`. |
| Canonical full typecheck | OOM and research contamination remain separate from the server check. | **Confirmed unresolved.** No canonical `npm run typecheck` pass exists. P0-3 now targets root scope/OOM and the full gate, not the retracted seven errors. |
| Lint | Sonnet found the original log too thin to establish exit 0. | **Resolved with fresh execution.** `npx expo lint` exited 0 and `lint-recheck.log` records it. |
| Payment mechanism | Opus refuted a `captureMethod` mechanism and the claim that `settlementGate` performs settlement side effects. | **Confirmed from source.** `provider.create` decides the outcome; the gate only locks/rejects. HANDOFF §3.2 and P0-5 corrected. The older audit's `captureMethod` wording is superseded. |
| Post-capture conflict | Opus identified provider capture before gate checks, leaving possible provider-captured/local-pending divergence without compensation. | **Confirmed.** P0-5 now requires void/refund or durable exception reconciliation, direct-query coverage, payable order-state checks, and cash/card conflict tests. Still an activation blocker, not a live PSP exploit claim. |
| AWS profile | Opus/Sonnet found `osama-abujarad` absent. | **Confirmed.** `~/.aws/config` contains `osama`; HANDOFF now uses that profile. No credential values were read into the report and no new AWS call was made. |
| Dirty-tree identity | Opus requested per-item dirty-tree caveats but said the tree was undisclosed. | **Partly accepted.** HANDOFF already disclosed extensive modifications; it now also identifies the uncommitted 106-entry registry/CI changes and untracked `opencode.ts`. Committed HEAD has 88 registry entries. |
| P0-4/P0-7 severity | Opus said PostgreSQL cutover and multi-instance scaling are conditional, not blockers for unchanged single-process SQLite. | **Accepted.** Both are now labelled conditional activation gates. They remain NO-GO for those selected changes, not mandatory architecture work for a single-host release. |
| Recovery/deploy | Opus identified upload-only host backups, code-only SQLite rollback, watchdog/deploy overlap, and no current dirty-Dockerfile image evidence. | **Confirmed by source/diff.** Requirements added to P0-6/P1-2. No live deploy failure is claimed. |
| Research tooling | Sonnet found an isolated AWS environment and REA clone omitted from the mutation statement. | **Confirmed under `research_notes/Fable 5.2 verified execution handoff/`.** `.venv-aws` and the `rea` clone (`https://github.com/morluto/rea.git`, HEAD `937d10df1c709c8b2f5af8d9406ef735d0b3a2dc`) are now disclosed. Nothing was deleted. |
| Same-day reference study | Sonnet found omitted Uber 4.655, Shiply, Souq Tulkarm, Athkar, Salati reports. | **Confirmed as study records.** HANDOFF §3.5 includes them as un-reproduced static evidence, not fresh lead tool execution. Their phone-acquisition wording is contradictory and remains an explicit provenance gap. |
| Uber signer/APK scope | Sonnet found a 60-hex signer value and an overbroad no-APK claim. | **Confirmed and corrected in `reference-rea-audit.md`.** The historical source record has signer `4003231ab42feb8d955e62fdfaa4fad59567054b9c6bbc3d950299ddfc268392`; the APK claim is scoped to competitor artifacts. |
| COD/recipient/driver settlement | Sonnet found W8–W10 underrepresented. | **Accepted.** New P0-10 makes cash/COD, recipient handover, and driver settlement explicit launch gates. P0-9 now names recipient identity, safety/incident, and fraud workflows. |
| Notifications and owner decisions | Sonnet questioned notification priority and missing owner decisions. | **Accepted with scoping.** Safety-critical basic notifications remain P0 journey evidence; broader lifecycle work remains P1 with explicit residual-risk sign-off. A blocker row now preserves the full owner-decision set. |
| NVIDIA raw-report caveats | The worker checked a brief-only nonexistent `typecheck-application.mjs`, repeated the old AWS profile, and stated no file modification despite creating its report. | **Not adopted.** Those statements are raw worker error, not handoff findings. Its file creation was limited to this research directory; no application/test files were changed. |

## Fresh lead checks added during reconciliation

| Command | Result | Log |
|---|---|---|
| `npx expo lint` | PASS, exit 0 | [lint-recheck.log](./lint-recheck.log) |
| `npx tsc --noEmit -p tsconfig.server.json --pretty false` | PASS, exit 0 | [typecheck-server-recheck.log](./typecheck-server-recheck.log) |

Both were local Windows fallback runs, not k5, CI, physical-device, or production evidence. No broad suite was rerun. No application/test/infrastructure source, production data, or Git state was changed.
