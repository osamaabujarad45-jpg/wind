# Documentation vs code review

## Verdict

Code coverage of the documentation is unusually high: every `SPEC-*.md` maps to real code, and the ten headline features named in the brief are implemented with routes, UI and passing tests, not doc-only. The rot is in operational truth: the README's deploy path omits the one environment variable its headline routing feature needs, three documents still call the API dependency-free, the activation register says a shipped feature is OFF, and a third of the registered API has no caller. The push work committed as `5f941fd` is sound except one regression — the worker bypasses the new `URGENT_KINDS` urgency list — and the remaining uncommitted `server/migrate.ts` edit is a safe dead-code removal.

## Findings

### [P1] Road routing is documented as shipped, but the documented deploy path cannot turn it on

- Where: `README.md:128-143` (environment table, no `OSRM_URL`), `README.md:116-120` (docker run, no `-e OSRM_URL`), `CAPABILITY-MAP.md:39` and `CAPABILITY-MAP.md:68`, `server/main.ts:447-453`, `reports/release-readiness-2026-10-29.md:41-43`
- Code:
  ```
  // server/main.ts:447-453
  const dispatch = new Dispatch(persistence, eligibility, fail, async (from, to) => {
    if (process.env.OSRM_URL?.trim()) { ... }
    return straightLineEta(from, to);
  });
  ```
  ```
  // CAPABILITY-MAP.md:39
  | `routing-eta` | ... | **Shipped 2026-10-05** ... private self-hosted OSRM service, solid road line,
  "driver arrives in 3–6 min" on the order and public tracking pages | Infra only (Railway `osrm`) |
  ```
  ```
  // CAPABILITY-MAP.md:68
  6. Provider-gated: `sms-otp`, `digital-payments`, `routing-eta` - only after you pick and contract a provider.
  ```
- Why it matters: the README is the only deploy guide. Its env table lists 13 variables and `OSRM_URL` is not one of them; the one-line `docker run` example passes only identity mode and support contact. The readiness report confirms the live VM has no `OSRM_URL`. The code silently falls back to straight-line × 1.3, so the failure is invisible: `/api/ready` stays green, `/api/health` says nothing about routing.
- Failure scenario: an operator follows README §Deploy on a fresh host → every booking gets a straight-line fare and no road line; `/order/:id` shows no "driver arrives in 3–6 min"; Ramallah→Nablus is charged on the ×1.3 straight-line estimate (~46 km) instead of the 53.3 road km the offer spec measured, so a driver accepts a fare that does not cover the checkpoint detour. Nobody notices until a driver complains.
- Fix: add `OSRM_URL` to the README table and the `docker run` example; add `routing: OSRM_URL ? "osrm" : "estimate"` to `/api/health?protocol=1`; log a startup warning in production when unset; change `CAPABILITY-MAP.md:39` to "code shipped, requires OSRM_URL" and reconcile line 68.
- Confidence: HIGH

### [P2] "No npm dependencies" is false, and it hides the `pg` supply chain

- Where: `README.md:11`, `docs/SYSTEM.md:129`, `REVIEW-2026-10-07.md:50`, `server/db/persistence.ts:3`, `Dockerfile:28`, `scripts/runtime-dependencies.mjs:19`
- Code:
  ```
  // server/db/persistence.ts:3
  import { Pool, types, type PoolClient, type PoolConfig } from 'pg';
  ```
  ```
  // Dockerfile:28
  COPY --from=web-build /app/api-runtime/node_modules ./node_modules
  ```
  ```
  // scripts/runtime-dependencies.mjs:19
  const queue = [dependency('', 'pg')], seen = new Set();
  ```
