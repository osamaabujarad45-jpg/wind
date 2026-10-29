# Multi-agent code and quality review — 29 October 2026

Eight agents on `DeepSeek V4.1 Flash 1017` (variant `max`), two rounds:
five independent reviewers on separate lenses, then three adversarial critics whose job was to kill
each finding against the code at HEAD. Findings below carry the **post-critique** severity, not the
reviewer's original claim.

- Repo: `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship`
- Reviewed at: `b7d3c97` (HEAD moved from `ae70ab5` to `5f941fd` to `b7d3c97` during the run; every citation was re-read at HEAD)
- Scope: `src/` (9.6k lines: 3.5k `.ts` + 6.0k `.tsx`), `server/` (7.8k), `tests/` (130 `.mjs` files), `scripts/`, `infra/`, `.github/`, 33 `SPEC-*.md`
- Nature: source review and adjudication. No device, no live database, no Play upload, no load test.
- Automated pass: every count in this report (`78` listed suites, `69` of them `*.test.mjs`, `130` test
  files on disk, `50` persistence files, `163` routes, `886` copy keys, `17`/`33` findings) was re-derived
  from the tree at write time. Eight numbers from the first pass were wrong and are corrected inline; they
  are listed in "Corrections to reviewer claims".

Severity distribution after adjudication:

| Severity | Count | Meaning |
|---|---|---|
| P1 | 6 | Fix before enabling workloads; none is a live outage today |
| P2 | 17 | 12 are live on the shipped SQLite path; 5 are behind the Postgres gate |
| P3 | 33 | Real but small, or dormant; batch them |
| Killed | 1 | Reviewer claim that does not survive contact with the code |
| Downgraded | 12 | Real, but the first pass overstated reach or severity |

---

## Verdict

The core of this app is better engineered than its surface suggests. Object-level authorization is
genuinely solid, the order-row locking is correct, booking is command-logged and replayed, the cash
ledger is append-only, and the test files themselves do not lie. Three things break that picture:

1. **The IaC gate is documented, but its instructions are incomplete.** `enableWorkloads` defaults to
   `false` and `deploy.md:3` blocks activation outright — correct and honest. What is wrong is that the
   owner-gate comment names two missing bindings while five are missing, and an operator who does exactly
   what the doc says still crash-loops. This is the only P1 that blocks reality rather than a future cutover.
