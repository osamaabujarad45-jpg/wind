# Cross-critique: docs-vs-code (R5), with whole-panel consistency

**Base:** the tree moved while R1 was being written. `5f941fd` is now followed by
`b7d3c97 lean(migrate): drop unreachable import guards` (2 deleted lines in
`server/migrate.ts`, nothing else). Every citation below was re-read at
`b7d3c97`; no R5 finding depends on the deleted lines. One consequence: R5's
verdict sentence "the remaining uncommitted `server/migrate.ts` edit" is stale —
the edit is committed. The defect analysis is unaffected.

**Method:** for each finding I wrote down the condition that had to hold, then
opened the enclosing function and the cited doc at HEAD. Nothing was run against
a database or a device.

## Adjudication table

| # | Finding | Verdict | Corrected severity | One-line reason |
|---|---|---|---|---|
| 1 | P1 OSRM routing shipped but undeployable | CONFIRMED | P1 | Fallback is real (`main.ts:447-453`); README table has no `OSRM_URL`; stronger than claimed — the Bicep provisions OSRM and never wires it |
| 2 | P2 "no npm dependencies" is false | CONFIRMED | P2 | `persistence.ts:3` statically imports `pg`; Dockerfile ships the 14-package closure; a test proves the API needs it |
| 3 | P2 COD/receipts documented as not built | CONFIRMED-DOWNGRADE | P3 | `SYSTEM.md:162` is false and `cash_receipts` exists, but COD-as-a-capability (sender payout) is still absent and both systems are Postgres-gated |
| 4 | P2 52/163 routes have no client | CONFIRMED-DOWNGRADE | P3 | Count is exact and 11 spot-checks found zero client refs; but ~8 are server-to-server/back-office by design and most are 409 on SQLite — audit cost, not user harm |
| 5 | P2 WP17 says destination change is OFF | CONFIRMED | P2 | `WP17.md:9` says OFF; the routes are live on SQLite (`destination-change.ts:63-156`) with no flag; CAPABILITY-MAP:47 says Built |
| 6 | P2 VAPID `sub` defaults to the Railway host | CONFIRMED-DOWNGRADE | P3 | Both copies are real (`main.ts:894`, `worker.ts:203`) and undocumented; worker copy is unreachable and provider rejection is speculative |
| 7 | P2 worker hard-codes `Urgency: high` | CONFIRMED-DOWNGRADE | P3 | `worker.ts:202` still hard-codes high; not a `5f941fd` regression; worker only runs on Postgres, live sender is correct |
| 8 | P2 booking flow needs 2,937 lines + ten docs | CONFIRMED-DOWNGRADE | P3 | Duplication is currently byte-identical and no live defect exists; doc index gap is real, failure scenario is a future edit |
| 9 | P3 four docs say native push is not implemented | CONFIRMED | P3 | Claims present at README:234, SYSTEM:143, CAPABILITY-MAP:32, SPEC-offer-alerts:43 (R5 cited :9); "native still polls" is true on SQLite |
| 10 | P3 dead duplicate quote helpers | CONFIRMED | P3 | `quotes.ts:279/284` have zero importers; `consumeQuote` throws a raw `Error` |
| 11 | P3 cash formula omits promo credit | CONFIRMED | P3 | `SPEC-cash-settlement.md:28` omits discounts; `money.ts:5` subtracts them; API row also omits `discountsCents` |
| 12 | P3 specs cite two missing files | CONFIRMED | P3 | `src/pricing.ts` and `REVIEW-NOTIFICATIONS-2026-10-08.md` do not exist; specs cite both |
| 13 | P3 SQLite creates two Postgres-only tables | CONFIRMED | P3 | `sqlite-schema.ts:180/:189` create them; `quotesAvailable` returns false on SQLite; no SQLite reader |
| 14 | P3 screenshots predate the destination UI | CONFIRMED | P3 | `docs/screens/README.md:3` says 2026-10-28; PNGs are 10-28; `58be2dc` is 10-29 |

No KILLs. The factual findings survived; the severity errors are almost all
"Postgres-gated path treated as if it were live".

## Kills and downgrades (detail)

### 3 — COD/receipts: real docs falsehood, wrong governance story, P2 → P3

**Claim that must hold:** the two launch-readiness documents say the money-collection
records do not exist, while code implements them.

