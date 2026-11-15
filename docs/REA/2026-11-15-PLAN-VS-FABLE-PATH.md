# Feature plan vs the Fable 5.2 path — 15 November 2026

The owner asked to review the feature plan written on 15 November ("the Sonnet plan") and make sure it follows the Fable 5.2 path. This is that review, by the Opus 5.5 lead, corrected after a Claude Haiku 5.5 accuracy review on PR #45. Where this page and `2026-11-15-FEATURE-INTEGRATION-PLAN.md` disagree, this page wins.

## Sources

| Key | What | Where |
|---|---|---|
| **FABLE** | Fable 5.2 task graph: gates SRC/VERIFY/SCOPE, UX-01..05, PROD-01..06, GEO-01..03, PHONE, OPS-01..03, REL/PROD/GO | `docs/fable/HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md` (copied from the preserved verification worktree) |
| **OWNER** | Owner product decisions on A11, A12 and A5 | `docs/fable/OWNER-DECISIONS-2026-11-14.md` |
| **CAND6** | Fable's implementation of most of the graph: 273 files, +16,611/−2,729 lines, 25/25 gates on K5 (Sol run codex9) | Branch `backup/fable-candidate6-20261115` (3e5645f). It snapshots `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification`, which is left untouched. |
| **PLAN** | Competitor-feature plan, PR #37 | `docs/REA/2026-11-15-FEATURE-INTEGRATION-PLAN.md` |

**CAND6 is on a different code lineage.** Its parent is `b609229`, the old local master, which is not an ancestor of `origin/master`. A trial cherry-pick onto `origin/master` 7c89c89 conflicted on 125 paths, because both lines added the same modules independently. So each slice is ported onto `origin/master` with CAND6 as the reviewed reference. Nothing that CAND6 already answers is re-invented.

## Verdict

The PLAN is a sound inventory of competitor features, but it is not the Fable path:

1. **Door cash went wrong in implementation.** PLAN WP-01 names no variance values, and PR #42 invented `customer_short, no_change, tip, agreed_fare, other`. OWNER A11 fixes six values (`PARTIAL_PAYMENT, CUSTOMER_DID_NOT_PAY, APPROVED_DISCOUNT, RETURNED_ITEMS, INCORRECT_CASH, OTHER_ADMIN_REVIEW`) and requires "a compatible reason" for under- and over-collection. It also requires **one immutable fact per order**: expected and collected minor units, the reason, the actor and the replay identity. CAND6 makes "compatible" concrete in `validCashVariance` (`src/cash-collection.ts`): over-collection allows only `INCORRECT_CASH` or `OTHER_ADMIN_REVIEW`; `CUSTOMER_DID_NOT_PAY` requires 0 collected; `PARTIAL_PAYMENT` requires more than 0. PR #42 now uses the six values and the CAND6 rule (a94da1b). The write-once fact (expected, actor, request id) is being added before merge.
2. **WP-09 mixes cash variance into delivery failures.** It adds `did_not_pay`, `incorrect_cash` and `partial_payment` as delivery exception reasons. FABLE PROD-06 requires a typed delivery-failure taxonomy separate from cash variance, and those three belong to A11. WP-09 keeps only true delivery failures (e.g. `rescheduled`), each with a next action.
3. **No PLAN work package covers eight FABLE nodes:** UX-02, UX-03, UX-05, PROD-03 A12 (owner-approved), PROD-04 A14, GEO-01, GEO-02 and GEO-03. PROD-05 is also uncovered, but it is gated on Option A. The PLAN has no rows for the SRC/VERIFY/SCOPE gates either.
4. **The PLAN gets some things right.** It treats WP-04 SMS, WP-05 email and WP-08 alert route as owner-blocked, and it keeps PostgreSQL-only modules off in the SQLite pilot.

## Node by node

States are as of 15 November 2026, 14:00 UTC, on `origin/master` 7c89c89.