- Why it matters: three documents assert the deployed API has no npm dependency tree. The server statically imports `pg`, and the image copies `pg` plus its closure. Anyone trusting the docs will misjudge the supply-chain surface (the repo still carries 23 dependency advisories) or strip `node_modules` in a hardening pass.
- Failure scenario: a security review accepts "zero dependencies" and does not triage `pg` advisories; or an operator builds a slimmer image without `api-runtime/node_modules`, and the API dies on boot with `Cannot find package 'pg'` before it can serve `/api/health`.
- Fix: replace all three claims with "one runtime dependency (`pg`) plus its locked closure"; add the same line to the release checklist and a boot assertion (`node -e "require.resolve('pg')"`) in `check:deployment`.
- Confidence: HIGH

### [P2] Two money-collection systems documented as "not implemented" exist in code behind Postgres gates

- Where: `CAPABILITY-MAP.md:49`, `docs/SYSTEM.md:153` and `docs/SYSTEM.md:162`, `server/domain/payments.ts:106-114` and `:122-125`, `server/domain/ledger.ts:125-131`
- Code:
  ```
  // CAPABILITY-MAP.md:49
  | `cash-on-delivery` | Courier collects the goods price for the sender ... | **Not built: owner decision** -
  needs a sender payout ledger ... |
  ```
  ```
  // docs/SYSTEM.md:162
  Source records commission owed per driver ... Per-order fare collection, refunds and shift
  reconciliation are not implemented.
  ```
  ```
  // ledger.ts:131 (per-order fare receipt: due = price - discount, partial/full collection events)
  const dueMinor = order.price_minor - Number(order.discount_minor ?? 0);
  ```
  ```
  // payments.ts:114 (goods price: collected then "remitted" with a payout reference)
  async remitCod(...) { ... "UPDATE merchant_cod SET status='remitted',payout_ref=? ..." }
  ```
- Why it matters: the two documents an operator uses to decide launch readiness both say the money-collection records do not exist. In code, `cash_receipts` records a per-order fare due and partial/full collection, and `merchant_cod` records a goods price, collection and a finance-only remittance. They are Postgres-only and have no client, so they are dormant — but the claims are false, and the owner's explicit "not built" decision for COD is silently reversed in the tree.
- Failure scenario: someone completes the Postgres cutover for another reason; a finance admin discovers `/api/orders/:id/cod` and records goods money as collected and paid out with no sender verification, refund path or policy. Or a developer who trusts the readiness checklist builds a third collection system, because the first two are invisible.
- Fix: either delete the COD/cash-receipt routes and tables, or move them behind an explicit `WIND_COD_EXPERIMENT=1` gate and add a note to both documents: "prototype exists, disabled, decision unchanged". Do not leave live routes that the operator believes do not exist.
- Confidence: HIGH (code), MEDIUM (reachability in a supported deployment)

### [P2] A third of the registered API has no client caller

- Where: per-file route counts: `server/domain/eligibility.ts` 12, `ops.ts` 9, `payments.ts` 8, `ledger.ts` 6, `resource-scope.ts` 5, `private-objects.ts` 4, `ride-lifecycle.ts` 3, `realtime.ts` 2, `dispatch.ts` 2, plus `native-push.ts` preferences = 52 routes; total registered routes = 90 in `server/main.ts` + 73 in `server/domain/*.ts` = 163.
- Code:
  ```
  // server/domain/ops.ts:86-94
  route('POST', '/api/support/cases', ...);
  route('GET', '/api/support/cases', ...);
  route('POST', '/api/admin/approvals', ...);
  ```
  ```
  // server/domain/routes are never referenced from src/:
  // src has 0 matches for '/realtime', '/support/cases', '/payments', '/objects',
  // '/custody', '/pickup-check', '/driver/eligibility', '/admin/approvals'
  ```
