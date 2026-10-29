# Note to the concurrent maps/audit session - two open P0s in `0302c2d`

> **Resolved in `2b61fc4`.** P0-1: the `?nolock=1` URI is reverted (the busy-timeout/journal path stays). P0-2: the SQLite inline guard now uses `assigned_at <= fixAt + 15000`, with parity tests in `tests/map.test.mjs` (SQLite) and `tests/active-gps.mjs` (Postgres). P1: the production `WEB_ROOT` guard is restored and an explicit missing root fails fast. P2: a ~17 km boundary case is in `tests/model.test.mjs` and `tests/map.test.mjs`, and the stale 15 km comments are updated. Full `npm test` (85 suites), `test:persistence`, typecheck and lint pass when run sequentially; the earlier parallel run flaked in `phone-identity-authority.mjs`.

Written 29 Oct 2026 by the read-only review session. Verified against `5e660b9`, working tree clean.
**These are still broken at HEAD.** Both came in with `0302c2d`, which this repo's handoff records as landed.

Do not take this as a re-litigation of the maps work — the parts you kept are right and I agree with all of
them (see "Agreed" below). These are two defects in the same commit that the 85-suite gate does not cover.

---

## P0-1 · `?nolock=1` crashes the API on any existing WAL database

`server/main.ts:154`

```ts
const dbPath = process.env.WIND_DATABASE_URL ? ':memory:' : process.env.DB_PATH ? (process.env.SQLITE_NOLOCK === '1' || process.env.SQLITE_JOURNAL === 'DELETE' ? ('file:' + process.env.DB_PATH + '?nolock=1') : process.env.DB_PATH) : 'wind.db';
```

### Reproduced (current tree, copy of this repo's own `wind.db`)

```
repo wind.db journal_mode = wal
nolock boot: CRASH -> unable to open database file | errcode 14
```

Matrix from a fresh process, each mirroring `initializeSqlite`'s pragma order:

```
SQLITE_NOLOCK=1, existing WAL db        CRASH: unable to open database file | errcode 14
SQLITE_JOURNAL=DELETE, existing WAL db  CRASH: unable to open database file | errcode 14
SQLITE_NOLOCK=1, fresh db               BOOTS OK
SQLITE_JOURNAL=DELETE, fresh db         BOOTS OK
no opt-in (baseline), existing WAL db   BOOTS OK
```

### Why

The connection is opened with `?nolock=1` **before** `initializeSqlite` (`server/db/sqlite-schema.ts:7`) can run
`PRAGMA journal_mode = DELETE`. A WAL database cannot attach its `-shm` region without taking locks, so the
`sqlite3_open` itself fails at `errcode 14`. **It only works on a database that does not exist yet**, which is
exactly the case every local test exercises — and not the case of a running deployment.

So the fix for `Error: database is locked` produces a *different* `CrashLoopBackOff`. Please revert the URI
opening; the busy-timeout work in `sqlite-schema.ts` is the part that actually helps.

### Second problem, independent of the crash

SQLite's own docs, `nolock=1`:

> Caution: If two or more database connections try to interact with the same SQLite database and one or more of
> those connections has enabled "nolock", then database corruption can result.

There are already **two** connections on one `DB_PATH` at one replica: `server/main.ts:156` and
`server/worker.ts:222` (which calls `runtimePersistence()` and opens its own `DatabaseSync`). Two connections,
one with `nolock`, is the documented corruption precondition. This is a data-loss risk, not just a boot risk.

### Third problem: two concerns, one variable

`SQLITE_JOURNAL=DELETE` now does **double duty** — it sets the 5 s `busy_timeout` (`sqlite-schema.ts:7`) *and*
disables locking (`main.ts:154`). An operator following the handoff to raise the busy timeout silently gets
locking off. If the DELETE path is wanted, it should not also switch on `nolock`.

### Fourth: unreachable in production anyway

`infra/main.bicep:355,366` sets `WIND_POSTGRES_STAGING=1` and injects `WIND_DATABASE_URL` from Key Vault;
`server/db/runtime.ts:5-19` therefore returns **Postgres**, and `main.ts:154` takes the `:memory:` branch. So
this line cannot have fixed the production crash it was written for.

**Likely real cause of the original `database is locked`:** a revision where `WIND_DATABASE_URL` was unset and
`WIND_POSTGRES_STAGING` was not `1`. Note the two are distinguishable — an empty secret gives
`WP16 staging requires WIND_DATABASE_URL`, not `database is locked`. Worth confirming which revision produced
the message before fixing anything further here.

---

## P0-2 · The 15 s GPS grace is undone by the inline SQL guard on SQLite

`server/main.ts:2174` (grace) vs `server/main.ts:2213-2214` (write guard)

```ts
// :2174  grace allows a fix up to 15 s before assignment
if (age > 60_000 || fixAt < Number(since) - 15_000) return { ok: true, accepted: false };

// :2213-2214  but the write itself still requires assigned_at <= fixAt, with no grace
AND (o.assigned_at IS NULL OR o.assigned_at <= ?))
```

### Reproduced

`assignedAt = 1000000`; `EXISTS` evaluated with the exact guard from `:2213-2214`:

```
fix -20s vs assign   grace=false  EXISTS=false  => stored: false
fix -14s vs assign   grace=true   EXISTS=false  => stored: false   <- grace passes, write still dropped
fix  -5s vs assign   grace=true   EXISTS=false  => stored: false
fix   0s vs assign   grace=true   EXISTS=true   => stored: true
fix   1s vs assign   grace=true   EXISTS=true   => stored: true
```

### Why it matters

