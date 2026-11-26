# Independent verification — 2026-11-13

> **Historical results:** read with the later reconciliation below and `docs/REA/2026-11-13-RECONCILIATION.md`. The booking defect in the original results table is fixed locally; do not rerun or implement the old Phase 0 plan from that row.

## Results table

| Item | Result | Evidence |
|---|---|---|
| Dialect/runtime claim | **CORRECTED** | [read] `server/db/runtime.ts:5-10` returns SQLite when `WIND_DATABASE_URL` is absent, except that staging explicitly throws; `server/db/runtime.ts:11-18` is a separate staging PostgreSQL path that precedes the test-only gate at `:20-21`. |
| Twelve non-Postgres gates | **CONFIRMED** (12/12) | [read] Exact lines are listed below. |
| Payments has two independent blockers | **CONFIRMED** | [read] `server/domain/payments.ts:29-36,46-48,192`. |
| Booking persisted-command clearing defect | **CONFIRMED** | [ran] `node tests/booking-retry-race.test.mjs` exited `1`; [read] `src/app/book.tsx:379-380` clears on a `409 quote_consumed`. |
| Server typecheck | **CONFIRMED** exit `0` | [ran] `npx tsc --noEmit -p tsconfig.server.json`; output `EXIT_CODE=0`, with no diagnostics. |
| Expo lint | **CONFIRMED** exit `0` | [ran] `npx expo lint`; output included `env: load .env.local` and `env: export ZRO_API_KEY ZRO_PROVIDER_NAME`, then `EXIT_CODE=0`. |

## 1. Dialect/runtime gate

- [read] `server/db/runtime.ts:5-10`: `runtimePersistence()` reads `WIND_DATABASE_URL`; if it is unset, line 9 returns `new Persistence({ sqlite })`. However, lines 8-9 first throw when `WIND_POSTGRES_STAGING === '1'` and the URL is missing.
- [read] `server/db/runtime.ts:11-18`: with a URL and `WIND_POSTGRES_STAGING === '1'`, the function validates a non-loopback PostgreSQL URL with `sslmode=verify-full` and returns `new Persistence({ connectionString, pool: ... })` at line 18.
- [read] `server/db/runtime.ts:20-21`: only after that staging branch does the non-staging path throw unless `NODE_ENV === 'test'` and `WIND_POSTGRES_TEST_ONLY === '1'`.

[read] Correction: the ordinary no-URL path selects SQLite, but “PostgreSQL refuses to start unless test mode” is not universal because the staging branch returns PostgreSQL before reaching that test-only gate. Actual deployment settings were not established.

## 2. The twelve cited gates — lines actually read

1. [read] `server/domain/commands.ts:11` — `if (db.backend !== 'postgres') fail(409, 'durable_protocol_unavailable');`
2. [read] `server/domain/dispatch.ts:41` — `if (db.backend !== 'postgres') return false;`
3. [read] `server/domain/eligibility.ts:33` — `if (db.backend !== 'postgres') return false;`
4. [read] `server/domain/events.ts:35` — `if (db.backend !== 'postgres') return false;`
5. [read] `server/domain/ledger.ts:15` — `if (db.backend !== 'postgres') return false;`
6. [read] `server/domain/native-push.ts:26` — `if (db.backend !== 'postgres') return false;`
7. [read] `server/domain/ops.ts:14` — `if (db.backend !== 'postgres') return false;`
8. [read] `server/domain/payments.ts:36` — `if (db.backend !== 'postgres') return false;`
9. [read] `server/domain/private-objects.ts:48` — `if (db.backend !== 'postgres') return false;`
10. [read] `server/domain/quotes.ts:9` — `if (db.backend !== 'postgres') return false;`
11. [read] `server/domain/resource-scope.ts:30` — `if (db.backend !== 'postgres') return false;`
12. [read] `server/domain/ride-lifecycle.ts:24` — `if (db.backend !== 'postgres') return false;`

## 3. Payment evidence