- Why it matters: 32% of the API is unreachable from the shipped app (verified by exact-substring grep over `src/**` and `public/**`). Most of it also returns `409 *_unavailable` on SQLite, the backend the README tells operators to run. The gate is green because suite tests call these routes directly, so "support cases work" is true only for a test client. That is a maintenance and audit tax: 52 handlers, their tests, and their schema all have to be read on every auth/money change.
- Failure scenario: a new engineer is asked to fix "the support case queue" (WP15) and spends a day on `ops.ts` before discovering no screen exists; a security reviewer audits 52 endpoints no user can reach; a product owner reads "support cases, approvals" in the WP docs and assumes they are shipped.
- Fix: add `docs/API-SURFACE.md` with one row per route (`path`, client caller or "none", SQLite gate, owner); annotate each dormant domain file with `// not wired to a client: <gate>`; delete the superseded duplicates first (`consumeQuote`/`fetchQuote`).
- Confidence: HIGH

### [P2] The activation register says destination change is OFF; it shipped on 29 October

- Where: `docs/implementation/WP17.md:9`, `CAPABILITY-MAP.md:47`, `SPEC-change-destination.md`, commit `58be2dc` (2026-10-29)
- Code:
  ```
  // WP17.md:9
  | Destination changes / customer multi-stop | ... | OFF | Itinerary revision, immutable change quote,
  payer consent and preserved custody ... |
  ```
  ```
  // CAPABILITY-MAP.md:47
  | `change-destination` | ... | **Built 2026-10-29** (SPEC-change-destination.md): the customer re-quotes in cash
  and the assigned driver must accept ... |
  ```
- Why it matters: WP17 is the register a release reviewer uses to decide what may ship. It lists the exact capability that was built and merged the next day as OFF, with the destination modules as "existing controls". Two authoritative documents now give opposite answers.
- Failure scenario: the next release review reads WP17, marks the 29 October build as containing an unapproved OFF capability, and blocks or rolls it back; or an engineer re-implements a cash destination change because the register says it does not exist.
- Fix: split the WP17 row into "in-trip destination change (shipped 29 Oct, cash-only, evidence: SPEC-change-destination + tests/change-destination.test.mjs)" and "customer multi-stop (OFF)". Keep the evidence links in the row.
- Confidence: HIGH

### [P2] The VAPID sender identity still names the decommissioned Railway host, and the default is copied in two files

- Where: `server/main.ts:894`, `server/worker.ts:203`, `README.md` (no `WIND_PUSH_SUBJECT` row)
- Code:
  ```
  // server/main.ts:894
  const PUSH_SUBJECT = process.env.WIND_PUSH_SUBJECT ?? 'https://wind-production-72aa.up.railway.app';
  ```
  ```
  // server/worker.ts:203
  Authorization:vapid(endpoint,publicRaw,privateKey,process.env.WIND_PUSH_SUBJECT ?? 'https://wind-production-72aa.up.railway.app')
  ```
- Why it matters: every Web Push JWT carries `sub` (RFC 8292), which is the sender identity a push service sees. The default is the legacy Railway origin the README says the app no longer calls, and the two services (API and worker) read the variable independently. `WIND_PUSH_SUBJECT` is documented nowhere.
- Failure scenario: the operator sets `WIND_PUSH_SUBJECT` on the API container only (the deploy docs describe API and worker as separate services), so immediate pushes carry one `sub` and retried/durable pushes carry the Railway one. If neither is set, every notification claims a dead host, and a push service that validates the claim can reject or deprioritize it.
- Fix: one `pushSubject()` helper in `server/push.ts` that reads `WIND_PUSH_SUBJECT` once; make it required in production (the operator already sets `SUPPORT_CONTACT`, so use a `mailto:` derived from that when it is an email, otherwise fail startup); document the variable in the README table.
- Confidence: HIGH (drift), MEDIUM (provider rejection)

### [P2] The worker hard-codes high urgency, so `URGENT_KINDS` is not "every sender reads this one list"

- Where: `server/worker.ts:202`, `server/main.ts:918`, `server/domain/native-push.ts:16-18`; committed as `5f941fd` ("one kind allow-list") during this review.
- Code:
  ```
  // worker.ts:202
  headers:{TTL:String(ttl),Urgency:'high','Content-Encoding':'aes128gcm',...
  ```
  ```
  // native-push.ts:16-18
  /** Kinds that wake the phone at high urgency; every sender reads this one list. */
  export const URGENT_KINDS = ['job', 'message', 'offer', ...];
  ```
  ```
  // main.ts:918
  URGENT_KINDS.includes(kind) ? 'high' : 'normal'
  ```
