# Handoff — Fastship (Wind), 27 October 2026 (WP14 refund session)

## State on arrival vs brief

- Branch `master`, HEAD `0f8c3bc6ade520b8f274359c792b0f9b4e418a1a` — matches brief.
- `git status --porcelain` = **257** lines, brief said 256. Delta is one untracked
  file: `docs/HANDOFF-2026-10-27-continue.md` itself (the continuation prompt,
  written after the 256 count was taken). Nothing else differs. No commit or push made.

## Gate (re-run this session, logs under $env:TEMP)

| Gate | Log | Result |
|---|---|---|
| `npm test` | `g1.log` / `f1.log` | exit 0 — `Integration gate: 66 suites passed` |
| `npm run test:persistence` | `g2.log` / `f2.log` | exit 0 — tail `PASS PostgreSQL legacy map; map: ok` |
| `npx tsc --noEmit` | `g3.log` / `f3.log` | exit 0 |
| `npx expo lint` | `g4.log` / `f4.log` | exit 0 |
| `node tests/azure-infra.test.mjs` | `g5.log` / `f5.log` | exit 0 — Bicep compile/lint + 3 param builds |

Note: under PowerShell, `npm run test:persistence` once reported exit 13 from a
`Warning: Detected unsettled top-level await` on stderr (PowerShell native-error
surfacing). The same suite run directly (`node tests/db-persistence.test.mjs`)
and via `cmd /c` exits 0. This is a shell-reporting artifact, not a test failure;
run the persistence gate via `cmd /c` or direct `node` to get a truthful exit code.

## Work done (next non-owner-gated items)

### 1. WP14: provider refund no longer runs inside a DB transaction

- Was: `Payments.refund()` called `provider.refund()` inside `this.tx(...)`,
  holding the intent row lock across the provider call (known accepted backlog).
- Now (`server/domain/payments.ts`): reserve (lock intent, cap check counting
  `requested`/`approved`/`completed`, insert `requested` row, commit) → provider
  call → settle in a second short transaction. Provider throw settles `rejected`.
  In-transaction callers fail `409 refund_in_transaction`.
- Review found the real caller chain defect: every POST runs inside
  `persistence.atomic()` in `server/main.ts`, so the HTTP refund route would
  always have failed `409 refund_in_transaction`. The two payment provider
  routes now bypass that envelope and own their short transactions, following
  the existing phone-route precedent (create had the same latent lock-across-
  provider-call problem and is fixed by the same bypass).
- Tests (`tests/payments.mjs`): provider-call transaction state asserted,
  concurrent same-`requestId` race (one provider call, one row), in-flight
  replay, in-transaction rejection, and a real-HTTP fixture proving
  create/query/refund reach the provider. Mutation-proven: re-wrapping the
  provider call in a transaction fails the suite (exit 1); disabling the
  envelope bypass fails the HTTP refund with `refund_in_transaction` (exit 1).

### 2. WP13 backlog nit: append-only error text

- `wp05_append_only()` in `server/db/postgres-eligibility.sql` now raises
  `record is append-only` instead of `eligibility evidence is append-only`
  (it backs eligibility, dispatch, ledger, payments and ops triggers).
  Fresh installs only; migrated DBs keep old wording until rebuild/cutover.
  All assertions match `/append-only/`. Verified: ledger persistence + sqlite suites pass.

### Review routing this session

- Implementation: GPT-6.1 Terra (completed, no limit hit; leader reworked the
  error shape to `fail(409, …)` and added the envelope fix + HTTP/race tests).
- Scout (append-only/UI inventory): Haiku 5.5 delegate failed to start twice;
  leader (Wonder) did the inventory inline as fallback.
- Independent review: MiniMax M3 (insufficient balance), GLM 5.3 Flash
  (internal error), DeepSeek Flash via OpenCode (insufficient credits) all
  unavailable; a fresh Muse Wonder critic thread reviewed instead and found
  the envelope BLOCKING above. Its other findings are activation backlog,
  recorded in `docs/implementation/WP14.md`: provider refund has no
  idempotency key (lost response + fresh `requestId` can double-refund at a
  real provider) and a crash can leave a `requested` row holding cap until
  activation reconciliation. Both fail closed against the fake; neither is
  closable without the BoP integration they belong to.

## Still blocked by owner gates (unchanged)

- Finance sign-off + cash-cap activation (WP13 G1); BoP merchant agreement,
  sandbox, idempotent provider requests and reconciliation (WP14 G2, incl. the
  two backlog items above); staffed rota/MFA (WP15 G3/G6); TRUNCATE/owner-grant
  hardening + Azure subscription/ACR/Key Vault/DB binding (WP16 cutover);
  WP17 pilot-gated capabilities (all OFF, test-asserted); EAS projectId/device
  testing; native Arabic review (G7 — design-wp13-wp15 UI packets D13–D15 are
  designed but not built; building them is the largest remaining non-gated
  item and was not started this session); any deploy. Production still runs
  the old build; Railway paused, Cloudflare sending domain missing
  (see `docs/HANDOFF-2026-10-21-deploy.md`).

## Commit plan (for owner approval — nothing committed)

Working tree still holds all of WP01–WP17 uncommitted (257 paths). Suggested
order, matching the repo's per-package + per-review-pass history style:

1. Commit WP01–WP12 as their per-package commits (docs + code + tests as they stand).
2. Commit WP13 (ledger, migration 16) including the append-only text change
   (`server/db/postgres-eligibility.sql`, `docs/implementation/WP13.md`).
3. Commit WP14 (payments, migration 17) including this session's refund slice:
   `server/domain/payments.ts`, `tests/payments.mjs`, the `server/main.ts`
   envelope bypass, `docs/implementation/WP14.md`.
4. Commit WP15, WP16, WP17 packages as they stand.
5. Commit the review-pass fixes as their own commits where they are separable,
   then this handoff + `docs/HANDOFF-2026-10-27-continue.md`.

Exact grouping of the 257 paths per package should be confirmed file-by-file
at commit time (`git status --porcelain`); do not push or deploy without
separate approval.