- [read] `server/domain/payments.ts:29-31` comments that no payment provider is wired yet and that the only enable path is the explicit test fake; every other case reaches the availability gate.
- [read] `server/domain/payments.ts:32-34` returns `{ testFake: env.NODE_ENV === 'test' && env.WIND_PAYMENTS_TEST_ONLY === '1' }`.
- [read] `server/domain/payments.ts:35-38` makes `paymentsAvailable()` return `false` for a non-Postgres backend, then checks PostgreSQL tables and migration version `17`.
- [read] `server/domain/payments.ts:46-48` rejects with `payments_unavailable` when `provider` is absent, independently of the database-table check.
- [read] `server/domain/payments.ts:192` constructs the fake only in the explicit test configuration; otherwise it constructs the service without a provider.

[read] Therefore the SQLite availability gate is one blocker and the missing real provider is a second blocker.

## 4. Booking test and condition

- [ran] `node tests/booking-retry-race.test.mjs` exited `1`.
- [ran] Verbatim assertion text:

```text
AssertionError [ERR_ASSERTION]: quote_consumed 409 means "this attempt did not create an order", never "this command does not exist": a first POST it retries may already have committed (Part A proves 409 quote_consumed), and clearing it orphans that order
```

- [read] `src/app/book.tsx:379-380`:

```ts
if (e.status && e.status < 500 && ![401, 408, 429].includes(e.status) && errorCode(e) !== 'idempotency_conflict') {
  await storage.set(savedKey, null, true).catch(() => {}); latest.current = null; setPending(null); setOutcome(null);
```

[read] `409` is truthy, below `500`, and is not `401`, `408`, or `429`; `quote_consumed` is not `idempotency_conflict`. Therefore the condition is satisfied and the persisted command is cleared.

## 5. Requested command outcomes

- [ran] `npx tsc --noEmit -p tsconfig.server.json` exited `0`; no diagnostics were printed.
- [ran] `npx expo lint` exited `0`. Output:

```text
env: load .env.local
env: export ZRO_API_KEY ZRO_PROVIDER_NAME
EXIT_CODE=0
```

## Not established

- [U] Actual deployment environment variables and the backend selected by a running deployment.
- [U] Any live payment-provider integration or live PostgreSQL connection; neither was tested.
- [U] UI/device behavior for the booking race; the evidence here is the automated test and the cited source condition.

---

## Leader reconciliation (added 13 Nov, after this check completed)

| Reviewer finding | Verdict | What changed |
|---|---|---|
| The twelve gates, all confirmed with the exact lines | **ACCEPTED** | Independently identical to the leader's reading; now the authoritative list |
| **Correction:** "Postgres refuses to start unless test mode" is not universal — `runtime.ts:11-18` has a `WIND_POSTGRES_STAGING=1` branch that returns Postgres *before* the test-only gate at `:20-21` | **ACCEPTED — the reviewer was right and the leader's first wording was wrong** | Corrected in `docs/REA/2026-11-13-VERIFIED-ADDITIONS.md` §1, `research_notes/fable-52-verified-execution-2026-11-13/HANDOFF.md` §3.6, and `reports/Delivery comparison master evidence.md` §8. The claim is now "the deployed pilot writes SQLite", evidenced by the deployment, not "the code can never use Postgres" |
| Payments has two independent blockers | **ACCEPTED** | Unchanged and confirmed |
| Booking: test `exited 1`; condition at `book.tsx:379-380` clears the command on 409 `quote_consumed` | **ACCEPTED as of the check's timestamp, now stale** | The defect was fixed after this check ran. `src/app/book.tsx` now excludes the eight post-lock codes, and `node tests/booking-retry-race.test.mjs` exits **0**. Part A still skips without PostgreSQL |
| Server typecheck exit 0; Expo lint exit 0 | **ACCEPTED** | Reproduced by the leader |

**One caution about this thread's chat summary, not this file.** The message that accompanied
this report cited `server/domain/tracking.ts` and line numbers such as `quotes.ts:13-15` and
`payments.ts:32-38`. No `tracking.ts` exists in this repository, and the real gates are
`quotes.ts:9` and `payments.ts:36`. The **file body above is accurate**; the chat summary drifted.
Trust the body, and re-open any path before citing it.