- Why it matters: the commit introduced `URGENT_KINDS` as the single urgency authority and fixed the worker's allow-list, but the worker still sends every notification as `Urgency: high`. A notification that goes through the durable outbox (retry after an outage, or the Postgres worker path) has different urgency from the same notification sent immediately.
- Failure scenario: a `cash` reminder or `approved` notice is retried by the worker at 02:00 and wakes the phone at high priority — exactly the kind of alert `URGENT_KINDS` excludes. Repeated high-urgency pushes also teach Android to deprioritize the channel, so a real `job` alert arrives late.
- Fix: compute `const urgency = URGENT_KINDS.includes(kind) ? 'high' : 'normal'` in `DurableWorker.deliver` and use it in the header; add an outbox assertion that a `cash` event is delivered with `normal` (mutation-check by reverting to the hard-coded string).
- Confidence: HIGH

### [P2] Changing the booking flow requires a 2,937-line route file and ten documents, with no flow map

- Where: `server/main.ts:1-2937`, `src/app/book.tsx:1-577`, `src/app/order/[id].tsx:1-699`, `src/booking.ts`, `server/domain/quotes.ts`; docs: `docs/implementation/WP08.md`, `WP10.md`, `WP12.md`, `WP13.md`, `WP14.md`, `SPEC-driver-offers.md`, `SPEC-scheduled-booking.md`, `SPEC-promo-codes.md`, `SPEC-referral.md`, `SPEC-parcel-standard.md`
- Code:
  ```
  // main.ts:1208-1218 (quote branch) and main.ts:1276-1284 (legacy branch) repeat the same
  // promo lookup, expectedDiscount check and max_uses/per_customer re-check.
  const promo = body.promoCode == null ? null : (await promoFor(user, body.promoCode, price));
  if (promo && body.expectedDiscount != null && Number(body.expectedDiscount) !== promo.discount) fail(409, 'promo_changed');
  ```
- Why it matters: the top-level docs plus `docs/` hold 94 Markdown files / 636 KB, of which 39 WP/design docs / 374 KB are unfiltered history with no index or status. Booking is the highest-risk flow (price, promo, commission, dispatch, cash) and the code that owns it is the largest file in the repo, with duplicated validation branches.
- Failure scenario: a developer tightens the per-customer promo check in the legacy branch only (line 1282). Quote-bound bookings (Postgres `quoteId`, line 1217) keep the old rule, so the same code can be redeemed twice on one booking path and not the other; the partner path strips promos entirely (line 1409), so there is no third place to notice the difference.
- Fix: add `docs/BOOKING-FLOW.md` mapping the seven steps (`/api/price` → quote → `/api/orders` → dispatch → accept → advance → cash) to `file:line` and naming the invariant each owns; add `docs/implementation/README.md` with a status column (shipped / backend-only / historical) for all 39 docs; extract the shared promo/schedule/contact validation from the two branches into one function and test both entry points.
- Confidence: HIGH

### [P3] Four documents still say native push is not implemented

- Where: `README.md:234`, `docs/SYSTEM.md:143`, `CAPABILITY-MAP.md:32`, `SPEC-offer-alerts.md:9`; code: `src/native-push.ts:23-37`, `server/domain/native-push.ts:157-159`, `server/db/postgres-native-push.sql`, `app.json:72`
- Code:
  ```
  // README.md:234
  Web Push is implemented; native push still needs EAS/FCM setup and integration.
  ```
  ```
  // src/native-push.ts:30-36
  const expoPushToken = (await Notifications.getExpoPushTokenAsync(...)).data;
  ... await api('/push/native/register', { expoPushToken, deviceId, platform, lang });
  ```
