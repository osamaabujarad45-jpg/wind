# IMPLEMENTATION HANDOFF — REA-2026-11-13 reference apps → Wind/Fastship

> **Status reconciliation:** read `docs/REA/2026-11-13-RECONCILIATION.md` before using the phase plans or adopt-item status tables. Booking and typecheck work is already complete locally; several absence labels and the payment-enablement instructions are stale. The behaviour requirements and evidence rules remain applicable.

**Purpose.** One file that lets an implementing agent start work with no further discovery:
every source study, every already-made decision, every Fastship path that a change lands in,
and the measured status of each adopt item.
**Compiled:** 13 Nov 2026. **Read this whole file before writing code.**

---

## 0. Hard rules — these are not negotiable, and they are not style preferences

1. **Build behaviour, never copy artifacts.** The studies quote short identifiers, string
   constants, field names and status tokens *as evidence*. Do not copy code, icons, colours,
   layouts, API shapes, marketing copy, translations-as-a-set or assets from any studied app.
   The corpus' own discipline note states this: `research_notes/REA-2026-11-13-reference-apps/PALESTINIAN-COMPETITORS-INDEX.md:291-294`.
2. **Analysis sources are lawful only** — public store listings, public docs, observable UI,
   already-held APKs studied statically. No credential harvesting, no auth/rate-limit/bot
   bypass, no contacting a competitor's systems.
3. **Do not rename the app, package id, or bundle id to avoid a security scan or policy
   check.** Branding renames are ordinary work; evasive renames are out of scope and must not
   be proposed. `app.json` identity stays as the owner set it unless the owner asks for a
   branding change on its own merits.
4. **Evidence labels are mandatory** on every factual claim:
   `[read]` = a repo file you opened · `[ran]` = a command you executed, with output ·
   `[re]` = a REA static tool result, cite the study file · `[I]` = inference · `[U]` = unknown.
   An unlabelled claim is a defect.
5. Downstream agents working this file must not run `git commit`, `git push`, `git checkout`
   or create branches unless the owner says so.

---

## 1. Source corpus — the eight studies, with paths

Base: `research_notes/REA-2026-11-13-reference-apps/`

| Study (absolute path) | Artifact | Verdict for Wind |
|---|---|---|
| `…\PALESTINIAN-COMPETITORS-INDEX.md` | cross-app index | **Start here.** Matrix, adopt/skip/defer, gaps |
| `…\SOUQ-TULKARM.md` | `ps.souqtulkarm.app` 1.0.2 | **Richest single source** for cash + custody design |
| `…\SHIPLY.md` | `com.shiplypalestinemobileapp` 1.8530 | Real parcel-logistics competitor, Expo+RN |
| `…\CAREEM.md` | `com.careem.acma` 26.43 | MENA benchmark; address-without-street-numbers; cash arrears |
| `…\HAAT.md` | `com.haat.client` 21.0.4 | Palestinian-scale benchmark; Arabic order vocabulary |
| `…\UBER-4.655-rider.md` | `com.ubercab` 4.655.10001 | Global benchmark; map-first home, saved places, tracking |
| `…\ATHKAR.md` | `net.fares.athkar` 1.1.1 | **Not a delivery app.** Regional Android craft only |
| `…\SALATI.md` | `com.masarat.salati` 3.7.66 | **Not a delivery app.** Alarms/RTL/offline craft only |