| FABLE node | PLAN | CAND6 | State on origin/master | Action |
|---|---|---|---|---|
| SRC inventory | — | manifest per candidate | Git is the inventory for master work | Each PR is the reviewed source unit |
| VERIFY gates | — | 25 gates on K5 | GitHub CI (verify/persistence/image) on every PR; Sol reruns gates on K5 for the release SHA | Release SHA runs full gates on K5 |
| SCOPE (12 deferred capabilities visibly off) | — | yes | Not re-audited on master | Audit before REL |
| UX-01 ordinary sign-in C-01 | WP-07 (harness only) | `ordinary` role | PR #41 open | Finish #41 (repro). The product fix (role-safe read-only stale orders, no duplicates on reconnect) depends on the repro; no WP yet |
| UX-02 admin review | no WP (related DONE rows A-08, A-09, A-11, A-13) | settings, roles, cash | Cash #36 and subscriptions #38 merged | Port the settings and role-edit review. Master's `tests/admin-settings.test.mjs` is different, so merge tests, don't copy |
| UX-03 accessible pin | — | `src/pin-sheet.tsx`, `tests/pin-accessibility.test.mjs` | Missing | Port after #39 merges (shared map files) |
| UX-04 large text | WP-06 | yes | PR #39 open | Finish #39; compare with CAND6 for missed sites |
| UX-05 driver support + multi-recipient | — | `src/driver-work.tsx`, multi-recipient suites | PARTIAL: foreground-service config and presence state exist; missing last accepted fix, last server ack, next retry and multi-recipient | Port the missing parts |
| PROD-01 A11 door cash | WP-01 (no vocabulary) | migration 32, append-only table | PR #42 open, vocabulary fixed | Write-once fact, then merge |
| PROD-02 A13 channels | WP-10 (partial) | partial | Missing | Later. Versioned channels, needs a new APK |
| PROD-03 A12 priority | — | migration 31 | Missing | Port (in progress) |
| PROD-04 A14 deadline re-arm | — | native `modules/deadline-wake` | Missing | Port last: native module, dev build, physical reboot/time-change proof |
| PROD-05 A5 shift/custody | nearest rows D-07, D-28 | no | MISSING (gated on the Option A rehearsal); PG custody primitives exist | Owner: Option A |
| PROD-06 delivery failures | WP-09 (mixed) | same four reasons; only cash separated | Four reasons | Re-scope WP-09 as above |
| GEO-01 reproducible routing | — | no | PR #46: pinned source plus manifest. Two builds gave identical routes, but graph bytes differ | Merge #46, then rebuild live from a pinned source |
| GEO-02 map measurement | — | no | — | A53 measurement (Sol) |
| GEO-03 shared locations | — | no | Missing | Build (in progress) |
| PHONE | — | candidate6 smoke | Appendix F matrix on bcc0c97 QA APKs: SEARCH-32 PASS; C-01 BLOCKED-HARNESS until #41 | Rerun on the release SHA (release gate) |
| OPS-01..03 | WP-08 | — | Azure `wind-vm`; nightly Blob backup; GitHub Uptime drill ran; human receipt unconfirmed | Owner: alert route |
| REL / PROD / GO | — | — | Live image digest `eac4a8ac…` with revision label `bcc0c975` (read from the container, 15 Nov); APK 29 / 1.1.0 | After PHONE: new APK, deploy, owner GO |

PLAN packages that are not FABLE nodes but are additive and in flight: WP-02 admin assign (PR #43), WP-03 blocked-driver notice (PR #40, merged), WP-11 ETA/cash copy (PR #44). WP-05 email stays owner-blocked.

## Order of work from here

1. Land the reviewed in-flight PRs: #44, #42 (after the write-once fact), #43, #41, #39, #45, #46.
2. Fable ports onto master, one PR each, with a Haiku review and a second-vendor review on money/auth/dispatch: A12, UX-02 remainder, UX-03, UX-05, then A14.
3. GEO-03 (new), then the WP-09 re-scope and the SCOPE audit.
4. Sol runs the full Appendix F matrix on the post-merge SHA. Then the release APK, the deploy, and the owner's GO decision.

PLAN packages not on the Fable path (WP-12 to WP-20) wait until these are done.