**At HEAD:** true for `docs/SYSTEM.md:162` — "Per-order fare collection, refunds and
shift reconciliation are not implemented." `ledger.ts:125-131` creates a `cash_receipts`
row with `due_minor = price_minor - discount_minor` and `collect()` at `:145`
records partial/full collection. `payments.ts:106-114` creates `merchant_cod`,
collects it, and remits it with a payout reference.

**Why it fails as written (two sub-claims):**

1. *"The owner's explicit 'not built' decision for COD is silently reversed."* It is not.
   `CAPABILITY-MAP.md:49` gives the reason: "needs a sender payout ledger". `remitCod`
   (`payments.ts:114`) writes a free-text `payout_ref`; there is no sender ledger, no
   payout, no refund path. The capability the owner declined is still absent. What exists
   is the collection record, which is exactly what `SYSTEM.md:162` wrongly denies.
2. *"Someone completes the Postgres cutover … a finance admin discovers the routes."*
   The Postgres path is not one migration away. `server/db/runtime.ts:20-21` throws at
   boot unless `NODE_ENV=test && WIND_POSTGRES_TEST_ONLY=1` (loopback only) or
   `WIND_POSTGRES_STAGING=1` with `sslmode=verify-full`. `paymentsAvailable`
   (`payments.ts:32-36`) additionally needs migration 17; `ledgerAvailable`
   (`ledger.ts:14-18`) needs migration 16. Neither gate opens on the documented
   deployment, and no client calls either route (finding 4).

**What the reviewer should have seen:** the false sentence is `SYSTEM.md:162`, not the
CAPABILITY-MAP row; the risk is documentation truth, not a reachable finance surface.
The fix is still right (delete or explicitly gate), but it is P3, and the COD row should
be left as "not built" with a note that a collection prototype exists.

### 4 — 52 dead routes: count right, "unreachable" overstated, P2 → P3

**Claim that must hold:** 52 registered routes have no caller in `src/**` or `public/**`.

**At HEAD:** the total is exactly 163 (90 in `main.ts` + 73 across `server/domain/*.ts`).
Spot-checked with exact substrings over `src/**` and `public/**`:

`/driver/eligibility` 0, `/admin/eligibility` 0, `/support/cases` 0,
`/admin/approvals` 0, `/cash-receipt` 0, `/pickup-check` 0, `/custody` 0,
`/objects` 0, `/driver/ledger` 0, `/admin/ledger` 0, `/push/native/preferences` 0,
`/orders/${id}/arrive` 0, `/orders/${id}/dispatch/retry` 0.

The client builds order actions as explicit strings (`src/app/order/[id].tsx:185-503`:
`/schedule`, `/cancel`, `/advance`, `/exception`, `/release`, `/rate`, `/dispute`,
`/sos`, `/share`), so a dynamic helper is not hiding a caller. `/api/offers/:uuid/decline`
is genuinely uncalled — the client only offers and accepts
(`src/app/driver/index.tsx:53,79`).

**Why it fails as written:** "unreachable" is wrong for the by-design headless routes:
`POST /api/payments/webhook` is server-to-server, and the finance/ops routes
(`/admin/ledger/*`, `/cod/remit`, `/admin/approvals`, `/admin/staff-actions`,
`/support/cases`) are back-office surfaces that were never meant to have an app screen.
The remaining accidental dead code is still substantial, but the user-facing harm is
zero and most of it returns `409 *_unavailable` on SQLite (`ops.ts:28`,
`payments.ts:47`, `ledger.ts:25`, `resource-scope.ts:183`, `private-objects.ts:48`,
`eligibility.ts:33`). This is an inventory/audit tax, not a P2 runtime defect.

### 6 — VAPID subject: real string, speculative impact, P2 → P3

**Claim that must hold:** both senders default `sub` to a decommissioned Railway origin.

**At HEAD:** `main.ts:894` captures
`process.env.WIND_PUSH_SUBJECT ?? 'https://wind-production-72aa.up.railway.app'` once at
module load; `worker.ts:203` repeats the literal at every send. `WIND_PUSH_SUBJECT`
appears in no README row, no `.env.example`, no Bicep env. The drift is real.

