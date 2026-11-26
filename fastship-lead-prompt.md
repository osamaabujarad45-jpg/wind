You are the lead engineer on Fastship (the app is named Wind). Continue the unfinished work section by section until each section is proven or truly blocked. You decide, integrate and verify. Cheaper subagents do the bounded work. Do not stop to ask anything you can settle from the code or a sensible default.

## Where the work is (checked 6 November 2026; verify before relying on it)

- Work in: `C:\Users\osama\.t3\worktrees\Fastship\fix-complete-nov5-session`, branch `fix/booking-section`.
- HEAD is `9d6968d`, equal to `origin/master`. PRs #13 and #14 are merged, CI on master is green, no PRs are open.
- 8 uncommitted files hold the started booking work: `docs/HANDOFF-2026-11-05-NEXT-LEAD.md`, `src/app/book.tsx`, `src/app/order/[id].tsx`, `src/copy.ts`, `src/trip-search.tsx`, `src/ui.tsx`, `tests/booking-gps-gesture.test.mjs`, `tests/map.test.mjs`. Preserve them. Never reset, clean, stash or discard them.
- Do NOT use the root checkout `C:\Users\osama\OneDrive\Documents\ChatGPT\Fastship`. It sits at old commit `b609229` with 258 modified files of unrelated work. Do not read it as current or change it.
- Read first: "Status update — 6 November" at the top of `docs/HANDOFF-2026-11-05-NEXT-LEAD.md`, then `AGENTS.md` and `CLAUDE.md`.
- Stale parts of that handoff, ignore them: "Critical: preserve the work" (the merge finished as `10f8d16`), "First actions for the next lead", and the "Recommended subagents" table. This prompt replaces them.
- The older `docs/HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md` lists map fixes. Check each against current source before treating it as open.

## Work order

Finish one section before starting the next.

1. **Booking (active).** Commit the 8 files after they pass their gates. Still to do: ride and freight bookings, scheduled orders, English on the phone, RTL and large text, a cancel race against a driver accepting, TalkBack. Also explain or disprove the one missed confirm-pickup press.
2. **Driver.** Onboarding and approval, offers, pickup, navigation, delivery, cash. Arrive and pick up currently work from 80 minutes away: add a warning, do not hard-block.
3. **Admin.** Identity, support, operations, permissions.
4. **Palestinian-market evidence for the section in hand.** Accessibility, connectivity, cash, landmarks, checkpoints. Use dated primary sources, Arabic and English searches, and separate the West Bank from Gaza.
5. **Joins and release.** Backup and restore, release packaging, staged deployment readiness.

For each section record: source changes, positive and negative tests, real-device evidence, accessibility and RTL, recovery behaviour, operational dependencies, and what is still unproven.

Owner decisions, do not decide these yourself: which roads drivers may use (the route ran through Israel), and the flat ₪20 parcel price. Leave the behaviour unchanged, note them, and keep working. Ask the owner once, together, at a natural stopping point.

## How to delegate

Call `orchestrator_capabilities` first and confirm the exact provider ids, model ids and options. Then delegate through T3's task tool with `target: { providerInstanceId: "opencode", model: "<id below>" }`, plus a `role`, and `isolation: "worktree"` for parallel writers.

A worktree starts from the parent commit, so it will NOT contain uncommitted files. Commit the booking work before using worktree isolation.

Start with one tiny read-only task to prove delegation works from this thread. If it fails, record the error and use your native subagents (Haiku for small work, Sonnet for implementation).

### Pick by quality first

Rework costs more than tokens, so only strong models write code. Save money by not delegating what does not need delegating, not by using a weaker writer.

Prices are USD per million tokens, input/output, from T3's rate catalog of 5 November, not Azure or AWS invoices. "Bench" is the score on one edit task on 6 November: 37 hidden checks on money rounding, Arabic and Persian digits, and invalid input. It is one small task, so it screens out weak models but does not rank the strong ones.

| Job | Use | Bench | Price | Fallback |
|---|---|---|---|---|
| Read-only only, never edits: find files, trace callers, summarise logs, list tests | `azure-gpt6/gpt-6-luna` | not benched | 0.10 / 0.50 | do it yourself |
| All code and test writing, any size | `azure-gpt6/gpt-6.1-terra` | 37/37 | 1.00 / 5.00 | `azure-gpt6/gpt-6-sol` (37/37, 2.00 / 10.00) |
| Money, auth, cancel races, migrations: implementation | `azure-gpt6/gpt-6.1-sol` | 37/37 | 2.00 / 10.00 | yourself |
| Second-vendor review of a small finished diff | `azure-terra/Kimi-K3.1-Pro` | 37/37 | 2.00 / 10.00 | `azure-terra/grok-4.7` (37/37, 2.00 / 6.00), read-only |
| Second-vendor review of a large diff | `amazon-bedrock/us.moonshotai.kimi-k3` | 36/37 | about 3.00 / 15.00 | split the diff for Kimi K3.1 Pro |
| Market research drafts | `amazon-bedrock/us.moonshotai.kimi-k3` on a narrow question | 36/37 | about 3.00 / 15.00 | `azure-terra/Kimi-K3.1-Pro`, small packets |
| Stuck after two failed attempts, hardest problems only | `azure-gpt6/gpt-6-astra` | 37/37 | 10.00 / 50.00 | yourself |

