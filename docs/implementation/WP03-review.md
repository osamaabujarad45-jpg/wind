# WP03 independent acceptance for local engineering

The parent reviewed the final PostgreSQL implementation and ran `npm run test:persistence` successfully after the last fixes: 14 direct boundary/schema/import/restore/race/financial/privacy/packaging test files plus 21 legacy HTTP suites. Production cutover and horizontal deployment remain disabled, as recorded in [WP03.md](WP03.md).

The legacy-suite runner preserves the existing HTTP assertions in generated ignored copies. Its explicit fixture adaptations use asynchronous PostgreSQL inspection, valid completed-history timestamps, actual delivery/proof commands for referral reward seeds, and PostgreSQL catalog column checks instead of SQLite PRAGMAs. Original SQLite migration assertions still run in `npm test`. No fake SQLite results are returned to PostgreSQL tests. Results/logs are under ignored `.expo/pg-legacy/`.

Independent review findings were fixed before acceptance:

- PostgreSQL folded shorthand admin aliases and rejected `id IS NOT ?` -> adapter now preserves both alias forms and uses null-safe distinct comparisons -> safety, exceptions, credit, push, saved-place and all other legacy PostgreSQL suites pass.
- Import keys assumed every table had a primary key, collapsing valid coupon redemptions -> discover non-null unique keys and preserve full row multiplicities when no key exists -> multiple valid redemptions import and restore; 29 tables and 135 rows reconcile exactly.
- Raw database errors could contain private messages and complete row details -> allowlisted diagnostics with SQLSTATE and correlation metadata -> black-box trigger error test proves HTTP500 stays generic and private sentinel/phone/PIN/hash/bearer values are absent from captured server diagnostics.
- Removing global statistics reuse regressed read latency -> request-owned aggregate reuse with write/transaction invalidation -> real isolation and mutation tests pass; the final full load run reports read60 p95 368.95ms, mixed60 334.81ms and critical-command acknowledgment 308.13ms, passing the enforced targets. This supersedes the failed target in [WP02-review.md](WP02-review.md).

Backup/restore was exercised with real `pg_dump`/`pg_restore` into a fresh isolated database, followed by exact reconciliation and HTTP response comparisons. This local synthetic rehearsal is not a production-data restore or owner authorization to switch writable databases.

The final default 47-suite integration gate, lint and typecheck passed in the implementation agent. The parent separately reran the full persistence gate and security/runtime packaging checks. WP04 may proceed; its durability, later measured capacity, operating/provider evidence and physical-device gates remain outstanding.
