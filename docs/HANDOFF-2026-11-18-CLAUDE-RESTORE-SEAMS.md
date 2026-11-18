# Claude handoff — 18 November 2026 — restore seams and the picomatch follow-up

Continues `HANDOFF-2026-11-18-CLAUDE-NEW-KNOWLEDGE-REA-BUILDS.md` §7.1 and the open item left by the 17 Nov integration session (`HANDOFF-2026-11-17-OPUS-INTEGRATION.md`). New facts only.

Labels: `[ran]` command this session · `[k5]` DESKTOP-S2JKMK5 over SSH · `[read]` source opened · `[I]` inference.

## 1. Restore-seam audit (REA §5.1–5.3 applied to Fastship)

`[read]` Every client restore boundary that parses saved JSON:

| Seam | Shape on load | Verdict |
|---|---|---|
| `src/booking.ts` `readBooking` | strict; optional fields defaulted by `book.tsx` (`p.priority ?? 'standard'`, recipients `?? ''`) | sound |
| `src/driver-command.ts` `readDriverCommand` | strict; wp01/SHIP-17/seal fields optional and validated when present; 1 h TTL | sound |
| `src/protected-recovery.ts` envelope | strict; invalid record deleted and its deadline cancelled | sound |
| `src/offline-summary.ts` `readOfflineSummary` | strict, rebuilds allowlisted shape, `scheduledFor ?? null` (field added 12 Nov, after the pilot started) | sound — the Fastship example of the right pattern |
| `src/client-diagnostics.ts`, `src/chat-outbox.ts`, `src/driver-presence-runtime.ts`, `src/phone/command.ts` | strict filters | sound |
| `src/shop-cart.ts` | **accepted a cart missing fees, city, names, byWeight or policy** — Captain-shaped hole | fixed (#89) |
| `src/app/admin/cash.tsx` | unparseable slot threw `SyntaxError` on every visit, never cleared | fixed (#89) |

`[read]` No false drops: every cart writer (`setQuantity` from `merchantView`/`itemView`, `replaceCart` from `POST /api/orders/:id/shop/again`) produces fields `readCart` accepts; the shop schema has names `NOT NULL`, fees `>= 0`, prices `>= 1`, policy `CHECK (policy IN ('remove','ask_first','similar'))` (`server/db/postgres-shop.sql`, `sqlite-shop.ts`).

Server `command_results` replay stores a response for the command TTL only; not a long-lived forward-migration risk `[I]`.

Rule for new persisted fields (also written into `readCart`'s comment): backfill at the load boundary (`saved.x ?? default`) when a truthful default exists, otherwise reject at the boundary or move to a new key. Never accept and let a screen read a missing field.

`tests/legacy-restore.test.mjs` pins blobs as earlier versions wrote them.

## 2. PRs

| PR | What | State |
|---|---|---|
| #88 picomatch hardening (17 Nov follow-up) | guard + audit waiver; three Haiku rounds this session: `+(a+)`, regex `+` after `)`/`}`, nocase folds (both cases, any truthy `nocase`), escaped classes `\d`/`\w` not literals, first-character rule restores `*.+(png\|jp?g)` and case-sensitive `+(a\|A)` | fixes at cabb184d; merge once CI is green (`gh pr view 88` for the outcome) |
| #89 restore seams | §1; Haiku: unknown city id, empty cart, `parseCashSlot` tested directly; re-review clean | lands with this file |

## 3. Evidence

- `[k5]` `D:\wind-lead-1115\rb18` (#89 head c406c1a5, `node_modules` junction to `D:\wind-master-bcc0c97-codex`): `legacy-restore`, `admin-cash-command`, `driver-command`, `protected-recovery`, `booking-schedule-restore`, `booking-recovery-actions`, `chat-outbox`, `shop-flow`, `presentation`, `large-text` all exit 0; `npx expo lint` 0; `tsc --noEmit` 0.
- `[k5]` Red run `D:\wind-lead-1115\rb18r`: the same test against master's `shop-cart.ts` (old validator exposed as `readCart`) fails `a cart without city is dropped, not shown as NaN`, exit 1. The test is not vacuous.
- `[k5]` `rb18b` (#89 at 398cc7ef): same 10 suites 0, lint 0, tsc 0.
- `[k5]` `pm88c` (#88 at cabb184d): picomatch shape/behaviour test 0 on both majors, lint 0; red run against 69318a9e fails `+(\d|1) backtracked`; earlier red against c2e8091b failed `+(a+) backtracked`. `audit-gate` passes every fixture case; its last assertion (repository lockfile) and the consumer-resolution test need `npm ci`, so CI is their evidence.
- Tree pins recomputed with an independent Python replica of `treeHash` that reproduces the previous pins exactly.
- Full suites: GitHub Actions on each PR head (`verify`, `persistence`, `image`).
- Trap: this shell's heredocs collapse doubled backslashes; write scripts with the Write tool (two escaping bugs were caught that way).

## 4. Not done / open

- Phone update-install test (REA §5.3: `install -r` over existing data) for Fastship: NOT RUN. The shop line is off in production (D-2), and the admin cash screen is web. A release that changes a persisted shape should get one on the A53 before shipping.
- Merges are not deploys; production is unchanged.
- REA §6 items (map tiles in the demo apps, WindRide/WindBazaar signer mismatch) are owner-side and untouched.
