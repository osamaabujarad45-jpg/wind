# Mutation-testing record — 29 October 2026

The review's "genuinely good" list claimed *"no test asserts nothing, skips itself, or swallows a failure."*
That is a claim about the **presence** of assertions. It says nothing about whether the tests would
**catch a regression** — which the `code-review-and-quality` skill calls the question that must be
answered by experiment: invert a condition, run the suite, restore the file.

Three passes, 13 mutations, on a suite that takes ~58 s per run.

## Result: 11 of 13 caught, 1 equivalent mutant, 1 real gap

| # | Mutation | Guard it breaks | Result |
|---|---|---|---|
| A | `canSee` forced `true` | IDOR on `getOrder` | **CAUGHT** (`/orders/5` leaked) |
| B | `expectedStatus` check removed | optimistic concurrency on `advanceOrder` | **CAUGHT** |
| C | cash-settle `AND status='pending'` removed | double settle | **CAUGHT** (500 on the second decide) |
| D | partner key check removed | `X-Partner-Key` gate | **CAUGHT** (`/partner/config` opened) |
| E | rating idempotent early-return dropped | *nothing* — see below | **equivalent mutant** |
| E2 | driver may overwrite an existing customer rating | rating immutability | **CAUGHT** |
| F | customer may rate twice with a new value | rating immutability | **CAUGHT** |
| G | `driver_id` predicate widened to `OR 1=1` | driver decides another's cash | **CAUGHT** |
| H | `need()` role check removed | **every** role gate | **CAUGHT** |
| I | `needActive()` removed | blocked/pending users may act | **CAUGHT** |
| J | reschedule ownership check (`main.ts:1495`) removed | a driver rescheduling a customer's order | **MISSED** |
| K | accept `AND status='searching'` removed | two drivers for one job | **CAUGHT** |
| L | settings fraction ceiling removed | a percentage ≥ 100 % | **CAUGHT** |

## The equivalent mutant (E)

`main.ts:1511` returns early when the driver re-submits the **same** `customerRating`. Dropping it leaves
the suite green because line 1510 already rejects a **different** value — so the only case that reaches
1511 is a no-op write of the value already stored. Not a test gap. Mutations E2 and F, which break the
guards that actually prevent a change, are both caught.

## The real gap (J) — a finding this review missed

`removing the reschedule ownership check leaves the entire suite green.`

- `main.ts:1493` calls `getOrder(...)`, which **404s** for anyone who cannot see the order.
- The only account that reaches line 1495 is therefore the assigned driver.
- `tests/schedule.test.mjs:78` *does* send a driver:
  `await reschedule(move, moved + DAY, 404, driver.token); // drivers cannot see it yet`
  It asserts **404**, which `getOrder` produces **before** line 1495 ever runs.

So the guard is correct in the code and completely unasserted. Probe
`probe-reschedule-ownership.mjs` drives the case the suite cannot: an assigned, approved driver who
*can* see the job — `POST /orders/:id/schedule` → `409 cannot_reschedule`, guard reached and held.

**Suggested test:** after a driver accepts a scheduled order, `POST /orders/:id/schedule` **with the
driver's token** and assert `409 cannot_reschedule`. That is one line, and it closes the gap.

## The wrong-cause check

A test that asserts a status code passes whether the guard fired for the right reason or an unrelated
one. Five key refusals were re-run with the **cause** inspected (`probe-wrong-cause.mjs`): all five
produce the intended error, not an incidental one.

| Case | Result |
|---|---|
| customer accepts a job | `403 forbidden` — the role gate, not a missing field |
| driver books an order | `403 forbidden` |
| customer reads another's order | `404 not_found` (deliberately indistinguishable from absent) |
| stale `quotedPrice` | `409 price_changed` |
| no token | `401 unauthorized` |

## What this changes in the review

The bullet *"No test asserts nothing, skips itself, or swallows a failure — the problem is what is never
selected"* is **half right**. The tests do assert, and 11 of 13 mutations are caught, which is a genuinely
strong result. But one authorization guard in the order flow is unasserted, so the sharper sentence is:

> The suite is strong on the paths it selects — 11/13 mutations caught. Its real defects are
> **selection** (four files never run in CI) and **one unasserted guard** (reschedule ownership).

Reproduce: `node reports/verify-2026-10-29/mutation-test.mjs` (and `-2`, `-3`).
Each script backs up the file, mutates, runs, and restores in a `finally` block.