**Why it is P3:** the live API copy is wrong metadata on every push, not a delivery
failure — RFC 8292 treats `sub` as a contact URI, and push services do not resolve it.
The worker copy, where the two-value split actually bites, cannot run in production
(`worker.ts:221` requires `WIND_DATABASE_URL`, and Postgres is boot-gated at
`runtime.ts:20-21`). "Decommissioned" is also unverified: the repo says the live app no
longer calls Railway and the backup task is broken, not that the host is gone.

### 7 — Worker urgency: real defect, inactive path, P2 → P3

**Claim that must hold:** `URGENT_KINDS` is the single urgency authority but the durable
sender ignores it.

**At HEAD:** true — `worker.ts:202` is
`headers:{TTL:String(ttl),Urgency:'high',...}`. `main.ts:918` correctly computes
`URGENT_KINDS.includes(kind) ? 'high' : 'normal'`. Note the worker's `webPush` receives
only `(subscription, message, ttl)`; the kind is in the JSON payload, so the fix needs a
parameter, not just a lookup.

**Why it is P3:** `git show 5f941fd -- server/worker.ts` shows the hard-coded header was
not touched by the commit — it is not a regression. And the worker only starts with
`WIND_DATABASE_URL` (`worker.ts:221`), i.e. on the gated Postgres staging path; the live
SQLite sender is the correct `main.ts` one. The finding's own scenario ("retried by the
worker at 02:00") requires that cutover.

### 8 — Booking-flow doc: true inventory, no present defect, P2 → P3

**Claim that must hold:** the booking flow is spread over a 2,937-line file and ten docs,
with duplicated validation that already diverges.

**At HEAD:** the size is exact (`main.ts` is 2,937 lines). The promo block is duplicated
at `main.ts:1208-1218` and `:1276-1286`; both currently apply the same
`promoFor` → `expectedDiscount` → `max_uses`/`per_customer` checks. The partner path at
`:1408` sends no promo, as claimed.

**Why it is P3:** nothing diverges today; the failure scenario is a hypothetical future
edit in one branch only. The missing `docs/BOOKING-FLOW.md` and the unindexed 39 WP docs
are real documentation debt, but no user or operator is harmed now.

### 1 — OSRM: CONFIRMED at P1, but for a different reason than R5 gives

The readiness report **does** disclose the gap: `release-readiness-2026-10-29.md:42`
says the inspected VM has "no configured `OSRM_URL`". So the "operator surprise" premise
is weaker than R5 implies. Three things keep it at P1:

1. The disclosure is one clause in a VM-config paragraph; it does not say that every
   quote and every dispatch ETA is a fallback estimate, and no remediation is attached.
2. `CAPABILITY-MAP.md:39` still says "**Shipped 2026-10-05** … private self-hosted OSRM
   service" while `CAPABILITY-MAP.md:68` lists `routing-eta` as provider-gated. The
   readiness report did not correct the capability register.
3. The gap is also in infrastructure-as-code, which R5 did not open:
   `infra/main.bicep:345-354` creates an internal OSRM Container App on port 5000, but
   the API env block at `:309-320` never sets `OSRM_URL` and the worker module at `:328-343`
   passes no env at all. The stack provisions the router and cannot use it.

"Silent" is also slightly overstated: the price response carries `estimated: !trip`
(`main.ts:1035-1036`), the booking screen prefixes minutes with "±" (`book.tsx:178`), and
`docs/implementation/contracts/config.json:121` documents `OSRM_URL` and the "disclosed
estimated quote" behavior. The fallback is disclosed to the customer, not to the
operator. That is a monitoring gap, not a hidden one.

## Upgrades

### U1 (from finding 1) — the Azure stack cannot boot the API or the worker at all

This is stronger than the OSRM omission and was missed by every reviewer.

- `server/main.ts:57-61`: in production the API throws unless `DB_PATH` is absolute,
  `SUPPORT_CONTACT` is non-empty, and `WIND_IDENTITY_MODE` is set.
- `infra/main.bicep:309-320`: the API env supplies `HOST`, `PORT`, the three Entra vars,
  the two ACS vars and `WIND_TRUST_PROXY` — none of the three required values. No volume
  is mounted either, so there is nowhere to put a persistent SQLite file.
- `infra/main.bicep:328-343`: the worker module is invoked with no `environmentVariables`.
  `server/worker.ts:221` throws `Durable worker requires explicitly gated PostgreSQL`
  without `WIND_DATABASE_URL`.