2. **Five of the seventeen P2s are dormant behind a gate that literally refuses to open in production**
   (`server/db/runtime.ts:20-21`): the money bugs (P2 #1–#4) and the scope exposure (#5). The other twelve
   are live on the shipped SQLite path right now, reachable with an ordinary account. The first pass
   blurred this, calling the whole P2 block "latent" — that was the single most misleading line in the draft.
3. **The safety net's selection layer, not its assertions, is the false green.** `npm test` runs a
   hand-maintained list; the entire Postgres/outbox half never runs in CI; the Docker guard cannot see
   nested `server/domain/*.ts` imports — which is the exact 5 October outage shape.

There is no P0. Nothing found is reachable by an unauthenticated internet attacker for money or data,
with one caveat: the credential-stuffing finding hinges on a proxy hop that is not in the repo. But
**twelve of the seventeen P2s need no special access beyond a normal account** — an admin account for
several, a customer or driver account for the rest. They are ordinary logged-in-user bugs, not theoretical
ones.

---

## P1 — fix before enabling workloads

### 1. The IaC gate names two missing bindings; five are missing, so following the doc still crash-loops
`infra/main.bicep:292-343`, `server/main.ts:57-61`, `server/worker.ts:221`

**Calibration first:** this is *not* a live outage. `enableWorkloads` defaults to `false`, and
`docs/operations/deploy.md:3` states plainly that cloud activation is blocked and must stay so until the
runtime/migration/restore gates are evidenced. `infra/main.bicep:292` repeats it ("Owner gate: API and
worker still need a reviewed Key Vault database URL binding..."). The defect is in the *shape of the gate*:
it is documented as a missing DB binding and registry pull, so an operator who supplies exactly what the
docs name still gets a crash-loop, because three other things are also missing and no doc mentions them.
The gate is real; its instructions are incomplete.

The API container receives `HOST`, `PORT`, three Entra vars, two ACS vars and `WIND_TRUST_PROXY` —
and **no** `SUPPORT_CONTACT` and **no** `WIND_IDENTITY_MODE`. In production that throws at module load:

```ts
if (!process.env.SUPPORT_CONTACT?.trim()) throw new Error('Production requires a real SUPPORT_CONTACT');
if (!['operator-verified', 'self-service'].includes(process.env.WIND_IDENTITY_MODE ?? '')) throw new Error(...);
```

The worker module is invoked with no `environmentVariables` at all, and `worker.ts:221` throws without
`WIND_DATABASE_URL`. Separately, nothing mounts a volume, so `DB_PATH=/data/wind.db` (set in the
Dockerfile) lives inside the container and is destroyed on every revision.

*Correction to the critic's version:* `DB_PATH` is **not** missing — `Dockerfile:32` sets it. The boot
failures are the two identity vars and the worker URL; the volume is a third, independent problem. The
volume gap is also the one item `deploy.md` does not acknowledge: it discusses the OSRM graph share at
length but says nothing about the API needing a `/data` share of its own, so following the doc exactly
still yields an API whose SQLite file dies with the revision.

**Fix:** add `SUPPORT_CONTACT`, `WIND_IDENTITY_MODE` and `WIND_DATABASE_URL` to the module, mount an
Azure Files share at `/data`, and add a boot test that renders the Bicep to env vars and asserts the
three keys are non-empty. Then update the owner-gate comment to list all five gaps, not two.
**Confidence:** HIGH (verified directly; `SUPPORT_CONTACT`/`WIND_IDENTITY_MODE`/`WIND_DATABASE_URL`/
`OSRM_URL` appear in no `infra/` file; `enableWorkloads=false` confirmed at `:11`).

### 2. A blank admin price field saves `0`, and the server's only floor is `< 0`
`src/app/admin/settings.tsx:20,30,46-48`, `server/main.ts:2688-2690`

`typedNumber('')` returns `0`, the form posts every field, and the server accepts `0`. Three distinct
consequences, in rising order of cost:

- `commission: 0` → **pricing breaks, but only after the Postgres cutover.** *Executed and corrected:*
  on the shipped SQLite path `/api/price` returns 200, because `quotesAvailable()` is false and
  `main.ts:1042` returns the legacy base **before** reaching `minorUnits(commissionOn(...))` at `:1061`.
  The 500 the first pass predicted is real, and latent. An order accepted with `commission: 0` stores
  `commission: 0` and completes the accept step normally (probe `E2`).
- `plusPrice: 0` / `proPrice: 0` → `main.ts:2480-2481` writes the plan price from settings, `:2672-2675`
  activates it without re-pricing → **every customer subscribes for ₪0**. *Executed:* a subscription
  created after `plusPrice: 2000` stored `price: 2000` verbatim and activation never re-priced it.
- There is no upper bound either (`settings.tsx:46-48` has no `maxLength`, `main.ts:2688` no ceiling), so a
  fat-fingered `2000` instead of `20` quotes every parcel at ₪2 000.

**Fix:** reject empty and non-finite per key on the client, add a per-key ceiling server-side, and refuse
`minorUnits(0)` at the settings boundary rather than at quote time.
**Confidence:** HIGH on the validation gap (executed: `commission:0` → 200, `plusPrice:2000` → 200,
stored and charged verbatim). MEDIUM on the `minorUnits` 500, which is latent behind the cutover.

### 3. Per-address auth limits are keyed on attacker-chosen headers
`server/main.ts:2778-2780` (same pattern `:1543`, `server/domain/phone-identity.ts:48`), enabled by `infra/main.bicep:317`

The limiter reads `x-real-ip` and the leftmost `x-forwarded-for`, and the production env sets
`WIND_TRUST_PROXY=1`. The leftmost XFF entry is client-supplied by definition. With one fresh value per
attempt, the per-address bucket never fills: unlimited credential stuffing, unlimited OTP attempts
against the phone flows, unlimited reset requests — each still bounded only by the *account* dimension.

**Caveat that decides the severity:** whether the Container Apps ingress overwrites `X-Real-IP` is not in
this repo. The leftmost-XFF half is certain; the `X-Real-IP` half needs one probe.
**Executed (probe P1-3 + control):** 25 registrations with a unique `X-Real-IP` each → **0 × 429**.
The same 25 with one fixed `X-Real-IP` → **5 × 429**. The limiter is present, wired, and bypassable by a
header the caller chooses — the only open question is whether the ingress rewrites it first.
**Fix:** key on the rightmost trusted hop (or the ingress-injected client IP), and never on a header the
client can set. One 6-request probe against the live host settles it.
**Confidence:** HIGH on the code (executed), MEDIUM on the deployed hop.

### 4. `npm test` runs a hand-maintained list, and CI never runs the other half
`scripts/run-tests.mjs:5,88`, `.github/workflows/ci.yml:22`, `tests/deployment.test.mjs:43,46,48`

- The runner holds 78 hardcoded entries (69 `*.test.mjs`). **Three real suites run in neither gate** —
  `db-persistence`, `db-api`, `database-logging` (they are listed in `check-persistence.mjs` but that script
  is in no workflow), plus `azure-infra.test.mjs`, which **nothing** runs: it is absent from both lists and
  is invoked only by hand from `docs/operations/deploy.md`. Any new test file is invisible until someone
  edits the list. Verified by probe: each of the four exists on disk and is absent from `run-tests.mjs`.
- `test:persistence` (50 files, including `outbox.mjs`, `native-push.mjs` and the pg adapter) is in **no**
  workflow, so the `PUSH_KINDS` change shipped in `5f941fd` is ungated. `.github/workflows/ci.yml` runs
  exactly `npm ci`, `typecheck`, `lint`, `npm test`, `npm audit`, `expo export` — verified by reading the file.
- The Docker module-copy guard queues files only when `target.startsWith('src/')`, so it never recurses
  into `server/domain/*.ts`; and its regex `from '(\.{1,2}\/[^']+\.ts)'` only matches single quotes, so a
  double-quoted or dynamic import is invisible even in `server/main.ts`.
  **Verified by isolated probe** (`reports/verify-2026-10-29/probe-guard-isolated.mjs`): running the
  guard's own collection loop against this tree visits **6 files, 0 of them in `server/domain/`**, and
  collects only `src/model.ts` + `src/map-math.ts`. Injecting an import of the uncopied `src/copy.ts` into
  `server/domain/statistics.ts` is collected **not at all**, while `Dockerfile` never copies that file —
  so the guard stays green through exactly the 5 October failure shape. Five domain modules already import
  `src/model.ts`; they only pass because `Dockerfile:26` names that one file explicitly.

The current tree is green because no nested file imports an uncopied module yet. That is luck, not a guard.
**Fix:** glob `tests/**/*.test.mjs` instead of listing names; add `persistence` and `docker build` to CI;
make the deployment guard resolve imports instead of regexing them.
**Confidence:** HIGH.

### 5. Road routing is documented as shipped, and the documented deploy path cannot turn it on
`README.md:128-143`, `CAPABILITY-MAP.md:39`, `server/main.ts:447-453`, `infra/main.bicep:345-354`

`OSRM_URL` appears in no deploy document and in no IaC file, and the code silently falls back to
straight-line distance × 1.3. The Bicep even provisions an internal OSRM Container App on port 5000 and
then never references it. Every booking on that stack gets a fallback line and ETA, and checkpoint-route
fares are wrong.

Mitigating, and why this is not P0: the price response carries `estimated: !trip` (`main.ts:1035`)
and the booking screen prefixes minutes with "±", so the customer is told the number is an estimate. The
*operator* is not.
**Fix:** set `OSRM_URL` in the API env, and add a readiness check that fails when routing is configured
off in production.
**Confidence:** HIGH.

### 6. Five findings are latent behind a gate the production runtime refuses to open; twelve are not
`server/db/runtime.ts:20-21`

```ts
if (process.env.NODE_ENV !== 'test' || process.env.WIND_POSTGRES_TEST_ONLY !== '1')
  throw new Error('PostgreSQL API cutover is gated on WP03 schema/import parity; ...');
```

The findings tagged **(PG)** below — refunds, COD, ledger journals, card-vs-cash, resource-scope
`servesFor` — are unreachable until that gate opens. That is a **release-order** problem, not a live-bug
problem: the cutover cannot be flipped without these fixes, and the code comments still claim the opposite.

The other twelve P2s are *not* gated. They live in `server/main.ts` on routes that run on SQLite today:
an admin takeover primitive (`editUser`), a blocked driver being re-activated with parcels in custody,
a plaintext password returned to support, `scryptSync` stalling the event loop, a stranded cash debt, a
double-chargeable subscription, and a job board one customer can freeze. Calling the whole P2 block
"latent" — which this report did in its first pass — understated live risk by a wide margin.

Distinguishing the two is the point of this P1: the gated five must be fixed before the cutover, and the
ungated twelve should be fixed before the next release for reasons that have nothing to do with Postgres.

---

## P2 — real defects

**(PG)** = behind a Postgres-only gate (`paymentsAvailable` / `ledgerAvailable` / `scopeAvailable`, all of
which return `false` on any non-Postgres backend), so unreachable on the shipped SQLite path.
Rows without **(PG)** are live today.

### Money and ledger

| # | Finding | Where |
|---|---|---|
| 1 (PG) | A refund whose provider outcome is `pending`/`timeout` is stored as terminal `rejected`; the cap is then released and a second HTTP refund of the same amount passes | `server/domain/payments.ts:97-101`, cap `:89` |
| 2 (PG) | The double-entry ledger is an import-time snapshot. `postJournal` has exactly one caller (`importLegacy`), while `/api/driver/ledger`, `/api/admin/ledger` and `projectedExposure` keep reading that stale sum. The cash cap is dead (`cashCapActivated=false`) and would under-count if switched on | `server/domain/ledger.ts:66-97` |
| 3 (PG) | A partially collected COD (`status='partial'`) can never be remitted: `remitCod` requires `collected`, and nothing transitions `partial` | `server/domain/payments.ts:113-114` |
| 4 (PG) | Card capture and cash settlement of the same order are unlinked: an order paid by card can still be settled as cash | `server/domain/ledger.ts:125-133`, `payments.ts:50-53` |

### Authorization and identity

| # | Finding | Where |
|---|---|---|
| 5 (PG) | Any driver can read any *searching* order's `declaredValueMinor` and `sourceRef` (a cross-tenant Souq reference). The query skips `servesFor`/`enabledServices`, `order_releases`, and `viewer.status='active'` — so a driver who released the job, or a pending driver, still reads it | `server/domain/resource-scope.ts:250-256` |
| 6 | Support password reset returns a **plaintext password** in the response and writes no audit row — unlike every other sensitive admin action | `server/main.ts:2631-2644` |
| 7 | `editUser` lets any admin rewrite a victim's phone/email, clear verification and kill sessions with **no** `security_events`/`staff_actions` row. A stronger takeover primitive than the password route, and it falsifies "every other admin action is audited" | `server/main.ts:2552-2588` |
| 8 | `POST /api/admin/users/:id/approve` has no `status` predicate: one call re-activates a driver blocked for a safety incident, skipping the `carrying_parcels`/`recovery:'return'` guard that blocking enforces — potentially with parcels still in custody | `server/main.ts:2615-2621` |
| 9 | Password hashing is `scryptSync` on the single event loop, on every unauthenticated login/reset/register. *Measured: **26 ms per hash** on this host* — a modest concurrent flood stalls all traffic | `server/main.ts:178-191`, `:540`, `:669` |
| 10 | `checkPassword` throws a 500 on a stored hash without a `salt:hash` separator — a corrupt row turns a login into a server error | `server/main.ts:183-186` |

### Marketplace and money operations

| # | Finding | Where |
|---|---|---|
| 11 | A pending cash remittance can only be decided by the driver. Block the driver (or they lose their phone) and `cashSettled` blocks deletion and role change **forever** — no admin route exists | `server/main.ts:2428-2433`, `:2410-2412`, `:2742` |
| 12 | **Latent, not live.** A double-tapped "Subscribe" *would* create two pending subscriptions — `subscriptions` has **no unique index** (verified: `sqlite_master` returns `[]`), and the handler is a check-then-insert with no transaction. But **760 concurrent attempts with the mutex saturated produced zero duplicates**: `sqliteLock()` serialises every statement in one process. The missing constraint is the defect; it opens on Postgres or two replicas | `server/main.ts:2476-2481`, `server/db/persistence.ts:122-135` |
| 13 | **Verified by execution.** One customer can freeze the driver job board: 55 spam orders were accepted (no per-customer quota), `GET /api/jobs` returned exactly 50, and a later real order was **invisible**. Searching orders are never swept, so they hide every real job until an admin cancels by hand | `server/main.ts:1310-1313`, `:1773-1776` |
| 14 | **Verified, but bounded by arithmetic rather than policy.** One admin can forgive debt with no second approver (`financial_approvals` does not exist on SQLite at all). The damage is capped by the `abs(amount) ≤ 1_000_000` guard at `:2446` **and** the no-negative-balance rule at `:2464`: with ₪13 500 owed, one −₪10 000 adjustment succeeded, a second was rejected 400. What is missing is the approver, not the ceiling | `server/main.ts:2443-2446`, `:2464` |

### Backend cutover and release

| # | Finding | Where |
|---|---|---|
| 15 | **Destination change is SQLite-only.** All four routes start with `sqliteOnly()` and the column it needs (`commission_rate`) is in `server/migrate.ts:19 SQLITE_ONLY_COLUMNS`. The newest shipped feature is the one feature the target backend cannot run — so neither WP17 ("OFF") nor `CAPABILITY-MAP` ("Built") is operationally true | `server/domain/destination-change.ts:63`, `server/migrate.ts:19` |
| 16 | No CI job builds the Docker image that is actually deployed; the Dockerfile is only regex-checked, so `.dockerignore`, heap and `npm ci` failures surface at deploy time | `.github/workflows/ci.yml:24` |
| 17 | Booking is not idempotent unless the client volunteers a `requestId`; the shipped client does, but the API contract allows omission and the partner path never sends one | `server/main.ts:1330-1335` |

---

## P3 — batch these

**Correctness (cheap, do with the P2s):** proof-lock `reattempt` leaves the five failures so the parcel
can never complete (`main.ts:1999` vs `:2001-2003`); rating is a check-then-write with no `WHERE rating IS
NULL` (`:1512`, `:1519`); reschedule *does* check `searching` at `:1497` — **executed and refuted**, 40 races
produced no double-success — leaving only a theoretical TOCTOU (read outside the transaction, `UPDATE` at
`:1500` without a status predicate); first-order-promo race
(`:804`,`:810`); `sessions` has no `user_id` index (`postgres-schema.sql:237-240`); `GET /api/orders`
still 4–6 queries per row (`main.ts:248-250`).

**Client:** a saved pending booking is a one-way door — every field locked, no discard, survives sign-out
(`book.tsx:67,252,279`); admin cash/dispute/block commit on one tap with no `confirm()` (`admin/cash.tsx:23`,
`admin/orders.tsx:95`, `admin/users.tsx:111`); Activate/Reject can both be in flight (`admin/subscriptions.tsx:15`);
fixed `lineHeight` with no `maxFontSizeMultiplier` clips Arabic at large OS text (`ui.tsx:166-174`); push
tapped at cold start drops its deep link (`native-push.ts:14`); the driver provider re-renders every
consumer and does two SecureStore reads every 3 s (`driver-work.tsx:312-328`); `scheduleSlots()` runs ~227
`Intl` calls per keystroke (`book.tsx:60`); Arabic strings and "فلسطين" live outside `copy.ts`
(`ui.tsx:287,291`); "use my location" silently wipes the typed landmark (`book.tsx:111`); schedule freshness
is validated on a different value than the one submitted (`book.tsx:208` vs `:232`).

**Tests:** five suites wait a fixed 50 ms for detached push delivery (`push-server.test.mjs:23`, 35 calls in
one file); `presentation.test.mjs:2` re-imports a registered suite so it runs twice; `check-contracts.mjs`
duplicates two more; the URL-decoder DoS regression is enforced by a 3-second wall clock
(`url-decoder.test.mjs:15`); every persistence run creates a Postgres schema and never drops it; four
browser gates share port 4188 and one build dir, so two cannot run at once.

**Release:** no `versionCode` in the repo — `app.json:17`, remote EAS counter, generated project says 1, so
a locally signed release is rejected by Play.

**Docs:** "no npm dependencies" is false (`persistence.ts:3` statically imports `pg`, `Dockerfile:28` ships
its closure); four docs still say native push is unimplemented; WP17 lists destination change as OFF; the
VAPID `sub` default names the decommissioned Railway host (`worker.ts:202` and one copy); the worker
hard-codes `Urgency:'high'` so `URGENT_KINDS` is not "every sender reads this one list"; the cash-settlement
formula omits the promo credit the code subtracts; SQLite creates two Postgres-only tables no SQLite code
can read; 52 of 163 routes have no client caller; two specs cite files that do not exist; screenshots predate
the 29 October UI change.

---

## What the first pass got wrong

This is the part the critique round earned.

**Killed —**
*"Road-report authorization is a deny-list, not an allow-list"* (`main.ts:1723-1725`). `Role` is only
`customer | driver | admin` (`src/model.ts:18`), so `role !== 'customer'` **is** the allow-list. Not a finding.
*(The kill stands, but this report's original justification was wrong: SQLite enforces the set with a CHECK
constraint (`sqlite-schema.ts:14`), PostgreSQL does **not** — `role TEXT NOT NULL` at
`postgres-schema.sql:261`, no CHECK. The allow-list argument survives on the TypeScript type alone.)*

**Downgraded to P3 —**
`/api/ready` taking the SQLite write lock (every SQLite read already serialises on that mutex, the
schema value is hardcoded `3`, and `/api/health?protocol=1` is an equally unmetered DB read); the
phone-recovery flood (cost and noise, not theft); the Entra client-supplied nonce (already nonce-bound
after exchange); account-deletion free text (retained under the anonymised id, not a leak of identity);
COD and per-order receipts (coded but no sender payout ledger, so the owner's "not built" decision is not
reversed — the false sentence is `SYSTEM.md:162`, not the capability map); 52 clientless routes (count
exact, but the webhook and finance/ops routes are headless by design, and 32 of the 73 domain-module
routes are behind a Postgres gate that returns `409` on SQLite — how many of the 52 sit inside those 32
was not verified per route, so treat "most of them are 409" as plausible, not proven); worker `Urgency` (predates `5f941fd`, and the worker cannot run without Postgres); VAPID `sub`
(the rejection is speculative); corrupt-pending-screen deadlock (the shipped `storage.set(key,null)`
deletes the key, so no shipped path writes a record that throws); admin one-tap money actions (the cash
cap at `main.ts:2463` and the driver decision route at `:2428` already exist, and dispute credit is bounded
1..50 — what is missing is a dialog); font clipping (real mechanism, unmeasured threshold); `versionCode`
(real, but Play submission is not imminent).
**Corrections to reviewer claims:**
- R3 said the server accepts a price of `0`. It does — but `minorUnits(0)` then **throws**, so the
  outcome is a 500, not a free ride. The free ride is the *subscription* path, which R3 did not follow.
- R1 said the refund double-pay needs `WIND_BOP_*`. It does not; `WIND_BOP_*` is read and never used.
  The second refund is a second **HTTP** call, and no refund retry exists.
- R5 said COD is implemented. The *collection* is; the *payout* is a free-text `payout_ref`.
- The first pass's "78 suites" overstates coverage: `test:persistence`'s 50 files are in a second list, one
  suite runs twice, and four real `*.test.mjs` files run **zero** times.
- C3's own upgrade said the Bicep "omits the three required env vars". It omits two; `DB_PATH` comes from
  the image. Corrected in P1 #1 above.

**Ten corrections in this final pass** (each re-counted against the tree, not re-read from a report):

| Claim as first written | Actual | Where it was fixed |
|---|---|---|
| P2 = 12, P3 = 24, downgraded = 11 | P2 = 17, P3 = 33, downgraded = 12 | tally table |
| P2 block is "mostly latent behind the Postgres gate" | 5 gated, 12 live on SQLite | tally + verdict + P1 #6 |
| `test:persistence` = 52 files | 50 files | P1 #4 |
| `src/` 8.7k lines, `server/` 9.4k, `tests/` 134 | 9.6k, 7.8k, 130 | header |
| 40 `SPEC-*.md` | 33 | header |
| `DB_PATH` at `Dockerfile:27` | `:32` | P1 #1 |
| `enableWorkloads` "at `:44`" | `:11` | my own draft, fixed before publish |
| `server/db/migrate.ts` | `server/migrate.ts` | P2 #15 |
| `estimated: !trip` at `1035-1036` | `:1035` | P1 #5 |
| "`copy.ts` drift checked mechanically" | true, but only 2 key prefixes are tested | "genuinely good" |

**Four framing corrections of my own:**- P1 #1 is an unfollowable instruction, not a live boot failure. `enableWorkloads=false` and `deploy.md:3`
  mean nobody reaches that crash-loop by accident. Severity holds at P1 because the fix must land before
  anyone tries; the "hard boot failure" label in the tally table was wrong.
- **The biggest one:** treating the P2 block as "latent" inverted the risk. Only #1–#5 are gated; #6–#14
  are ungated `main.ts` routes, and three of them are takeover-shaped (#6 plaintext password to support,
  #7 `editUser` unlogged identity rewrite, #8 approve re-activates a blocked driver). A reader of the draft
  would have deprioritised an admin takeover primitive because it sat under a heading about Postgres.
  Against that: `editUser` is *better* guarded than #7 implies — it re-checks stranded orders inside the
  write transaction (`:2570-2571`) and requires `recovery:'return'` before blocking a driver mid-custody
  (`:2574-2576`). What is missing there is only the audit row, not the guard.
- "`canSee` covers every id-bearing route" contradicted P2 #5. It covers every route that *uses* it; the
  scope route deliberately does not, and that is the finding.
- **The cold-start push finding is stronger than R3 wrote it.** Expo SDK 57's own docs
  (`docs.expo.dev/versions/v57.0.0/sdk/notifications`, "Handle push notifications with navigation")
  show the required pattern as `Notifications.getLastNotificationResponse()` **plus** the listener.
  `src/native-push.ts:14` registers only the listener, so a tap that launches the process is dropped —
  a missing API call, not a race. Verified against the versioned docs, not memory.

---

## Execution pass — what a real server proved

The findings above were re-tested by booting `server/main.ts` on a throwaway SQLite database, registering
real accounts, calling real routes, and reading the rows back. Probes are checked in at
`reports/verify-2026-10-29/`; the full log is `reports/verify-2026-10-29/EVIDENCE.md`.

**Reproduced (19):** P1 #1 (all three boot throws), #2 (settings accept `0` and `2000`; the price is
stored and charged verbatim), #3 (0 × 429 with rotating `X-Real-IP`, 5 × 429 with a fixed one), #4 (guard
visits 6 files, 0 in `server/domain/`), #5 (`estimated:true`, 46.3 km straight-line), #6 (gates return 409);
P2 #6, #7, #8, #9 (26 ms/hash measured), #10, #11, #13, #14; plus the P2 #15 destination route running
**on** SQLite.

**Refuted (4) — the report was wrong:**
- **P1 #2's `minorUnits` 500 does not fire today.** `/api/price` returns 200 with `commission: 0`, because
  `main.ts:1042` returns the legacy base before reaching `:1061`. Real, but latent behind the cutover.
- **P2 #12's double charge does not reproduce** — 760 concurrent attempts, zero duplicates. The missing
  unique index is real; the mutex closes the window in one process.
- **P3's "reschedule never re-checks `searching`"** — it does, at `:1497`. 40 races, no double-success.
- **P3's throttle framing** was measured at 26 ms, not the assumed ~50 ms.

**Corrected reasoning (3):** the killed claim's "CHECK in both schemas" (Postgres has none); P2 #15's
direction (runs on SQLite, 409s after cutover); P1 #4's "four files never run" (three run in
`check-persistence`, which is merely in no workflow).