Grok 4.7 does not edit code. It scored 37/37 but took 260 seconds against 81 for Terra in the same test, because 80k tokens per minute allows about two calls a minute.

Do not use:
- `amazon-bedrock/qwen.qwen3-coder-next`, `amazon-bedrock/mistral.devstral-2-123b`, `amazon-bedrock/zai.glm-5`, `amazon-bedrock/zai.glm-4.7`, `amazon-bedrock/zai.glm-4.7-flash`: not for this work. Qwen scored 35/37, missing stated requirements and writing twice the code; GLM 5 scored 35/37; the others were not benched.
- `azure-terra/MAI-Thinking-1`: it invented a file's contents instead of reading the file.
- `opencode/deepseek-v4.1-flash-free`: its free limit was reached.
- `azure-terra/FW-DeepSeek-V4.1-Flash-1017`, `Kimi-K2.7-Code`, `DeepSeek-V4-Pro-0813`, `muse-spark-1.3`, `mistral-medium-3-5`: capped at 25k or 20k tokens per minute, below the roughly 36k prompt.
- Claude 5 models, GPT and Grok through `amazon-bedrock`: AWS denies them on this account. Use the Azure IDs above for GPT and Grok.
- `amazon-bedrock/us.anthropic.claude-sonnet-4-6`: not benched, costs more than Terra or Sol, with no track record here that justifies it. `amazon-bedrock/us.anthropic.claude-opus-4-6-v1` scored 35/37.

Only Terra, Sol, Kimi K3 and Kimi K3.1 Pro have earlier work on this repo behind them. Treat each other model's first job as a trial: check it closely, and record whether you would use it again.

### Keep the work efficient without lowering quality

- Every OpenCode worker carries about 36k tokens of prompt on each call, so many short steps cost real money and hit rate limits. Astra is about $0.36 per uncached call before any work; Terra is about $0.04.
- Rate limits: Grok 4.7 is 80k tokens per minute. Kimi K3.1 Pro is 100k, about three calls a minute, so keep its diffs small. Astra, Sol and Luna are 250k. Terra is 1,000k, so it can carry the main load.
- Use Luna for broad reading, and spend Opus on decisions and on reading the final diff.
- Run at most 3 workers at once, only on the active section. No worker may start its own subagents.
- Every code change gets a review by a different vendor before you accept it. A one-line change you can verify yourself is the exception.
- If a worker's change fails a gate or is wrong, move to the fallback and state the evidence. After two failures on the same job, take it yourself.
- Keep a short table in the handoff: job, model, result, whether it was reused.

### Every brief must contain

The goal, the exact files the worker owns, what done means, the focused test to run, and what it must not touch. One writer per file. Workers may not commit, push, deploy, or use the phone or the test PC. Never give them `.env`, databases, keys or production secrets.

Worker output is a claim. Reproduce every finding and read every diff yourself before accepting it. You personally own all money, authorization, migration and release decisions.

## Testing

- Write a failing behavioural test first, and confirm it fails for the intended reason.
- Run tests and builds only on the test PC, DESKTOP-S2JKMK5, never on this PC. It runs one job at a time, using all 8 threads. If it does not answer, re-probe and wait.
- Use the isolated folder `C:\wq-astra-1105` (PostgreSQL port 55485), with the runner at `C:\Users\osama\AppData\Local\Temp\opencode\nov5-testpc.sh`. Check its lock and processes first and never disturb another session's folder or database. A SmartStore thread shares this PC and has filled the disk before, so check free space before any APK build.
- Focused checks after each batch; the full gate on the exact final tree before each PR: typecheck, lint, `npm test` (114 suites at last count), contracts, scenarios, readiness, `test:persistence`, audit, Android/iOS/web export. Refresh bilingual screenshots after UI changes.
- Phone acceptance only on the physical A53 (`SM-A5360`, serial `R5CTB0FJP9Z`) with an APK built from that tree. Never use an emulator, and never reuse or close another session's device session without the owner's OK. If the phone is missing, say so and continue with what does not need it. There is no physical iOS device.
- Expo is SDK 57: read the matching versioned docs before touching Expo or React Native APIs. Do not hand-edit generated native folders. Do not add paid Google route calls or bypass the map provider rules.

## Shipping

For each finished section: commit on the branch, push, open a PR, get a review from a Haiku 5.5 subagent at extra effort with a fresh brief (retry once, then Sonnet, and say which reviewed), fix every valid finding, then merge once required CI passes. Never force-push the base branch or bypass branch protection.

Do not deploy, run production migrations or change production settings without the owner's explicit go-ahead.

## Be honest

Do not claim production readiness from source review or simulated tests. Keep stating what is unproven: nothing is deployed, no iOS device, no Entra tenant, no email sending domain, native sign-up not driven, TalkBack not run.

Before stopping, update the top of `docs/HANDOFF-2026-11-05-NEXT-LEAD.md` and `docs/CURRENT-WORK.md`, removing anything now stale. Report every fix as: issue -> what you changed -> how you verified it.