The guard sits inside `if (persistence.backend === 'sqlite')` (`:2204`). **Postgres honours the 15 s grace;
SQLite silently drops the fix and returns `accepted: false`.** Identical input, two answers, differing by
backend — and the symptom on SQLite is precisely the one the grace was added to fix (driver marker stays put
right after accepting a job). Every local test runs SQLite, so this is the path most likely to be what users see.

It also only *narrows* the race rather than closing it: `age > 60_000` still drops slow uploads, and a fix whose
GPS timestamp predates the accept by more than 15 s still loses.

### Smallest complete fix

Apply the same allowance to the SQL guard — `AND (o.assigned_at IS NULL OR o.assigned_at <= ? + 15000)` — and
add one test that asserts both backends return the same `accepted` value for a fix 14 s before assignment. That
test is the missing coverage that let this ship.

---

## P1 · `webRoot` guard removal (`server/main.ts:70`)

```ts
// before
const webRoot = process.env.WEB_ROOT ? resolve(process.env.WEB_ROOT) : production ? null : fileURLToPath(new URL('../public', import.meta.url));
// after
const webRoot = process.env.WEB_ROOT ? resolve(process.env.WEB_ROOT) : fileURLToPath(new URL('../public', import.meta.url));
```

The old `production ? null` existed so production never served the dev tree. Now a typo'd or unset `WEB_ROOT`
silently serves `public/` (dev `map.html`/`index.html`) instead of failing loudly. The stated motivation does not
hold: `Dockerfile:32` sets `WEB_ROOT=/app/web`, so production was not 404ing. Suggest keeping the `public/`
fallback for non-production and failing fast in production when `WEB_ROOT` does not resolve.

---

## P2 · Untested 15 → 20 km change, and stale comments

`src/model.ts:183` `SERVICE_KM = 20`. Two comments still say 15:

- `tests/map.test.mjs:49` — "12 km out: inside the 15 km bound"
- `tests/quotes-routing.mjs:77` — "Rural pin within SERVICE_KM (15km)"

Worse, the 12 km case no longer discriminates the boundary, so the change itself is untested. Add a point at
~17 km — rejected before, accepted now. Measured from Ramallah: Jerusalem 15.1 km, Bethlehem 22.1 km, so 20 km
overlaps service discs across the barrier and checkpoints; worth a product sign-off, not only a test.

---

## Agreed — do not change these

- **Public OSRM fallback removed.** Correct. `router.project-osrm.org` is a demo instance with no SLA and active
  rate limits. `infra/main.bicep:356` already points at the private `acaOsrm` ingress; keep it that way.
- **Straight/curvature chord not drawn.** Correct. `src/route-map.tsx:168` skipping the line when `road` is absent,
  plus the `c.destinationEstimated` disclosure at `src/app/book.tsx:405`, is honest. A 1.2x geodesic across the
  West Bank would draw through the barrier and settlements with a fictional ETA.
- **`servedCity` hard reject kept at `src/app/book.tsx:457`.** Correct — out-of-area pins should be refused.
- **`PinSheet` centering (`book.tsx:455`)** and **`getLastKnownPositionAsync` (`book.tsx:332-333`)** are right:
  explicit pin, then live GPS, then last-known, then city centre; pickup-only and non-blocking. Only nit is that
  last-known has no freshness bound — it can be hours old and is not labelled stale.
- **OSRM `OSRM_TIMEOUT_MS`** (`:2295`) is a reasonable addition; note the floor of 1000 means values below it are
  ignored by design.

---

## Test status — read this honestly

The passing gate does **not** cover either P0. I ran, on this tree:

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `node tests/map.test.mjs` | pass (`map: ok`) |

I did **not** run `node scripts/check-customer-location.mjs`, `node scripts/run-tests.mjs` (the 85 suites), or
`node scripts/check-scenarios.mjs` — the user asked for a review-only pass at that point. **I am not claiming the
85-suite gate is green.**
Note `check-customer-location.mjs:1` needs a pre-built `.expo/location-review-web` export, so it fails cold
rather than on a regression; do not read a failure there as a maps defect without building it first.

Missing tests, both P0s:
1. no test opens a `?nolock=1` connection against a *pre-existing WAL* database;
2. no test asserts grace-window parity between the SQLite inline guard and the Postgres path.

---

## Suggested order

1. Revert `?nolock=1` at `main.ts:154`. Confirm which revision actually emitted `database is locked` before
   pursuing the SQLite-on-SMB angle at all — production runs Postgres.
2. Add `+ 15000` to the SQL guard at `main.ts:2214`; add the cross-backend parity test.
3. Restore the production `WEB_ROOT` guard; fail fast on an unresolvable path.
4. A 17 km boundary test.
5. **Do not** re-add `fallbackRoute`, a curvature chord, an env-configurable `SERVICE_KM`, or a public-OSRM
   default. All four were correctly rejected in `0302c2d`; none of them exist in the tree, and re-adding them
   would reintroduce the dishonesty the maps work removed.

Forward path for storage: production is already on managed Postgres — finish WP03 parity, scale to >= 2 replicas,
and drop the `wind-data` Azure Files SQLite share. No amount of `?nolock=1` tuning makes SQLite correct on SMB.

---

### Provenance

The review request described `fallbackRoute()`, a 1.2x geodesic, an implicit public-OSRM default, an
env-overridable `SERVICE_KM`, a >= 6000 ms OSRM timeout, `servedCity(point) ?? nearestCity(point)` on confirm, and a
`Dockerfile` `OSRM_URL`. **None are in this repository.** `git log --all -S "fallbackRoute"` and `-S "curvature"`
return nothing, including the T3 checkpoint refs; `-S "router.project-osrm.org"` hits only throwaway checkpoints,
and the sole live occurrence is `scripts/phone-test-server.mjs:20` (QA sandbox). If a session's model of this
codebase includes those, it is stale — re-derive from HEAD.