---

## Fix order

1. **IaC completeness** (P1 #1) — add the three env vars, the `/data` share, `OSRM_URL` (#5), then make
   the owner-gate comment list all five gaps instead of two. Nothing else matters if the gate cannot be satisfied.
2. **Admin settings validation** (P1 #2) — one screen can 500 pricing or zero out revenue.
3. **Selection layer** (P1 #4) — make the gate honest before trusting it to catch the rest.
4. **Auth limiter keying** (P1 #3) — one code change plus one live probe.
5. **The P2 money block** (refund mapping, ledger journal on write, partial COD) — *before* the Postgres
   gate opens, not after.
6. **The three takeover-shaped ungated P2s** (`editUser` audit, approve guard, support-password audit) —
   cheap, need no cutover, and each closes a path to controlling another account.
7. **P3 batch** by area, client first (one-way booking door and admin `confirm()` are user-visible).

---

## What is genuinely good (verified, do not regress)

- `getOrder`'s `canSee` gate (`main.ts:317-324`) is correct and *complete* for what it guards: admin,
  owner, assigned driver, or an active driver whose vehicle serves the service and who has not released
  the job. No IDOR was found in the handlers that go through it. The one id-bearing surface that does
  **not** go through it is `resource-scope.getScope`, and that is exactly P2 #5.
- No SQL injection (parameterised throughout), no cookies and therefore no CSRF surface, no path traversal, no shipped backdoor.
- `BEGIN IMMEDIATE` on SQLite and `FOR UPDATE` on Postgres genuinely serialise `advanceOrder`; `expectedStatus` is enforced inside the transaction.
- Cash entries are append-only, and a double settle is blocked by `WHERE status='pending'`.
- Booking is persisted before it is sent and replayed with one `requestId`; every poll and GPS watch aborts on blur/unmount.
- `copy.ts` has zero key drift: **886 keys in each locale, no key in one and not the other** (verified by
  direct comparison at HEAD, not by the test suite — the two tests that exist cover only the `presence_`
  and `phone_` prefixes, so this is true today but unguarded).
- No test asserts nothing, skips itself, or swallows a failure (checked: zero `.skip`/`.todo` in `tests/`,
  zero empty `catch {}` in the listed suites, and the five assert-free files are `*-support.mjs` helpers,
  not suites) — the problem is what is never *selected*.
- The partner key comparison is constant-time; track limiting and the Entra boot guard hold.

---

## Needs a live probe (cannot be settled from source)

1. Does the Container Apps ingress overwrite a client-set `X-Real-IP`? (decides P1 #3 live vs latent —
   the header keying itself is now **executed and proven bypassable**)
2. Do the `(PG)` findings behave as read, against a real PostgreSQL? The gates were executed and return
   409 on SQLite; their internals were not run. Needs `NODE_ENV=test`, `WIND_POSTGRES_TEST_ONLY=1`, loopback.
3. Font-scale clipping threshold on a real device at 130–200 %.
4. Play's actual reaction to `versionCode 1`.

---

## Report index

| File | Content |
|---|---|
| `reports/review-r1/server-core-correctness.md` | R1: money, state machine, concurrency, migrations |
| `reports/review-r1/authentication-authorization-abuse.md` | R2: authz, sessions, phone/OTP, secrets, PII |
| `reports/review-r1/client-app.md` | R3: routes, booking flow, GPS, RTL, a11y, platform splits |
| `reports/review-r1/safety-net-and-release.md` | R4: tests, runner, CI, EAS/Android, vendored deps |
| `reports/review-r1/docs-vs-code.md` | R5: specs vs code, dead wiring, doc drift |
| `reports/review-r2/c1-cross-critique.md` | Adjudication of R1+R2, plus 5 missed findings |
| `reports/review-r2/c2-client-safety.md` | Adjudication of R3+R4, plus 4 missed findings |
| `reports/review-r2/c3-docs-wiring.md` | Adjudication of R5, cross-report contradictions, 5 missed findings |

*Repo note: HEAD moved `ae70ab5 → 5f941fd → b7d3c97` during the run. `5f941fd` is exactly the 7-file delta
that was uncommitted when the review started; `b7d3c97` drops two unreachable `migrate.ts` guards. This
review did not make those commits. All findings were re-verified after them.*