- Why it matters: registration, token storage, unregister, preferences, outbox delivery and invalid-token cleanup all exist; `app.json` already has an EAS `projectId`. What is missing is credentials and the Postgres-only token table, not integration. The current SQLite production still falls back to polling, so the docs are not wholly wrong — but they point at the wrong blocker.
- Failure scenario: an engineer is asked to "integrate native push" and rebuilds a subsystem that already exists; or the owner delays the EAS/FCM work believing code remains.
- Fix: replace with one accurate sentence in all four places: "Expo push implemented (`src/native-push.ts`, migration 12); requires PostgreSQL, `WIND_EXPO_PUSH_ENABLED=1`, an EAS project and FCM v1 credentials; SQLite production falls back to polling."
- Confidence: HIGH

### [P3] Dead duplicate quote helpers with a raw `Error`

- Where: `server/domain/quotes.ts:279-288`, `server/main.ts:1252`
- Code:
  ```
  export async function consumeQuote(db, quoteId, orderId) {
    ...
    if (!result.changes) throw new Error('quote already consumed');
  }
  ```
  ```
  // main.ts:1252 (the live path, same invariant, mapped to 409 elsewhere)
  (await run('UPDATE quotes SET consumed_at=?, consumed_order_id=? WHERE id=?::uuid', ...));
  ```
- Why it matters: both helpers have zero importers (grep over `server`, `src`, `tests`), while the live path marks the quote consumed inline. `consumeQuote` throws a raw `Error`, so a future caller gets a 500 where the API contract says `409 quote_consumed`.
- Failure scenario: a developer adds a second booking entry point and reuses `consumeQuote`; a double-submit returns 500, the client retries, and the order-confirmation screen shows "Something went wrong" instead of the spec's idempotent replay.
- Fix: delete `fetchQuote`/`consumeQuote`, or make `main.ts:1252` call `consumeQuote` and map the error to `fail(409, 'quote_consumed')`.
- Confidence: HIGH

### [P3] The cash-settlement spec's balance formula omits the promo credit that the code subtracts

- Where: `SPEC-cash-settlement.md:28`, `server/domain/money.ts:2-9`, `SPEC-promo-codes.md:18`
- Code:
  ```
  // SPEC-cash-settlement.md:28
  `owedCents = commissionCents + adjustmentsCents − confirmedRemittancesCents`.
  ```
  ```
  // money.ts:5
  const result = BigInt(commission) - BigInt(discounts) + BigInt(adjustments) - BigInt(remitted);
  ```
- Why it matters: two specs define the same driver balance differently. The promo spec includes the discount credit; the cash spec and its API table omit `discountsCents` entirely. The live API returns `discountsCents` and the cashier UI displays the netted number, so the spec is the only wrong document — but it is the one a new cashier/engineer reads first.
- Failure scenario: a driver with ₪30 commission, a ₪10 promo and no remittances: the spec says the driver owes ₪30, the app says ₪20. A cashier records ₪30, the driver disputes, and the correction needs a second adjustment. Or an engineer "fixes" the code to match the spec and over-collects by the promo amount on every discounted order.
- Fix: update the spec formula and API row to include `discountsCents`, with the ₪30/₪10 example; add that example to `tests/cash.test.mjs`.
- Confidence: HIGH

### [P3] Specs cite two files that do not exist

- Where: `SPEC-driver-offers.md:34`, `SPEC-notification-audit.md:3`
- Code:
  ```
  ### 1. Smart recommended price (server, `src/pricing.ts` shared with the client for the breakdown)
  ```
  ```
  Status: loop 50, 8 Oct 2026. ... Audit: REVIEW-NOTIFICATIONS-2026-10-08.md in the workspace root.
  ```