Full absolute base path:
`C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship\research_notes\REA-2026-11-13-reference-apps\`

**Correction that must not be lost** `[re]`: the original brief called Athkar "rides +
delivery" and Salati "food delivery/grocery". Both are wrong — zero delivery-domain classes
across 17,372 and 3,525 classes respectively. The real local competitor set is **Shiply and
Souq Tulkarm**. Source: `PALESTINIAN-COMPETITORS-INDEX.md:28-43`.

**Also already established** `[re]`: **no app in the set ships WhatsApp ordering** (0
`whatsapp`/`wa.me` hits in Shiply's bundle, 0 in Souq's). It is an unclaimed position, not a
pattern to copy — see defer item D11.

Underlying prior Uber studies (still the deeper reference for the global benchmark):
`docs/KNOWLEDGE-2026-10-31-uber-app-full-reference.md`,
`docs/KNOWLEDGE-2026-11-01-uber-app-architecture-and-construction.md`,
`docs/KNOWLEDGE-2026-11-01-uber-app-features-and-requirements.md`,
`docs/KNOWLEDGE-2026-11-02-uber-rider-api-backend-contract-study.md`,
`docs/KNOWLEDGE-2026-11-02-uber-rider-map-capability-inventory.md`.

---

## 2. Decisions already made — do not re-litigate without new evidence

The index already resolved what to adopt, skip and defer. Reproduce the decision, then
implement only the ADOPT set. Source: `PALESTINIAN-COMPETITORS-INDEX.md:128-193`.

**ADOPT (A1–A15), behaviour only**
A1 zone-first addressing · A2 append-only cash ledger with attributed corrections ·
A3 customer-held delivery proof (code + QR, no PII, lockout, audited admin reset) ·
A4 typed delivery-failure reasons · A5 shift-first driver + job board + custody scans ·
A6 chain of custody as append-only per-parcel log · A7 idempotency-keyed, offline-enqueueable
writes · A8 zone-driven fees + capacity-limited windows with daily cap ·
A9 consent-before-change with counterparty notification · A10 tracking that reports its own
degradation · A11 integer cents with driver-entered collected amount ·
A12 service level as a parcel attribute · A13 per-event notification channels with version
suffix · A14 alarm re-arm graph (boot/user-unlock/time/timezone/package-replaced) ·
A15 tiny complete offline fallback bundle.

**SKIP (S1–S13)** card/wallet payment and card commission · marketplace/community/social
layer · B2B catalogue/vendor/employee surface · Capacitor-shell web app architecture ·
shipping API keys/Expo project ids/Sentry org in app config · `allowBackup="true"` for
addresses+parcels · ad-storage-enabled analytics defaults · `READ_PHONE_STATE`/`RECORD_AUDIO`/
`BLUETOOTH`/`DISABLE_KEYGUARD`/full-screen-intent permission sprawl · always-on background
location · chat-with-canned-replies at launch · single hosted origin (Railway) as production
shape · Athkar's and Salati's actual products · Web Push instead of FCM on Android.

**DEFER (D1–D14)** each has a written evidence gate in the index. Do not build one without
satisfying its gate and recording the gate result.

---

## 3. Fastship baseline — the real paths a change lands in

**Schema (SQLite, this is what production writes):** `server/db/sqlite-schema.ts`
Existing tables that already cover adopt items — verify columns before adding any new table:
`cash_entries`, `proof_attempts`, `order_actions`, `order_commands`, `order_disputes`,
`order_messages`, `order_offers`, `order_releases`, `orders`, `partner_orders`,
`saved_places`, `checkpoints`, `checkpoint_reports`, `destination_changes`,
`driver_locations`, `road_restrictions`, `road_restriction_policy`, `safety_incidents`,
`security_events`, `promo_codes`, `promo_owners`, `promo_redemptions`, `referral_codes`,
`referrals`, `subscriptions`, `settings`, `sessions`, `users`, `quotes`, `request_limits`,
`opencode_jobs`, `push_subscriptions`, `push_keys`, `native_push_tokens`.

**PostgreSQL mirror + migrations:** `server/db/postgres-*.sql` (30 files), applied by
`server/migrate.ts`. Any schema change needs **both** dialect paths plus a migration.

**Domain modules:** `server/domain/` — notably `cash-ops.ts` (driver handover + admin
resolution, CAS, push), `ledger.ts` (double-entry journal), `money.ts`, `dispatch.ts`,
`presence.ts`, `journey.ts`, `ride-lifecycle.ts`, `destination-change.ts`,
`private-objects.ts`, `resource-scope.ts`, `quotes.ts`, `routing-policy.ts`,
`native-push.ts`, `commands.ts`, `events.ts`, `ops.ts`, `statistics.ts`.

**HTTP:** `server/main.ts` (route inventory is frozen — new routes belong in their own
`server/domain/*.ts` registration module, per the comment at the head of `cash-ops.ts:1-6`).

**Client routes (Expo Router):** `src/app/` — `(customer)/index.tsx`, `(customer)/orders.tsx`,
`book.tsx`, `order/[id].tsx`, `receipt/[id].tsx`, `track/[token].tsx`,
`driver/index.tsx`, `driver/trips.tsx`, `driver/earnings.tsx`, `driver/account.tsx`,
`admin/cash.tsx`, `admin/orders.tsx`, `admin/users.tsx`, `admin/settings.tsx`,
`admin/subscriptions.tsx`, `admin/account.tsx`, `profile.tsx`, `help.tsx`, `roads.tsx`.

**Client modules:** `src/` — `api.ts`, `api-client.ts`, `money` via `server/domain/money.ts`,
`offline-recovery.ts`, `offline-summary.ts`, `storage.ts`, `recovery-storage.ts`,
`command-id.ts`, `wire-contracts.ts`, `journey-contracts.ts`, `presence.ts`,
`driver-presence-runtime.ts`, `background-location.ts`, `background-permission.ts`,
`location-state.ts`, `map-provider.ts`, `map-provider-boundary.tsx`, `native-push.ts`,
`push.ts`, `copy.ts`, `model.ts`, `booking.ts`.

**Gates / tests:** `tests/` (150+ files). Directly relevant existing suites to extend, not
duplicate: `cash.test.mjs`, `ledger.mjs`, `ledger-sqlite.mjs`, `pg-cash.mjs`,
`commands.mjs`, `commands-sqlite.mjs`, `outbox.mjs`, `offers.test.mjs`,
`unblock-custody.test.mjs`, `parcels.test.mjs`, `recipient.test.mjs`, `pickup.test.mjs`,
`capacity.mjs`, `schedule.test.mjs`, `credit.test.mjs`, `chat.test.mjs`,
`driver-scope.test.mjs`, `driver-command.test.mjs`, `resource-scope.mjs`,
`native-push.mjs`, `push-server.test.mjs`, `journey.mjs`, `wire-contracts.test.mjs`.
Runners: `npx tsc --noEmit`, `npx expo lint`, `scripts/run-tests.mjs`.

---

## 4. Measured status of each ADOPT item — read before planning any slice

Method for the "evidence" column: token search over `server/**` and `src/**` on 13 Nov 2026
`[ran]`, plus targeted schema reads `[read]`. **A "no hits" line is not proof of absence** —
it means no evidence under the obvious names. Confirm with a grep before you build, and
record the grep in your report.

> **Read this before the table: production runs SQLite, and twelve modules return
> "unavailable" on SQLite.** Any row marked POSTGRES-ONLY describes code that is unreachable
> in the pilot. Full evidence: `docs/REA/2026-11-13-VERIFIED-ADDITIONS.md` §1.

| Item | Measured status | Evidence |
|---|---|---|
| A1 zone-first addressing | **ABSENT as a customer address model; a service-area model exists but only in Postgres** | `saved_places` is `{user_id, label home\|work\|other, city, note}` — no zone, no landmark, no default flag; the only "zone" hit is the shortcut at `src/model.ts:185` (*"20 km as the crow flies … stands in for real service zones"*). But `server/db/postgres-eligibility.sql` defines `service_areas`, `route_permissions`, `vehicle_runs`, `capacity_reservations` — so "no zones in the system" would be wrong |
| A2 append-only cash ledger | **Append-only is ENFORCED on SQLite by trigger; only the double-entry journal is Postgres-only** | `cash_entries_no_delete` (BEFORE DELETE) and `cash_entries_no_edit` (BEFORE UPDATE) in `server/db/sqlite-schema.ts:126,128` make the table immutable even under a bug. `cash-ops.ts` implements driver handover → admin count/close. What production lacks is the journal in `ledger.ts`, which returns unavailable unless `backend === 'postgres'` (`:15`) |
| A3 delivery proof as customer-held secret | **PRESENT — drop it from the plan** | `orders.handover_code` (customer → driver at delivery) and `return_code` (sender → driver on a return) are in `sqlite-schema.ts`; `main.ts:2201` requires the expected code to complete the order; `POST /api/admin/orders/:id/proof-reset` exists at `main.ts:2826` and writes a `security_events('PROOF_RESET', {reason})` audit row at `:2835`; `proof_attempts` adds the five-strike lockout. Only a QR token is absent |
| A4 typed delivery-failure reasons | **PARTIAL** — `safety_incidents.kind` is a checked enum; `order_disputes.reason` is free text with `open\|resolved` only. No delivery-failure enum | `[read]` schema |
| A5 shift-first driver + job board | **ABSENT as specified** — offer acceptance exists (`dispatch.ts:284` `already_taken`) and a driver holding an active job is blocked (`presence.ts:168` `presence_active_job`), but there is no shift lifecycle, no ready-queue and no vehicle-code scan | `[read]` `server/domain/dispatch.ts:284`; `server/domain/presence.ts:168` |
| A6 chain of custody | **PRESENT ONLY IN THE DIALECT PRODUCTION DOES NOT RUN** — `resource-scope.ts:33` gates the whole feature on `to_regclass('custody_records')`, a Postgres check. The SQLite-era concept is only `eligibility.ts:577` (`custody_required`) and `:590` (`ELIGIBILITY_CUSTODY_RECOVERY`). No per-parcel human-readable append-only log | `[read]` `server/domain/resource-scope.ts:30-41`; `server/domain/eligibility.ts:577,590` |
| A7 idempotency + offline outbox | **LARGELY PRESENT** — `order_commands(user_id, request_id, payload_hash, order_id)` and `order_actions(…, http_status, error)` give replay-safe writes; `src/command-id.ts`, `src/offline-recovery.ts`, `tests/outbox.mjs`. Literal `idempotencyKey` only in `payments.ts` | `[read]` schema; `[ran]` grep |
| A8 zone fees + capacity windows | **PARTIAL — capacity exists in Postgres, windows do not exist on SQLite** | SQLite carries only `scheduled_for` (`quotes.ts:48,151,203,240,265`). Postgres has `capacity_reservations`, `capacity_stops`, `vehicle_runs`, `order_requirements` (`postgres-eligibility.sql`). What is missing on the dialect production runs is a zone-priced window with a per-window cap |
| A9 consent-before-change | **PRESENT — drop it from the plan** | `destination_changes` carries `state IN ('quote','pending','accepted','declined','withdrawn')` with `decided_at`/`expires_at`/`price`/`tariff_version` in `sqlite-schema.ts`, and `destination-change.ts:25` pushes `destination_request` / `destination_accepted` / `destination_declined`. That is consent-before-change with counterparty notification |
| A10 tracking that reports degradation | **PRESENT — do not plan to build this.** `src/location-state.ts:8-9` defines stale ≥ 60 s and reconnecting 30–60 s with the reasoning in a comment; `presence.ts:119` returns a `location_stale` state; `presence.ts:172` rejects a fix older than 30 s | `[read]` `src/location-state.ts:8-9`; `server/domain/presence.ts:119,172` |
| A11 integer cents + collected amount | **PARTIAL — cents yes, variance no.** Minor units used in `cash_entries.amount_cents` and `ledger.ts` (`debitMinor`/`creditMinor`). No `amountCollectedCents` / `discrepancyReason` anywhere | `[read]` schema; `[ran]` grep → 0 files |
| A12 service level as parcel attribute | **ABSENT** — `partner_orders` is only `{external_ref, payload_hash, order_id}`, an idempotency map with no service-level field | `[read]` `server/db/sqlite-schema.ts` `partner_orders` |
| A13 notification channels with version | **ABSENT (as specified)** — one push path (`native-push.ts`, `push.ts`), zero `channelId`-style per-event channel declarations | `[ran]` grep `channel` in `server/domain/native-push.ts` → 0 hits |
| A14 alarm re-arm graph | **PARTIAL** — `src/background-location.ts:3,165` uses `expo-task-manager` `defineTask`. No boot, user-unlock, time-set, timezone-change or package-replaced handling | `[read]` `src/background-location.ts:3,165` |
| A15 offline fallback bundle | **PARTIAL** — `src/offline-summary.ts:2-13` is a versioned cached summary (`schemaVersion`, `actorId`, `role`, `maxAge`), not a zones/fees/windows fallback bundle | `[read]` `src/offline-summary.ts:2-13` |

**Conclusion to carry into planning:** the picture changed three times — the dialect gate, then a second
pass that corrected my own labels, then that same lesson applied to A3. **A3, A9 and A10 are already
implemented — drop all three.** **A5 shift/job-board and A12 service level are genuinely absent.** **A1
zone-addressing and A8 capacity windows exist only in the Postgres dialect**, so they are parity work,
not greenfield. **A2's append-only cash ledger is enforced by triggers today**; only the journal is
missing. **A6 is Postgres-only.** The real gaps: **A13 channels**, **A11 collected-amount variance**,
**A5**, **A12**.

**Method rule — this is the most transferable thing in this file.** Three of my "absent" rows were
wrong, all from token greps: A9 (code says accept/decline/withdraw, I searched "consent"), A3 (the
column is `handover_code`, I searched `deliveryCode`), A8/A1 (the capacity model lives in
`postgres-eligibility.sql`, which I never opened). A grep shows a name is not present; it never shows a
capability is absent. Claim absence only after reading the route, the table, or the state machine.

---

## 5. Work sequence

**Phase 0 — confirm the baseline (no code).** For every row in §4, run the named grep/read and rewrite
the row's status with the evidence. Evidence goes in `docs/REA/2026-11-13-VERIFIED-ADDITIONS.md` §2 and
in `2026-11-13-gap-backlog-source-audit.md` — there is no separate `BASELINE-CONFIRMED.md` and one should
not be created.

> **Status 13 Nov: done.** Every §4 row is confirmed with a command or a read, and re-checked by an
> independent source audit. Two rows changed the plan: **A10 is implemented** (drop it) and **A2/A6 are
> Postgres-dialect-only**. Three more changed it after the audit: **A3 and A9 are implemented** (drop
> them) and **A7 is `PARTIAL`**, not done — the durable protocol is opt-in and allowlisted. Before Phase
> 1, settle the **dialect decision** in `2026-11-13-DIALECT-ADR.md`: twelve modules and eighteen tables
> exist only in the dialect the pilot does not run, so most "implement A2/A6" rows are blocked on that
> choice rather than on code.

**Phase 1 — write the gap backlog.** `docs/REA/2026-11-13-GAP-BACKLOG.md`, one row per real
gap: adopt item · current path:line · required behaviour in our own words · S/M/L · user
impact. Order by user impact.

**Phase 2 — implement, TDD at each seam.** Failing test first in `tests/`, then the change.
Schema change ⇒ SQLite + Postgres + migration (`server/migrate.ts`). New route ⇒ its own
`server/domain/*.ts` registration module, because `server/main.ts`'s route inventory is
frozen. Client change ⇒ `src/app/` route or `src/` module, following surrounding patterns.
Run `npx tsc --noEmit` and the touched test file after every slice; full
`scripts/run-tests.mjs` at the end.

**Phase 3 — APK on the physical phone.** Device `SM-A5360`, adb serial `R5CTB0FJP9Z`.
Never an emulator. Dev/EAS build, install, walk the changed flows, capture cold start and a
screenshot per changed screen into `docs/screens/`. If the phone is not attached, stop and
report — do not claim remote evidence.

**Phase 4 — four-repo split (propose only).** By concern, never by copied app:
(1) client app, (2) server + domain, (3) infra + deploy, (4) docs + evidence. Write the
proposal with boundaries and the exact git commands for the owner to run. **Do not execute
the split.**

---

## 6. Definition of done

- Every §4 row has a confirmed status with the command that proved it.
- Every implemented slice has a test that failed first and passes now.
- `npx tsc --noEmit`, `npx expo lint`, and the full suite are green **with pasted output**.
- No competitor code, asset, string set or API shape was copied — check the diff for it.
- APK installed and the changed flows walked on `SM-A5360`, with evidence paths.
- Repo-split proposal written and unexecuted.

## 7. Known blockers and unknowns (do not pretend these are closed)
- **No driver-side artifact** for any app (Haat Driver `com.haat.haatdriver`, Haat Courier
  `com.haat.courier` were never pulled) — driver offer/accept/earnings is unanswered from
  boots-on-the-ground evidence.
- **No server behaviour observed anywhere** — every API claim is shape-only.
- **Haat's API is unreachable from this network** — a measured network fact, not a broken app.
- **Single build per app** — no feature evolution visible.
- **No competitor pricing/economics** — absent or obfuscated.
- **`rea decode-android-resources` unusable** (apktool absent); strings were read with
  `aapt2`, which changes the counting basis. Never mix bases when quoting counts.

---

## 8. The document set — what to read for what

Read in this order the first time; afterwards, use it as an index.

| Document | It answers | Currency |
|---|---|---|
| `2026-11-13-PILOT-READY.md` | **What "done" means**, as 22 measurable criteria and a score | Live — update the score when a gate passes |
| `2026-11-13-DIALECT-ADR.md` | Why the dialect choice blocks a third of the work, and the three options with costs | Proposed — needs an owner decision |
| `2026-11-13-GAP-BACKLOG.md` | **What work exists**, with sizes, acceptance criteria and a sequence | Live — the working plan |
| `2026-11-13-RECONCILIATION.md` | Independent re-baseline of the A-rows; the most sceptical reading | Live |
| `2026-11-13-VERIFIED-ADDITIONS.md` | The evidence behind every status: 12 gates, 20 tables, the booking P0, the peer-review record | Evidence — do not edit, cite it |
| `2026-11-13-INDEPENDENT-CHECK.md` | The other session's line-by-line check, incl. the `runtime.ts` staging correction | Evidence |
| `2026-11-13-DRIVER-SIDE-RESEARCH-PLAN.md` | The plan to close the corpus' biggest hole: no driver-side artifact for any competitor | Planned |
| This file (`…-IMPLEMENTATION-HANDOFF.md`) | Paths, the eight source studies, the A-item meanings, the method rules | Reference |

**Three rules that came out of this pass and now apply to every document here:**

1. **A token grep proves a name is absent, never a capability.** Read the route, the table, or the state
   machine before writing "absent" — four of my labels failed this test (A9, A3, A1/A8).
2. **A passing test is not a correct change.** The booking fix passed every gate and created a lockout;
   trace the user path after green.
3. **State the dialect from the deployment, not the code**, and say which evidence you used.
