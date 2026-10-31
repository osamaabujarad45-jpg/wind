# T18 asynchronous bounded password hashing — 29 October 2026

Status: complete. Revision `85b5a3a4f3c6fc3044dc2aaaa5f95db1782f873d` plus uncommitted T18 changes. Host: explicitly local fallback; k5 was unreachable in T01/T17. Tier: disposable SQLite and local loopback PostgreSQL fixtures, synthetic credentials only; no production data or real account rows touched.

## Implementation

- `server/domain/passwords.ts` (new): scrypt runs only in a dedicated worker pool, never on the HTTP event loop or the shared libuv pool. Default 2 workers (`WIND_PASSWORD_WORKERS`, 1–8) and a 64-job queue (`WIND_PASSWORD_QUEUE`, 0–1024); one job per worker. Beyond that admission rejects with `PasswordBusyError`, which the server answers as retryable HTTP 503 `password_busy` rather than a wrong password. Stored format is unchanged (`16-byte-hex salt:32-byte-hex key`) and the T17 guard (`^[^:]{1,256}:[a-f0-9]{64}$`, non-hex historical salt accepted) runs before any KDF.
- `server/main.ts`: every password use is awaited — login, register, email reset, own-password change, support reset, Entra placeholder, partner placeholder and the operator `enroll` CLI. `PasswordBusyError` maps to 503. The own-password change rechecks the exact stored credential it approved inside its short transaction, so a concurrent change is not overwritten. Shutdown closes the worker pool.
- Request transaction boundary: the generic Postgres request envelope held a connection and transaction for the whole handler, so a queued KDF would have held it too. Login/register/reset/reset-code/Entra, `/api/me/password`, the support password reset and partner routes now take the same direct path as phone/payment routes. Register and Entra perform an explicit short atomic write after the KDF; the partner placeholder KDF runs before the partner-order transaction; the partner durable-schema gate is preserved. Reset and both password-change handlers already owned short transactions after the KDF.
- `server/domain/phone-identity.ts`: constructor callbacks accept sync fixtures or async production callbacks. `command` now verifies immutable receipt payloads and password fingerprints before taking the command lock; a receipt that appears concurrently triggers one recheck outside the transaction. For a phone change, the rate admission and current-password KDF run in `prepare` before the transaction, and the work transaction revalidates that the user credential still equals the approved snapshot. For recovery, `prepare` validates the challenge, device/scope, expiry, attempts, authority and proof digest and only then derives the new password; the work transaction re-locks, revalidates the same snapshot, verifies the prepared key exists and consumes the proof in the same transaction as the password update and session revocation. No transaction, row lock or advisory lock is held across a KDF.

## Verification (sequential commands, exact exits)

| Command | Exit | Result |
| --- | --- | --- |
| `npm run test -- --filter=registration` | 0 | 2 suites: legacy non-hex salt login, six malformed fixtures still 401, T18 legacy/malformed/format checks, 70-job KDF burst (exactly 2 active + 64 queued, 4 busy rejections, no unhandled rejection), `/health` answered while saturated, existing HTTP flows unchanged |
| `npm run test -- --filter=email` | 0 | 1 suite; expected synthetic provider 403 logs |
| `npm run test -- --filter=session-idle` | 0 | 1 suite |
| `npm run test -- --filter=entra` | 0 | 3 suites; expected synthetic 503 log |
| `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning tests/phone-identity.mjs` | 0 | two-API command replay, current-password change, wrong-purpose/5-lock/expiry, session revocation |
| `node … tests/phone-identity-recovery.mjs` | 0 | unknown/wrong/locked public guesses invoke 0 KDFs; valid proof invokes 1; replay checks the salted fingerprint once; one-use consumption and key rotation preserved |
| `node … tests/pg-email.mjs` | 0 | register/login/reset on local PostgreSQL through the new direct request path |
| `node … tests/pg-contracts.mjs` | 0 | 174 exchanges, including auth and partner orders, on local PostgreSQL |
| `npm run lint` | 0 | Expo lint |
| `npm run typecheck` | 0 | app and server configurations |
| `npm run test:load` | 0 | all 14 performance gates and 6 correctness checks; auth-8: 40 password logins at concurrency 8, health p95 3.82 ms and order-read p95 4.16 ms during KDFs |