- Why it matters: neither file exists. The pricing logic is in `server/domain/quotes.ts` (`smartPrice`) and `src/model.ts`, so the spec sends a reader to a dead end on the most-changed pricing path. The notification audit reference is the only record of which mutating routes were audited.
- Failure scenario: a new engineer opens `SPEC-driver-offers` to change the night rate, greps for `src/pricing.ts`, finds nothing, and either edits the wrong file or asks for help; the audit that justified the push matrix cannot be re-read.
- Fix: change the spec to `server/domain/quotes.ts` + `src/model.ts`; either add `REVIEW-NOTIFICATIONS-2026-10-08.md` (or link the commit) or delete the reference.
- Confidence: HIGH

### [P3] SQLite creates two Postgres-only tables that no SQLite code can read

- Where: `server/db/sqlite-schema.ts:180` (`road_restrictions`), `:189` (`quotes`), `server/domain/quotes.ts:9-11`, `server/migrate.ts:16`
- Code:
  ```
  // sqlite-schema.ts:189
  CREATE TABLE IF NOT EXISTS quotes ( ... );
  ```
  ```
  // quotes.ts:9-11
  export async function quotesAvailable(db) {
    if (db.backend !== 'postgres') return false;
  ```
- Why it matters: every SQLite database (the documented production backend) creates a full `quotes` table and `road_restrictions` table on first boot, but `quotesAvailable` returns false before any read/write. `NON_LEGACY_TABLES` (`migrate.ts:16`) already excludes them from snapshot import, and the uncommitted `migrate.ts` edit removes a redundant second skip for the same tables. They are dead weight in every backup and a trap for anyone writing SQLite SQL with Postgres casts (`::uuid`).
- Failure scenario: a restore/import tool treats `quotes` as live data and reports rows that the app cannot use; or a developer adds a SQLite quote query and it fails at runtime because the rest of the quote path (including `::uuid`) is Postgres-only.
- Fix: stop creating both tables in `sqlite-schema.ts` for new databases (keep a one-time drop for existing ones), or add a comment at the CREATE and a SQLite test asserting `/api/price` never returns `quoteId`.
- Confidence: HIGH

### [P3] Screenshots were not regenerated after the 29 October UI change

- Where: `docs/screens/README.md:3`, `docs/screens/ar/*.png` (48 files, 2026-10-28), `src/destination-change.tsx` (commit `58be2dc`, 2026-10-29)
- Code:
  ```
  Generated by `npm run screens` on 2026-10-28.
  ```
  ```
  // src/destination-change.tsx:53 renders a new card on every assigned order:
  return <Card><Txt variant="title">{c.changeDestination}</Txt> ...
  ```
- Why it matters: the repo's own handoff rule says "After any UI change, run `npm run screens` so docs/screens matches the code" (`docs/HANDOFF-2026-10-27-continue.md:77`). The destination card is absent from all 96 screenshots, and `docs/screens/README.md` is the index the next UI reviewer trusts.
- Failure scenario: a reviewer opens the order screenshot to check the new card, sees the pre-change screen, and concludes the feature is not rendered; or a later screenshot diff hides a regression because the baseline predates the card.
- Fix: run `npm run screens`, add a row for the destination card (both languages, pending + quote states), and note the generation date in the commit.
- Confidence: HIGH

## Suspicions (unverified)

- `.env.example` lists `WIND_KEYSTORE`, `WIND_STORE_PASSWORD`, `WIND_KEY_ALIAS` and `WIND_KEY_PASSWORD`, but nothing in `scripts/`, `server/`, `src/`, `tests/`, `app.json`, `app.config.js` or `eas.json` reads them. They may be consumed by EAS-managed credentials outside the repo; if not, they are four dead secrets in the onboarding file. (LOW)
- `server/domain/route-quality.ts:8` exports `expectedSeconds`, which is used only by `tests/route-quality.test.mjs`; `expectedMinutes` is what the server uses. Not harmful, but the test-only export invites drift. (LOW)
- `WIND_REALTIME_SECRET` and `WIND_PUBSUB_ENABLED` are read by `server/domain/realtime.ts` but appear only in WP/report documents, not in the README env table; if the realtime routes are ever wired, the operator will not know how to enable them. (LOW)
- The branch's `PUSH_KINDS`/`URGENT_KINDS` split fixed a real worker allow-list bug (`destination_request` would have retried to `attempts_exhausted`), but `tests/outbox.mjs` only asserts delivery, not the urgency header, so the new list has no test for the property it documents. (MEDIUM — covered by the P2 finding above)
- `docs/QA-2026-10-21.md` and `reports/release-readiness-2026-10-29.md` still describe the pre-destination build; they are date-stamped, but the README links them as "current" verification without a "superseded" banner. (LOW)

