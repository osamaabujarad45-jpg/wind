# Feature plan vs the Fable 5.2 path — 15 November 2026

The owner asked: "review the Sonnet plan yourself and make sure it follows the Fable 5.2 path." This is that review, by the Opus 5.5 lead. Where this page and `2026-11-15-FEATURE-INTEGRATION-PLAN.md` disagree, this page wins.

## Sources

| Key | What | Where |
|---|---|---|
| **FABLE** | Fable 5.2 task graph (SRC/VERIFY/SCOPE, UX-01..05, PROD-01..06, GEO-01..03, PHONE, OPS-01..03, REL/PROD/GO) | `docs/fable/HANDOFF-2026-11-14-FABLE-5.2-FINAL-IMPLEMENTATION.md` (copied from the preserved verification worktree) |
| **OWNER** | Owner product decisions for A11, A12 and A5 | `docs/fable/OWNER-DECISIONS-2026-11-14.md` |
| **CAND6** | Fable's implementation of most of the graph: 273 files, +16.6k lines, 25/25 gates passed on K5 (Sol run codex9) | Branch `backup/fable-candidate6-20261115` (3e5645f). This is a snapshot of `C:\Users\osama\.local\share\opencode\worktree\b44bf6\fable-5.2-verification`, which is left untouched. |
| **PLAN** | Sonnet's competitor-feature plan (PR #37) | `docs/REA/2026-11-15-FEATURE-INTEGRATION-PLAN.md` |

**CAND6 is on a different code lineage.** Its base is `b609229`, the old local master, not `origin/master`. A trial cherry-pick onto `origin/master` 7c89c89 produced 125 conflicting files, because both lines added the same modules independently. So CAND6 can't be merged as a whole. Each slice is ported onto `origin/master` with CAND6 as the reviewed reference. Nothing is re-invented where CAND6 already has the answer.

## Verdict

The PLAN is a sound inventory of competitor features, but it is **not** the Fable path:

1. **It contradicts an owner decision.** PLAN WP-01 (door cash) invented its own variance list: `customer_short, no_change, tip, agreed_fare, other`. OWNER A11 fixes six values: `PARTIAL_PAYMENT, CUSTOMER_DID_NOT_PAY, APPROVED_DISCOUNT, RETURNED_ITEMS, INCORRECT_CASH, OTHER_ADMIN_REVIEW`. Each needs a *compatible* direction: over-collection allows only `INCORRECT_CASH` or `OTHER_ADMIN_REVIEW`; `CUSTOMER_DID_NOT_PAY` requires 0 collected; `PARTIAL_PAYMENT` requires more than 0. The record is an immutable fact with actor and replay identity. PR #42 must be realigned to OWNER before merge (CAND6 `src/cash-collection.ts`, `server/db/postgres-order-cash.sql`).
2. **It mixes cash variance into delivery failures.** PLAN WP-09 adds `did_not_pay`, `incorrect_cash` and `partial_payment` as delivery *exception* reasons. FABLE PROD-06 requires a typed delivery-failure taxonomy **separate from cash variance**, and those three belong to A11. WP-09 keeps only true delivery failures (e.g. `rescheduled`), each with a next action.
3. **It drops seven FABLE nodes**: UX-03 accessible pin, UX-05 driver support status and multi-recipient, PROD-03 A12 same-day priority (owner-approved), PROD-04 A14 deadline re-arm, GEO-01 reproducible routing, GEO-02 map measurement and GEO-03 shared locations. It also covers only half of UX-02 (settings and role-edit review are missing).
4. **It is right** to treat WP-04 SMS, WP-05 email and WP-08 alert route as blocked on the owner, and to keep PostgreSQL-only modules off in the SQLite pilot.

## Node-by-node

| FABLE node | PLAN | CAND6 has it | State on origin/master (15 Nov) | Action |
|---|---|---|---|---|
| UX-01 ordinary sign-in C-01 | WP-07 | yes (`ordinary` role) | PR #41 open, review fixes in progress | Finish #41. Sol runs C-01 on the A53 |
| UX-02 admin money/settings/role review | A-01/A-03 | yes (settings + roles + cash) | #36 cash and #38 subscriptions merged | **Port** the settings + role-edit review from CAND6 (`tests/admin-review.test.mjs`, `admin-settings.test.mjs`) |
| UX-03 accessible pin | — | yes (`src/pin-sheet.tsx`, `tests/pin-accessibility.test.mjs`) | missing | **Port** |
| UX-04 large text | WP-06 | yes | PR #39 open, review fixes in progress | Finish #39. Compare against CAND6 for missed sites |
| UX-05 driver support + multi-recipient | — | yes (`src/driver-work.tsx` etc., multi-recipient SQLite/PG suites) | missing | **Port** after the first wave merges |
| PROD-01 A11 door cash | WP-01 (wrong vocabulary) | yes (migration 32 in CAND6) | PR #42 open | **Realign #42 to OWNER**, using CAND6 rules, plus the Sol P2 fix (no default reason) |
| PROD-02 A13 channels | WP-10 (partial) | partial | missing | Later. Versioned channels per FABLE, needs a new APK |
| PROD-03 A12 priority | — | yes (migration 31 in CAND6) | missing | **Port** (Haiku agent running, CAND6 as reference) |
| PROD-04 A14 deadline re-arm | — | yes (native `modules/deadline-wake`) | missing | Port last. Native module: needs a dev build and physical reboot/time-change proof |
| PROD-05 A5 shift/custody | — | no | n/a | Waits for the Option A PostgreSQL rehearsal (owner) |
| PROD-06 delivery failures | WP-09 (mixed) | partial | 4 reasons | Re-scope WP-09 as above |
| GEO-01 routing reproducible | — | no | OSRM on the Azure VM, extract not pinned | Pin extract date/checksum, record graph version |
| GEO-02 map measurement | — | no | n/a | A53 measurement run (Sol) |
| GEO-03 shared locations | — | no | missing | **Build** (Haiku agent running) |
| PHONE | — | partial (candidate6 smoke) | Sol running the Appendix F matrix on bcc0c97 QA APKs | Rerun on the final SHA, which is the release gate |
| OPS-01..03 | WP-08 | n/a | Azure VM, nightly Blob backup, GitHub Uptime drill ran; human receipt unconfirmed | Owner: alert route |
| REL / PROD / GO | — | n/a | APK 29 (1.1.0) on Azure; prod `20261115-azure4` | After the PHONE gate: new APK, deploy, owner GO |

## Order of work from here

1. Land the reviewed in-flight PRs: #40 (merged), #44, #42 after realignment, #43, #41, #39.
2. Fable ports onto master, one PR each with Haiku + second-vendor review on money/auth/dispatch: A12, UX-02 remainder, UX-03, UX-05, then A14.
3. GEO-03 (new), then the WP-09 rescope.
4. Sol: full Appendix F matrix on the post-merge SHA. Then release APK, deploy, and the owner's GO decision.

PLAN packages not on the Fable path (WP-12..WP-20) wait until these are done.