Result: the Bicep stack's API fails at module load and the worker crash-loops. The
readiness report records the symptom ("Azure's unavailable page") without the cause.
This is a P1 for anyone who treats `infra/main.bicep` as the deployment path.

### U2 (from finding 5) — destination change is hard-gated to SQLite

`server/domain/destination-change.ts:63`:
`const sqliteOnly = () => { if (db.backend !== 'sqlite') fail(409, 'destination_unavailable'); };`
Every one of the four routes begins with it (`:66`, `:104`, `:128`, `:156`). The order
column it depends on, `commission_rate`, is written only on SQLite
(`main.ts:1799,1827,1878`) and is listed in `migrate.ts:19 SQLITE_ONLY_COLUMNS`.

So the 29 October feature is live on the legacy backend and dead on the backend every
other WP targets. Neither WP17 ("OFF") nor CAPABILITY-MAP ("Built") is operationally
correct: it is ON for SQLite users and OFF after the cutover, with no flag either way.
That sharpens R5's documentation finding into a release-ordering problem.

## Contradictions between reviewers

### B1 — "The server's only price floor is `< 0`" (R3) vs R1's commission-zero finding

**R3 is right, and R1 independently confirms the mechanism.** `main.ts:2688-2690`:

```ts
const n = Number(value);
if (!(key in defaultSettings) || !Number.isFinite(n) || n < 0 ||
  (fractionSettings.includes(key as keyof Settings) && n >= 1)) fail(400, 'invalid_setting');
```

`0` is accepted for every price and for commission; only negatives and fractions ≥ 1 are
rejected. R1's P3 "`minorUnits(0)` throws" is the same hole viewed from the Postgres
quote branch (`main.ts:1061`, `quotes.ts:58-63`). They are not contradictions, and the
severity split is justified by reachability: R3's zero fare is live on SQLite; R1's 500
needs the gated Postgres quote path. The final report should merge them as one
settings-validation finding with two backend-specific symptoms.

### B2 — R1 "the ledger stops at import" vs R5 "COD and per-order receipts are implemented"

**Both true; they describe different subsystems.** `postJournal` has exactly two
occurrences in `server/**`: its definition (`ledger.ts:40`) and the call inside
`importLegacy` (`ledger.ts:73`). `collect()` (`ledger.ts:145`) writes `cash_receipts` and
`cash_receipt_events` only; it never posts a journal. `merchant_cod` is likewise outside
the ledger. R5's phrase "per-order fare receipt in `ledger.ts`" is file-location, not
ledger membership. R1's finding stands unchanged: the double-entry tables are an
import-time snapshot; the receipt/COD tables are a third record that the ledger cannot
see.

### B3 — R1's remittance deadlock vs R3's "admin cash commits on one tap"

**R1 is right; R3 describes the same surface from the wrong end.** The admin control
(`POST /api/admin/cash/remittance`) inserts a `pending` row (`main.ts:2465`), and
`owedCents` counts only `status='confirmed'` remittances (`main.ts:2407`). Only
`POST /api/driver/cash/:id/confirm` can flip it (`main.ts:2428-2434`). The UI says so
(`src/app/admin/cash.tsx:13`: "Handovers wait for the driver's confirmation") and the
server caps the amount at `owedCents - pendingCents` (`main.ts:2463`), so R3's "edited to
500 → the ledger says the driver paid 500" cannot happen: it returns 400
`invalid_amount`, and even a valid remittance does not reduce the debt until the driver
confirms.

R3's finding survives only for **adjustments**, which insert as `confirmed`
(`main.ts:2466`) and can reduce a debt by up to 10,000 ILS with one tap — which is exactly
R1's "single admin can forgive 10,000 ILS" finding. So: R1 P2 stands; R3's cash half is
a P3 (or a duplicate of R1) with the mechanism corrected; the dispute-credit half of R3's
finding (minting a promo on one tap) stands.

### B4 — R2's "any driver reads any searching order" vs R1's dispatch/eligibility findings