## What I checked and found clean

- **The 33 specs are not doc-only.** For each of the ten headline features in the brief I found a registered route, a client surface, and a passing cited test: cash settlement (`/api/driver/cash`, `admin/cash.tsx`, `tests/cash.test.mjs`), dispatch/offers (`dispatch.ts`, `offers.test.mjs`), live map (`public/map.html`, `route-map.tsx`, `map.test.mjs`), promo (`promo.test.mjs`), referral (`referral.test.mjs`), safety SOS (`/api/orders/:id/sos` + `Safety` in `order/[id].tsx`, `safety.test.mjs`), dispute credit (`credit.test.mjs`), scheduled booking (`schedule.test.mjs`), Web Push (`sw.js`, `push-server.test.mjs`), in-app chat (`chat.test.mjs`). Across the other 23 I found no spec with no implementation: each maps to a route, a client module, or a build/check script.
- **Spec-listed routes exist.** I extracted every `METHOD /api/...` from `SPEC-*.md` and matched it against the 163 registered handlers; the only miss was `/api/track/:token/eta`, which is a regex route (`/api/track/([a-f0-9]{64})/eta`) and therefore a false positive.
- **The `5f941fd` push delta and the remaining `migrate.ts` edit are otherwise sound.** `Persistence.memo` is request-scoped (`server/db/persistence.ts:97`), created per `scope()` (`:83`) and cleared on every `run()` and transaction boundary (`:153`, `:172`), so memoizing the migration probes cannot hide a newly applied migration. The `URGENT_KINDS` extraction removes a duplicated list, and the new outbox loop is not vacuous: `notification(0, kind)` creates an outbox row with no order id, so `validate()` skips the order guards and the test really exercises the allow-list. The uncommitted `server/migrate.ts` edit deletes a `quotes`/`road_restrictions` skip that `NON_LEGACY_TABLES` already enforces; no import behavior changes.
- **Auth and deletion match their claims.** Admin self-registration is blocked (`server/main.ts:509-510`), account deletion clears email/phone/pins/messages and deletes sessions (`server/main.ts:723-746`), and `native_push_tokens` cascades from sessions plus a `blocked` trigger (`server/db/postgres-native-push.sql:17`, `:25-31`), so my first suspicion (orphan push tokens after deletion) was wrong.
- **The privacy page is not stale.** `server/privacy.html:25-28` matches the current email-code and native-background-location behavior, including Cloudflare Email Service and the 20-second native fix.
- **The gate is green.** `npm test` → 78 suites passed; `npm run typecheck` → exit 0; `npx expo lint` → exit 0. No spec-cited test file is missing (17/17 referenced files exist), and no test suite in `scripts/run-tests.mjs` was removed.
- **All route files are reachable.** Every `src/app/**` route has at least one `router.push`/`Link` target from the customer, driver or admin shell; the only zero-importer files are Expo Router route files and platform variants (`motion.native.ts`, `route-map.android.tsx`, `route-map.native.tsx`).
- **The capability map's "not built" list is otherwise honest** (tipping, delivery photo, driver documents, cancellation fee, pooling), and the WP docs consistently label backend-only work as backend-only (`WP05.md:3`, `WP13.md:3`, `WP14.md:3`, `WP15.md:3`).