The first load run failed only the contended high-concurrency gates (`read-60` 622 ms, `mixed-60` 1079 ms) while other local agent/persistence processes were active; the auth-8 KDF gates passed in that run too. The rerun above, with the machine quiet, passed every gate. This is labelled local fallback, not k5 evidence.

## Failure found and fixed

The worker bootstrap is evaluated as CommonJS with `require`. The registration suite's cleanup child is launched with `node --input-type=module -e`; worker threads inherit `execArgv`, so the bootstrap was evaluated as ESM and `/auth/login` returned 500 (`require is not defined`). The worker now starts with `execArgv: []`; the child login assertion passes. This was reproduced before the fix and covered by the same suite.

During the busy multi-agent window the expiry assertion in `tests/phone-identity.mjs` twice returned the success response, then passed 5/5 consecutively and again in the final run with no code change. That test file is unmodified in the committed tree (temporary diagnostics removed); the focused recovery suite and the expiry-specific assertion pass. The cause was not reproducible in isolation and is recorded as a contention observation, not a known product defect.

## Remaining risks / blockers

- k5 unreachable: no remote comparison. Bounded load numbers are local-only.
- Admission overflow is a 503 (`password_busy`); clients must retry. Queue memory is bounded by 64 jobs plus two in-flight derivations.
- Workers clear `execArgv`, so they do not inherit Node memory/loader flags. scrypt's default memory (about 16 MiB per derivation) is bounded by the two workers.
- On non-transactional backends a failed session insert after a successful registration insert leaves a recoverable user row (login completes it), matching the previous SQLite behaviour. Register/Entra writes are explicitly atomic on PostgreSQL.
- The shared dirty tree also carries T04/T05/T17 and other in-flight agent work; T18 changed only `server/domain/passwords.ts`, `server/main.ts`, `server/domain/phone-identity.ts`, `tests/registration.test.mjs`, the already-present auth phase in `scripts/check-load.mjs`, this file and the T18 section of `tasks/todo.md`. No production data, commit, push, deployment or emulator was used.

## Follow-up audit (final code state)

Two repairs were needed after the first pass, both inside the new request-transaction boundary, because a bare `BEGIN` replaces the generic envelope but does not set its Postgres session context:
- Partner order creation now runs in `persistence.atomic({ purpose: 'partner_api', correlationId })` instead of `BEGIN`/`COMMIT`. The partner order and notification triggers journal `order.created`/`notification.requested`, and they read `wind.actor_id`/`wind.system_purpose`; the bare transaction silently relabelled those events `database_maintenance`.
- The support password reset wraps its existing short transaction in `persistence.atomic({ id: admin, correlationId })` for the same reason: its `security_events` insert journals `security.recorded`, which must keep the acting administrator instead of a null actor.

Independent final run on the code above (sequential, local fallback; k5 unreachable):

| Command | Exit |
| --- | --- |
| `npm run test -- --filter=registration` | 0 (2 suites) |
| `npm run test -- --filter=email` | 0 (1 suite, expected synthetic 403 logs) |
| `node … tests/phone-identity-recovery.mjs` | 0 (0 KDF for invalid/locked, 1 for valid, 1 fingerprint check on replay) |
| `node … tests/phone-identity.mjs` | 0 (change-purpose prepare + revalidation) |
| `npm run test -- --filter=contracts` | 0 (2 suites, 174 exchanges incl. partner) |
| `node … tests/pg-contracts.mjs` | 0 (174 exchanges against local PostgreSQL) |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 (app + server) |
| `npm run test:load` | 0 (all 21 gates) |
| `git diff --check` | 0 |

`npm run test:load` on the final code: auth-8 issued 40 password logins through the two-worker pool with no admission refusal, login p95 345 ms, `/health` p95 22.7 ms and order-read p95 14.2 ms while scrypts ran, and every legacy gate passed. An earlier attempt failed only the contended `mixed-60` gates (770 ms) while another local agent was running PostgreSQL suites; the quiet rerun passed all gates. These numbers remain local-only.