**Different code paths; both are right about their own.** R2's target is
`ResourceScope.getScope` (`resource-scope.ts:250-256`): a read endpoint that admits any
`driver` when `order.status === 'searching'` and never consults `servesFor` or
`enabledServices`. R1's targets are `Dispatch`/`Eligibility` (`dispatch.ts`, `eligibility.ts`),
which filter by measured capability, seats, equipment and `servesFor` before offering.
R2 is not describing a dispatch bypass and R1 is not defending `getScope`.

The reachability caveat matters: `requireAvailable` (`resource-scope.ts:183`) returns 409
on SQLite, and the leaked fields require a declared scope row (migration 15). So R2's
finding is real but Postgres-gated, exactly like R1's ledger findings.

### B5 — "The API runtime has no npm dependency tree": TRUE or FALSE?

**FALSE.** `server/db/persistence.ts:3` is a static top-level import:

```ts
import { Pool, types, type PoolClient, type PoolConfig } from 'pg';
```

`scripts/runtime-dependencies.mjs:19` seeds its copy queue with `pg`; the locked closure
is 14 packages (`pg`, `pg-cloudflare`, `pg-connection-string`, `pg-int8`, `pg-pool`,
`pg-protocol`, `pg-types`, `pgpass`, `postgres-array`, `postgres-bytea`, `postgres-date`,
`postgres-interval`, `split2`, `xtend`). `Dockerfile:28` copies that tree into the runtime
image. `tests/runtime-dependencies.test.mjs` proves the packaged API cannot boot without
it and prints "Packaged API boots with locked pg dependencies". R4's `npm ls`/`npm audit`
clean-list is about the developer tree and does not bear on this; R5 is right, and this
is the single most testable documentation falsehood in the panel.

### B6 — R5's "the gate is green" vs R4's "the gate looks at the wrong files"

Not a contradiction, but they must be read together: R5's 78 passing suites is the same
hardcoded list R4 shows is a subset of `tests/**`. R5's clean bullet "no test suite in
`scripts/run-tests.mjs` was removed" is true and does not rebut R4. The final report
should not cite "78 suites passed" as coverage evidence.

### B7 — R5's clean list on account deletion vs R2's deletion finding

R5's "account deletion clears email/phone/pins/messages … so my suspicion was wrong"
is narrower than it sounds. `deleteAccount` (`main.ts:722-750`) does not touch
`order_disputes.reason` or `safety_incidents.note`; R2's P2 stands. This is an overbroad
clean-list claim, not a contradiction.

## Severity calibration across the panel

1. **R2 P1 (XFF spoofing) rests on a stack that cannot boot.** The only in-repo evidence
   that production sets `WIND_TRUST_PROXY=1` is `infra/main.bicep:317`, but that API
   container fails at startup for missing `DB_PATH`/`SUPPORT_CONTACT`/`WIND_IDENTITY_MODE`
   (U1), and the readiness report names the VM, not the Container App, as live. The code
   defect is real (leftmost XFF at `main.ts:2779`), and the README itself says the proxy
   must overwrite `X-Real-IP`; until the live VM's env is inspected, this is P1 for the
   IaC path and P2 for production.
2. **R1 P3 (commission 0 → 500) vs R3 P1 (blank price → ₪0).** Not inconsistent once
   reachability is stated: SQLite vs gated Postgres. Keep both, but present them as one
   finding; otherwise a reader sees the same input rated P1 and P3.
3. **R5 P2 (52 dead routes) vs R5 P3 (two dead tables).** Same class of defect, two
   severities. Both are P3.
4. **R3 P2 (admin cash one tap) vs R1 P2 (10k forgiveness).** If R3 keeps the cash
   remittance claim it duplicates R1 and is wrong; narrow it to adjustments/credits, or
   drop it and cite R1.
5. **R5 P2 (worker urgency) vs R1 P2 (worker `onOffer` missing).** Both are inactive
   worker-only paths. The asymmetry is defensible (an unnotified offer loses the job; a
   high-urgency push only wakes a phone), but both should state the
   `WIND_DATABASE_URL`/Postgres gate in the finding header.
6. **R2 P2 (Entra nonce) vs R2's own statement that `entra_replay` blocks replay.** A
   decorative control with the real control present is P3, not P2.
7. **R4's three P1s are release-confidence findings, not production-safety findings.**
   They are correctly P1 for the gate, but the merged report must not rank them beside
   R1/R2's runtime P1s without saying so.
