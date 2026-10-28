# Continuation prompt — Fastship (Wind), 27 October 2026

Paste the block below into a fresh session opened in
`C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship`.

```text
You are continuing the Fastship (Wind) Expo/React Native project at
C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship. Windows 11, PowerShell 7 + Git Bash.
Read AGENTS.md and CLAUDE.md first. Follow the global rule: fix every problem you find
yourself, verify it, and report each fix as issue -> change -> verification.
Ask me only for secrets, account access, or approval of commit/push/deploy/delete.

## Where things stand (as of 27 Oct 2026)
- Branch master, HEAD 0f8c3bc. WP01–WP17 are built and verified but NOT committed:
  256 changed/untracked paths. Do not commit or push without my explicit approval.
- Work packages live in docs/implementation/WP01.md … WP17.md, with review docs
  (WP02-review … WP05-review) and prep docs. Designs are in docs/implementation/design*.md.
  Start by reading WP13.md–WP17.md, the WP13-WP15 design, and the contracts in
  docs/implementation/contracts/.
- WP13 balanced money ledger (migration 16, fixed the broken wp13_journal_balanced trigger).
- WP14 payment adapter, fake-only, 409 payments_unavailable live (migration 17).
- WP15 staff roles, support cases, audit, second-approver approvals (migration 18).
- WP16 staging runtime mode and real /api/ready covering migrations 3–18. DB/KV/AcrPull
  wiring is left as documented owner gates, not faked.
- WP17 activation-gate register for all 12 plan rows. All OFF; a test asserts defaults stay off.
- Gate last run 27 Oct: npm test 66/66; npm run test:persistence exit 0; tsc --noEmit exit 0;
  expo lint exit 0; node tests/azure-infra.test.mjs exit 0.
  One pg-import run failed with a 30s pg_dump timeout (SIGTERM) under load; the timeout in
  tests/pg-import.mjs was raised to 120s and the suite passed on rerun.
- Known accepted backlog: provider-refund call inside a DB transaction (WP14 activation);
  TRUNCATE/owner-grant hardening at WP16 cutover; pre-v18 legacy admin semantics; WP17 register depth.
- Owner gates (not for you to close): finance sign-off and cap activation, BoP merchant
  agreement, staffed rota/MFA, Azure subscription/ACR/Key Vault, EAS projectId and device
  testing, native Arabic review, any deploy. Railway builds were paused and the Cloudflare
  sending domain is missing (see docs/HANDOFF-2026-10-21-deploy.md). Production still runs the old build.

## First steps
1. git status --porcelain | Measure-Object -Line; git log --oneline -3. Confirm the state above.
   If it differs, report the difference before changing anything.
2. Re-run the full gate and save each log under $env:TEMP, then read the tail:
   npm test > $env:TEMP\g1.log 2>&1; Write-Output EXIT=$LASTEXITCODE; Get-Content $env:TEMP\g1.log -Tail 6
   Repeat for: npm run test:persistence, npx tsc --noEmit, npx expo lint,
   node tests/azure-infra.test.mjs. Use Write-Output for markers.
3. Only after the gate is green, pick up the next open item in the WP docs that does not
   depend on an owner gate.

## Model routing (strict, from the owner)
- Design work and all subagents: Haiku 5.5 only (claude-haiku-5-5). No Opus or Sonnet anywhere.
- Implementation: GPT-6.1 "Terra" via Codex/T3 delegate (orchestrator_capabilities first, once per thread).
- Second-opinion audits: opencode/deepseek-v4.1-flash-free. The paid DeepSeek V4.1 route
  failed on funds three times; the Free route delivered.
- Critics: OpenCode Meta Muse Wonder, cross-critiqued. One turn in the previous session failed
  with "provider could not start this turn". If Muse fails, retry once, then fall back to a
  Haiku 5.5 reviewer and say so.
- Every review round is a new delegate task with a fresh brief. Do not reuse a thread for review.
- Use parallel subagents where the work is independent. Do not wait on sleeps or polling.

## What worked last session (keep doing this)
- Gate runs from log files, not piped output (Select-Object truncation hid failures).
- Mutation-proven regression tests: break the fix on purpose and confirm the test fails.
- Independent review rounds with a different model from the author. They found real bugs:
  sign-blind negative remittance, order-sensitive journal replay, zero-price receipts,
  finance scope missing on adminBalances/remitCod, webhooks setting refund states,
  readiness passing with migration gaps, staging loopback [::1] bypass.
- Fix root causes in the shared function, not the reported path.
- Commit history records each review pass as its own commit. Match that style when I approve commits.

## Pitfalls already hit (do not repeat)
- Child test server: use shutdown(), not server.close(). A PG presence sweep kept the pool alive and hung the legacy map suite.
- A FK hardening broke pg-import's append-only TRUNCATE expectation. Reverted to an indexed, FK-less table.
- pg-contracts readiness showed migration 3 instead of 18 until the readiness check was fixed.
- Don't add FKs on append-only ledger tables without checking pg-import first.
- pg_dump under load can exceed short spawn timeouts; keep test timeouts generous and rerun before blaming code.

## Constraints
- Migrations, money paths, and auth paths need a runnable check that fails when the logic breaks.
- After any UI change, run npm run screens so docs/screens matches the code. Keep the logo in
  src/ui.tsx and scripts/make_icon.py identical. Keep the splash (app.json, imageWidth 120) and
  src/intro.tsx (TILE = 120) in step.
- Expo APIs: read the expo major version in package.json, then fetch the matching versioned docs
  (https://docs.expo.dev/versions/v<major>.0.0/) or docs.expo.dev/llms.txt. Never answer from memory.
  Add packages with `npx expo install`, never npm/yarn/bun add directly.
- Never create or edit ios/ or android/ by hand (CNG).
- Shortest working diff, no speculative abstractions.

## Deliverable for this session
Finish whatever is open in the WP docs that does not depend on an owner gate, keep the gate green,
and update the WP docs and a new docs/HANDOFF-<date>.md. End with: what changed, what was verified
(with log tails), what is blocked by which owner gate, and the exact commit plan for my approval.
Do not commit, push, or deploy.
```

## Gate evidence (27 Oct 2026, this session)

| Gate | Result |
|---|---|
| `npm test` | exit 0, Integration gate: 66 suites passed |
| `npm run test:persistence` | first run exit 1 (pg-import `pg_dump` 30s timeout, SIGTERM); after timeout raised, pg-import alone exit 0 and full run exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | exit 0 |
| `node tests/azure-infra.test.mjs` | exit 0 |

Fix made: `tests/pg-import.mjs:114` `pg_dump` timeout 30s → 120s. Verified by the persistence rerun above.
