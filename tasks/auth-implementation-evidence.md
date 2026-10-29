# T17 malformed password handling — 29 October 2026

Status: complete. Revision `85b5a3a4f3c6fc3044dc2aaaa5f95db1782f873d` plus uncommitted server/main.ts and tests/registration.test.mjs changes (also includes independent T05 routing changes in server/main.ts). Host: explicitly local fallback; k5 was unreachable in T01. Tier: disposable SQLite HTTP fixtures, no real credentials or production rows modified.

Malformed stored key → validate nonempty bounded historical salt, one separator and exactly 64 hexadecimal key characters before comparison → six malformed disposable stored values return the same HTTP 401 wrong_credentials response. Non-hex historical salt remains compatible and successful legacy login is asserted. The key/password is not included in the rejection response or diagnostic logger.

The added regression was run before the fix: `npm run test -- --filter=registration` exited 1 and logged HTTP 500 for the malformed fixture. Its cleanup subprocess also failed because the corrupt fixture was not restored on assertion failure; the test now restores the original row and limiter state in finally, so later cleanup cannot mask the primary result.

After fix, sequential commands: `npm run test -- --filter=registration` exit 0 (2 selected suites); `npm run test -- --filter=email` exit 0 (1 suite, expected synthetic email 403 failure logs); `npm run lint` exit 0; `npm run typecheck` exit 0, app and server configurations. No native/provider test required for this server-format validation. T18's asynchronous hashing remains separate.