8. **R5 P2 (VAPID) vs R2's P2s.** Wrong push metadata is less severe than a deletion
   privacy gap or an unauthenticated DB-lock amplification. P3 is the right rung.

## Genuinely missed (max 5)

1. **The Bicep stack cannot start (P1).** `infra/main.bicep:309-320` omits the three
   production-required env vars asserted at `server/main.ts:57-61`; `:328-343` gives the
   worker no `WIND_DATABASE_URL`, which `server/worker.ts:221` requires. Quote:
   `if (!process.env.DB_PATH || !isAbsolute(process.env.DB_PATH)) throw new Error('Production requires an absolute DB_PATH on a persistent local volume');`
2. **The OSRM Container App is provisioned and never referenced (P1).**
   `infra/main.bicep:345-354` creates `acaOsrm` on `targetPort: 5000`; the API env at
   `:309-320` has no `OSRM_URL` and the `acaOsrm` resource is never read again. The
   routing service exists only to consume CPU.
3. **Postgres cannot be reached in production without a code-adjacent flag (calibration
   fact, P2).** `server/db/runtime.ts:20-21`:
   `if (process.env.NODE_ENV !== 'test' || process.env.WIND_POSTGRES_TEST_ONLY !== '1') throw new Error('PostgreSQL API cutover is gated on WP03 schema/import parity; ...')`.
   Every "on the Postgres cutover" finding in R1/R2/R5 is therefore latent twice over.
4. **Destination change is SQLite-only and dies at the cutover (P2).**
   `server/domain/destination-change.ts:63`: `const sqliteOnly = () => { if (db.backend !== 'sqlite') fail(409, 'destination_unavailable'); };`
   and `migrate.ts:19` lists `commission_rate` as a SQLite-only column. The newest
   shipped feature is the one feature the target backend cannot run.
5. **A partially collected COD can never be remitted (P3, dormant).**
   `server/domain/payments.ts:114`: `if (row.status !== 'collected') this.fail(409, 'cod_unavailable');`
   while `collectCod` (`:113`) can leave a row `partial` forever. If the recipient pays
   part and refuses the rest, the collected cash has no finance-side record — which
   contradicts R1's clean-list claim that "`collectCod` / `remitCod` … transitions are
   correct".

## What each reviewer got RIGHT that matters

- **R5 (this adjudication):** the `pg` falsehood is proven by a test, not an inference;
  the 163-route inventory is exact; the WP17/CAPABILITY-MAP conflict is real; the OSRM
  fallback and the missing README row are real. Keep findings 2, 5, 10, 11, 12, 13, 14
  almost verbatim.
- **R1:** the refund outcome mapping (`payments.ts:100-101`) and the single-caller
  `postJournal` (`ledger.ts:40,73`) are the strongest money findings in the panel; the
  driver-only remittance decision (`main.ts:2428-2434`) is exactly right and corrects R3.
- **R2:** the `getScope` `searchingDriver` bypass (`resource-scope.ts:253-254`) and the
  deletion free-text gap (`main.ts:722-750`) are real at HEAD; the `scryptSync` path is
  the best unauthenticated-DoS finding.
- **R3:** the settings floor (`main.ts:2688`) and the booking-pending deadlock
  (`book.tsx`) are real; the cash half of the admin finding is not.
- **R4:** its selection-layer findings are the reason R5's "gate is green" cannot be
  used as coverage evidence. I did not re-run its CI claims; they are outside this
  assignment and do not conflict with anything above.

## Net: what survives

- **P1:** OSRM cannot be enabled by the documented deploy path, and the IaC provisions it
  without wiring it. Fix the README, the capability map and `infra/main.bicep:309-320/345`.
- **P1 (new):** the Bicep API/worker cannot boot as written.
- **P2:** "no npm dependencies" is false (14 `pg` packages, boot-tested); WP17 says a live
  capability is OFF; the Postgres cutover is boot-gated and every Postgres finding is
  latent until that flag changes.
- **P3:** COD/receipt docs, 52 headless routes, VAPID `sub`, worker urgency, booking-flow
  docs, native-push wording, dead quote helpers, cash formula, missing spec files, dead
  SQLite tables, stale screenshots.
- **Corrected away:** R3's admin-remittance scenario (capped and driver-confirmed), and
  R5's "owner decision reversed" premise for COD (the payout ledger is still missing).
