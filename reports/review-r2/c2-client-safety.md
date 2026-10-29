# Cross-critique: client-app.md (R3) & safety-net-and-release.md (R4)

HEAD verified: `5f941fd`. The tree is clean at this HEAD apart from the untracked `reports/` directories (the `server/migrate.ts` modification present earlier in the session is gone; nothing here depends on it). Every citation below was re-read at HEAD; where a line moved I give the HEAD line.

Method: for each finding I wrote down the precondition that would make it real, then checked exactly that precondition in the cited function. Verdicts are on the code, not on the plausibility of the story.

## Adjudication table — R3 (client-app.md)

| # | Finding | Verdict | Corrected severity | One-line reason |
|---|---|---|---|---|
| C1 | Admin pricing saves `0` for a blank field | CONFIRMED | P1 | Chain is real end to end (`typedNumber('')===0` → all keys posted → `n < 0` is the only floor), but the impact text needs two factual corrections: the price floors at ₪1 (`parcelFare`), and `commission: 0` is not "a valid price" — it 500s every quote on Postgres (see Contradictions) |
| C2 | A saved pending booking is a one-way door | CONFIRMED | P2 | `locked` includes `!!pending` (book.tsx:67); the only `setPending(null)` is the terminal-4xx branch (:252), the success path just clears storage and navigates (:240), no discard control exists, and `forget()` (session.tsx:48-51) leaves `booking.<id>` intact |
| C3 | One corrupt pending record deadlocks Book forever | CONFIRMED-DOWNGRADE | P3 | The catch at :155 really never sets `ready`; but no shipped code path writes a record `readBooking` rejects (`storage.set(key,null)` deletes the key, api.ts:26-30), so this is forward-compat hardening, not a live lock |
| C4 | Admin money/destructive actions commit on one tap, no cap | CONFIRMED-DOWNGRADE | P3 | No `confirm()` exists anywhere in the three files, but the money claims are wrong: remittance is server-capped *and* stored `pending` for driver confirmation (main.ts:2463-2466), and dispute credit is 1..50 on both sides (orders.tsx:80-85, main.ts:1596) |
| C5 | Subscription Activate/Reject can both be in flight | CONFIRMED-DOWNGRADE | P3 | The race exists via the *sibling* button, but the stated mechanism is false: `ui.tsx:249` does `disabled={disabled \|\| loading}`, so the button being pressed is locked; needs a stalled request plus a deliberate tap on the opposite action |
| C6 | Large OS text scale clips every text variant | CONFIRMED-DOWNGRADE | P3 | Fixed `lineHeight` with scaled `fontSize` is a real RN defect, but the arithmetic only breaks at ≳1.5×; at the common 1.3× (body 18.2 < 21, caption 15.6 < 17) nothing clips, so "130–200%" overstates it |
| C7 | A push tapped at cold start loses its deep link | CONFIRMED | P3 | No `getLastNotificationResponse*`/`useLastNotificationResponse` in `src/`; SDK 57's own Expo-Router recipe reads the last response before attaching the listener |
| C8 | Driver-work provider re-renders every consumer every 3 s | CONFIRMED | P3 | `setTrackingResult({...})` allocates every tick (driver-work.tsx:312-313) and the context value is an inline object literal (:328-329) |
| C9 | `scheduleSlots()` runs on every keystroke | CONFIRMED | P3 | Called in the component body (book.tsx:60); every `Field` edit is `setValues`/`setState` on the same component, so all ~330 `formatToParts` calls repeat per character |
| C10 | Arabic strings and "Palestine" live outside copy.ts | CONFIRMED | P3 | ui.tsx:287/291 and order/[id].tsx:32 are literal, exactly as quoted |
| C11 | "Use my location" wipes the typed landmark silently | CONFIRMED | P3 | Real on the GPS path (book.tsx:111), but the finding over-reaches: the pin path it also cites *does* announce the change at :459 (`c.pinCityChanged`), so only one of the two paths is silent |
| C12 | Booking freshness validated on a different value than submitted | CONFIRMED | P3 | `command = pending ?? newBooking(...)` (232) sends the frozen payload's time, and the guard at :208 is skipped entirely when `pending`; server rejects a stale time with 400 (`invalid_schedule`, main.ts:1286) which then clears the pending at :252 |

## Adjudication table — R4 (safety-net-and-release.md)

| # | Finding | Verdict | Corrected severity | One-line reason |
|---|---|---|---|---|
| S1 | Docker module guard never reads nested `server/**` | CONFIRMED-DOWNGRADE | P2 | Hole proven exactly as described; but 5 nested files already import `src/model.ts`, which *is* copied (Dockerfile:26) — so nothing is broken today: it is a missing regression net, not a live bad image |
| S2 | `npm test` runs a hardcoded 78-name list | CONFIRMED | P1 | 78 names, 73 `*.test.mjs` on disk, 4 orphaned (`db-persistence`, `db-api`, `database-logging`, `azure-infra`), 130 `.mjs` total; nothing globs the directory |
| S3 | CI never runs `test:persistence` | CONFIRMED | P1 | Both workflows checked: no `test:persistence`, no `services:`, no `postgres` anywhere in `.github/`; the Postgres half + outbox worker are ungated (its list is 49 names, not 52) |
| S4 | No CI job builds the deployed Docker image | CONFIRMED | P2 | ci.yml is 24 lines of checkout/install/typecheck/lint/test/audit/export; `deployment.test.mjs:17` only regex-matches the Dockerfile text |
| S5 | Five suites wait a fixed 50 ms for detached push | CONFIRMED | P2 | Identical `settle()` helper in the 5 named files, 35 call sites in push-server.test.mjs alone |
| S6 | Android versionCode is not in the repo | CONFIRMED-DOWNGRADE | P3 | All four facts check out (app.json has no `versionCode`, eas.json:3 `remote`, build.gradle:95 `1`, `/android` gitignored), but the normal EAS path is correct — only the documented local-signing fallback can produce `1` |
| S7 | Four browser gates hardcode 4188 and share a build dir | CONFIRMED-DOWNGRADE | P3 | Concurrency claim is true (4 scripts, one dir) but nothing runs them concurrently; the buried observation — no workflow runs any of them — is the more valuable half |
| S8 | `presentation.test.mjs` imports another test file | CONFIRMED | P3 | `import './customer-location.test.mjs'` at :2, and that file is separately registered at run-tests.mjs:62 |
| S9 | The URL-decoder DoS regression uses a 3 s wall clock | CONFIRMED | P3 | Code is as quoted; the "can approach 3 s" premise is speculative (~0.1 s of work against a 3 s budget), so only the ambiguous `child.error` message is actionable |
| S10 | Every persistence run leaks a Postgres schema | CONFIRMED | P3 | `CREATE SCHEMA` in both files, `DROP SCHEMA` appears nowhere in `tests/` |

---

## Kills and downgrades (detail)

### C3 — corrupt pending deadlock: real code, unreachable trigger (P2 → P3)

**Claim.** `readBooking(saved)` throws → the `.catch` sets an error but never `setReady(true)` or deletes the key → the screen is locked on "Loading your request." forever.

**Code at HEAD.** `readBooking` (booking.ts:64-82) does throw `invalid_pending_booking`; the `.then` continuation reaches `setReady(true)` only at book.tsx:154, *after* the call at :124, and the `.catch` at :155 is exactly `if (mounted) setError(c.bookingStorageError)`. The deadlock is real if the throw happens.

**Why the severity fails.** The throw requires the stored string to parse to a shape this version rejects. `storage.set(key, null, true)` *deletes* the key (api.ts:26-30 → `SecureStore.deleteItemAsync` / `webSet` → `removeItem`), so the app never writes `"null"` and `readBooking(null)` returns `null` (booking.ts:65). Every field the app writes comes from `newBooking`, and today's checks mirror it. The reviewer supplies no shipped version that wrote a shape the current `readBooking` rejects; the trigger is a hypothetical future schema tightening. That is a P3 robustness fix (mirror the reviewer's two-line patch), not a P2.

**What the reviewer should have seen.** `storage.set(..., null)` is a delete, and `readBooking(null) === null` — that removes the only in-app producer of a bad record.

**Left standing.** The `ready` latch is genuinely one-way: nothing on screen re-runs the read except leaving and re-entering with the same key. The fix is still right.

### C4 — admin "one tap, no cap": the caps and the review step already exist (P2 → P3)

**Claim.** Recording cash settles a driver's debt with no amount cap; a dispute credit "mints real money"; blocking strands parcels; none uses `confirm()`.

**Code at HEAD.**
- `admin/cash.tsx` is not one-tap: the row button only *opens* an inline editor whose amount is prefilled with `owedCents - pendingCents` (:68), and the submit button is disabled unless the amount is non-zero (:62). No `confirm(` in the file.
- `recordCash` (main.ts:2443-2470) rejects `amount > balance.owedCents - balance.pendingCents` (:2463) — the cap the reviewer recommends as a fix is already server-side — and inserts a remittance as `status='pending'` (:2465-2466), i.e. awaiting the driver's confirmation. The advertised failure ("ledger says ₪500, balance drops, discovered days later") cannot happen.
- `admin/orders.tsx:80-85` `creditOf` already rejects anything outside 1..50 and the button is disabled on `undefined` (:120); the server enforces the same 1..50 (`:1596`). A mistyped credit is capped at ₪50 and audited (`DISPUTE_RESOLVED`, `:1606`).
- `admin/users.tsx:111-112` block/unblock is a genuine single tap with no dialog — but it is reversible (`unblock` restores `active`).

**Why the severity fails.** Every cited money path has a server-side bound, a typed-input prerequisite (≥5-char reason/resolution) or a driver confirmation. What is left is an inconsistency with the app's own `confirm()` convention, which is a P3.

**What the reviewer should have seen.** `server/main.ts:2463` and `:1596`, and the `disabled` condition at `cash.tsx:62` — all three are inside the files the finding cites or one call away.

### C5 — subscription race: real, mechanism misstated (P2 → P3)

**Claim.** "`loading` does not disable a `Button` (`ui.tsx:249` disables on `disabled || loading`, and these pass neither)".

**Code at HEAD.** `ui.tsx:247-249`: `const off = !!disabled && !loading;` then `<Press ... disabled={disabled || loading} ...>`. `loading` *does* disable the button that is loading. What stays enabled is the **other** button in the pair: with `busy === '<id>activate'`, the reject button's `loading` is `false` and it passes no `disabled` (subscriptions.tsx:45).

**Why the severity fails.** The window is one request. It requires a stalled call (the reviewer's own "the 30 s poll keeps showing pending") *plus* a deliberate tap on the opposite action. The server re-reads `status='pending'` (main.ts:2671) but two interleaved requests can both pass that read, so the race is genuine — just not a realistic accidental path. P3; `if (busy) return` + `disabled={!!busy}` still worth adding.

**What the reviewer should have seen.** The cited line says the opposite of the claim. The finding survives on the sibling button, not on `loading`.

### C6 — lineHeight clipping: real mechanism, overstated range (P2 → P3)

**Claim.** "at 130–200% the glyph box is taller than the line box… clips every piece of text".

**Code at HEAD.** `ui.tsx:166-174` sets `lineHeight` for all seven variants; `Txt` (:176-182) passes no `maxFontSizeMultiplier`/`allowFontScaling`. RN scales `fontSize` by the OS font scale and treats `lineHeight` as a fixed DIP, so the mechanism is real.

**Why the range is wrong.** At 1.3×: body 14→18.2 (<21), title 15→19.5 (<21), caption 12→15.6 (<17), micro 11→14.3 (<15), h1 21→27.3 (<28) — no clipping. Clipping starts around 1.5× (caption 18 > 17, title 22.5 > 21) and is severe at 2×+. So the defect is real for users on large accessibility sizes but not for the default or the common "Large" setting; the clip is a few points of ascender/descender, not a broken screen. Combined with the reviewer's own MEDIUM confidence, P3 is the honest level. A device at 150% would settle the exact cut; the fix (drop `lineHeight`, or scale it by `fontScale`) is cheap either way.

### S1 — Docker guard: hole proven, no current victim (P1 → P2)

**Claim.** The guard never opens `server/domain/*.ts`, so a new `src/` import there passes CI and kills the container.

**Code at HEAD.** `tests/deployment.test.mjs:43` seeds the queue with `readdirSync(new URL('server/', root)).filter(f => f.endsWith('.ts'))` — top level only. `:46-48`: for each `from './x.ts'`, `const target = …; if (target.startsWith('src/') && !needed.has(target)) { needed.add(target); queue.push(target); }`. Any target under `server/` is dropped instead of queued, so nested modules are never opened. `:51-52` then asserts only over `needed`.

**Why P1 overstates it.** Five nested modules already import `src/`: `server/domain/{statistics,route-quality,eligibility,realtime,destination-change}.ts` all import `../../src/model.ts`. `src/model.ts` is copied at Dockerfile:26 (needed by `main.ts`), so the guard's conclusion is correct *today by luck*, not by analysis. There is no broken image at HEAD. The failure mode when it does bite is loud (container exits at module resolution; `/ready` never 200; Railway rolls back), not silent corruption — a deploy failure, not a production incident. P2.

**What the reviewer should have seen.** They did see the 5 imports; they should have said "latent, zero current violations" instead of implying the guard is already wrong about a real module. The proposed fix (recursive readdir + queue every relative `.ts` + assert the scanned count) is correct — and should also cover the regex hole below.

### S6 — versionCode: factually right, path is the fallback only (P2 → P3)

**Claim.** The Android release version is not in the repo; a local signed build gets `versionCode 1`.

**Code at HEAD.** `app.json:17-19` android block, no `versionCode`; `eas.json:3` `"appVersionSource": "remote"`, `build.production.autoIncrement: true` (`:10-13`); `android/app/build.gradle:95` `versionCode 1`; `.gitignore:46 /android`.

**Why P3.** With `appVersionSource: remote` + `autoIncrement`, EAS owns the counter and the normal release path is correct — `versionCode` in `app.json` would be ignored. The defect only materialises on the documented local-signing fallback (`plugins/with-release-guard.js`), where a fresh prebuild emits `1`. That is a release-runbook bug with a late, loud Play rejection, not a default-path defect. The suggested fix (pin `versionCode`, or switch to `local`) is reasonable but changes the release process; P3, and say "local builds only" explicitly.

### S7 — port 4188: true, but nothing runs them in parallel (P2 → P3)

**Claim.** Two of the four browser gates cannot run at once.

**Code at HEAD.** `check-scenarios.mjs:15,19,39`, `check-readiness.mjs:12,16,28`, `check-customer-location.mjs:8,14,15`, `check-android-browser.mjs:12,15,20` — all bind `127.0.0.1:4188` and serve `.expo/location-review-web`; `check-scenarios.mjs:25` exports with `--clear` into that shared dir.

**Why P3.** The collision is real but requires a developer to start two manual scripts concurrently; no script, workflow or npm task does that, and the README-level flow is serial. The finding's own second half ("none of them is in a workflow") is the part that matters: the only browser journeys that exercise Arabic/English sign-in, home and booking are not in CI at all. That is the P2-worthy gap and it is buried in the "Why it matters" paragraph instead of being the finding. Port fix (`listen(0)`) is still correct and two lines.

### C11 — use-my-location wipe: right on one path, wrong on the other (scope correction, P3 held)

**Claim.** `setPickupNote('')` on a city change and "nothing tells the user".

**Code at HEAD.** GPS path, book.tsx:111-114: `if (result.city !== pickupCity) setPickupNote('');` then `setLocationError(fill(c.locationAccuracy, { city: city(result.city)[language], … }))` — the caption names the new city but never says the note was cleared. Pin path, :453-459: `if (near !== pickupCity) setPickupNote('');` … then `if (near !== …) setLocationError(fill(c.pinCityChanged, { city: city(near)[language] }));` — this path *does* announce the change.

**Verdict.** CONFIRMED for the GPS path only; the two pin-path citations are already handled by `c.pinCityChanged`. Keep P3, narrow the "Where" and drop the claim that the user is never told.

### C1 — the P1 needs two corrections (severity held)

**Claim.** A blank field is "a valid price of zero" and "every parcel booked afterwards is quoted ₪0".

**Code at HEAD.**
- `typedNumber('')` → `Number('')` → `0` (model.ts:234; verified in node). `values` is seeded from **all** of `me.settings` (settings.tsx:20), and `save()` posts **all** of them (settings.tsx:30). The server's guard is `!Number.isFinite(n) || n < 0 || (fractionSettings… && n >= 1)` (main.ts:2688) — `0` passes for every price key.
- But `parcelFare` is `Math.max(1, Math.round((s.parcelPrice + …) …))` (model.ts:181-182) and the server prices with the same `quote()` (main.ts:39-42, used at :1271 and :1390). So a blank `parcelPrice` yields **₪1 per parcel**, not ₪0.
- `commission: 0` is accepted, then `commissionOn(price, 0) === 0` and `minorUnits(0)` throws `RangeError` (`server/domain/quotes.ts:58-62`, called at `main.ts:1061`) → `/price` returns 500 on Postgres. That is R1's finding, and it contradicts R3's "valid price of zero".

**Verdict.** CONFIRMED, P1. The chain (blank → 0 → posted → accepted → "Saved") is verified. Rewrite the impact: ₪1 parcels, a 0 % commission that *breaks quoting entirely* on Postgres, and free/zero plan prices. Do not publish "₪0" or "a valid price of zero" — both are false at HEAD. Also note the one mitigation the reviewer missed: the four percentage fields render `(0%)` in their own label (settings.tsx:47), so a blank `commission` is visible *before* saving; the eleven ₪ fields show only the currency symbol and are not.

---

## Upgrades

1. **C1 blast radius is larger than written, in the other direction.** A blank `commission`/`proCommission` does not "misprice" — `minorUnits(commissionOn(price, 0))` throws and every `POST /api/price` answers 500 (main.ts:1061; independently found by R1 at server-core:153). The admin sees "Saved"; customers see a generic error on every quote. Same single root cause (`n < 0` is the only floor), same screen, same one tap. Fix both ends: reject empty/≤0/non-finite *and* cap the value.

2. **S2's "78 suites" is not 78 suites of unique coverage.** `presentation.test.mjs:2` re-runs `customer-location.test.mjs` (S8), and `scripts/check-contracts.mjs` re-runs `contracts-money.test.mjs` + `contracts.test.mjs`, which are already names 69-70 of the runner list. So the gate's headline number counts at least three duplicate executions while four real `*.test.mjs` files run zero times. The reviewer's fix (glob + assert the union equals the directory) also kills the duplicate-rerun class for free.

3. **S3 is worse than "ungated": the worker refactor it cites is now permanent.** At HEAD `server/worker.ts`'s `PUSH_KINDS` refactor is committed (5f941fd), and the only behavioural test of it is `tests/outbox.mjs`, which no workflow runs. The findings wording ("the uncommitted `server/worker.ts` change") understates it — the ungated code is in `main`.

---

## Contradictions between reviewers

1. **"A valid price of zero" (R3 C1) vs "zero commission is a 500" (R1, server-core:153).** R3 treats `0` as an accepted-but-bad price. R1 proves `0` is accepted by the settings route and then blows up the quote path (`minorUnits` rejects 0 with a `RangeError`). Both cannot be the whole story, and R1 is right: `0` is valid for `parcelPrice` (floored to ₪1) and fatal for `commission` (500). R3 never followed the accepted value into `commissionOn`/`minorUnits`, which is one call below the route it cites.

2. **"No amount cap" (R3 C4) vs the money-race test R4 calls clean.** R4's clean list says `tests/commands.mjs:70-74` races two remittances and asserts `[200,400]` (verified: `assert.deepEqual(cashRaces.map(r=>r.status).sort(),[200,400])`). Whatever the second 400 is attributed to, a server-side guard exists on this path, and the explicit balance cap is at `main.ts:2463` — the guard R3 says does not exist. R3 read the client and inferred the server; R4 read the tests and inferred the guard; the tests are right.

3. **Internal to R3 C5:** "`loading` does not disable a `Button` (`ui.tsx:249` disables on `disabled || loading`, and these pass neither)". The parenthetical states that loading disables it; the sentence says the opposite. The real defect is the sibling button, as adjudicated above.

4. **R3 and R4 both treat EAS as authoritative, R3 as a suspicion ("eas.json defines submit.pilot but no build.pilot") and R4 as a release finding.** They agree on the fact; neither noticed that `build.production.autoIncrement` (eas.json:10-13) only covers production, so a `preview` build reuses whatever the remote counter holds. Not a contradiction, just a shared gap.

---

## Genuinely missed (max 5)

1. **The settings form has no upper bound at all, so the recommended C1 fix is incomplete.** `src/app/admin/settings.tsx:46-48` — `<Field key={key} keyboardType="decimal-pad" … value={values[key]} onChangeText={…} />` with **no `maxLength`** (contrast the promo fields at :98-101, which all set one), and `server/main.ts:2688` has no upper bound (`!Number.isFinite(n) || n < 0`). A fat-fingered `2000` instead of `20` saves, and every parcel is quoted ₪2 000 (`parcelFare`, model.ts:181-182). R3's proposed `!values[k].trim() || !Number.isFinite(typedNumber(...))` passes `2000`; the fix needs a per-key ceiling too.

2. **The deployment guard's regex only sees single-quoted static `from '…'` specifiers — a second blind spot in the same seven lines.** `tests/deployment.test.mjs:46` — `read(file).matchAll(/from '(\.{1,2}\/[^']+\.ts)'/g)`. A new import written as `from "../../src/geo.ts"` (double quotes) or a dynamic `await import('../../src/geo.ts')` is invisible even in `server/main.ts`. R4's fix (expanding the queue) does not fix this; the matcher needs to accept both quote styles, or the guard should use a real parser/resolver.

3. **`scripts/check-contracts.mjs` is a duplicate runner, and it is the only contract gate anyone might script.** It spawns `contracts-money.test.mjs` and `contracts.test.mjs` — both already executed by `npm test` (run-tests.mjs:69-70). Same class as the `presentation.test.mjs` double-import R4 reports (S8), but it duplicates two full suites behind a second npm script, so a future CI job that adds `npm run test:contracts` would double the contract runtime for zero coverage. R4 checked `presentation.test.mjs` and missed the script-level copy.

4. **A settings value of `0` for `plusPrice`/`proPrice` creates a free subscription** — the same C1 root cause, one screen away: `main.ts:2480-2481` writes the plan price from settings into `subscriptions.price` when a user requests a plan, and `:2672-2675` activates it without re-pricing. A blank `plusPrice` therefore lets every customer subscribe for ₪0 and be activated. R3's P1 lists the plans group as editable but never follows `plusPrice` into the subscription flow; this is the cheapest way to turn the P1 into direct revenue loss.

---

## What each reviewer got right that matters

**R3 (client app).** The pending-command discipline is described exactly: the command is written before the request and replayed with the same `requestId` (book.tsx:236-240), and only a terminal 4xx clears it (:251-253). The `locked` predicate and the absence of any discard are correct to the character — every `disabled` site really does include it, and `forget()` (session.tsx:48-51) really does leave `booking.<userId>` behind, so "sign out and back in changes nothing" holds. The `typedNumber('')===0` + all-fields-posted + `n<0` chain is correct and is the panel's only client P1. The 3 s provider tick, the per-keystroke `scheduleSlots`, the inline Arabic a11y labels and the `فلسطين` maps suffix are all exactly where the report puts them.

**R4 (safety net).** The guard's recursion hole is proven by the loop itself; the 78-name list, the four orphaned `*.test.mjs` and the 130-file directory are counted correctly; the absence of `test:persistence` from both workflows is correct; `settle()` really is copy-pasted into the five named files (35 calls in one); `presentation.test.mjs:2` really does re-run a registered suite; the runner really does stop on the first failure (:92), which is the one thing that keeps the 50 ms races from being invisible. Those are the findings that should drive the fixes, and they are not wrong.

---

## Net: what survives

**R3.** One P1 survives with corrected wording (blank settings → silent floor pricing, 0 % commission → 500 quoting outage), and it is the panel's only client P1. One P2 survives (C2, the pending booking has no discard); C12 is a confirmed P3. Three P2s drop to P3 (deadlock trigger unreachable; admin "one tap" caps exist server-side; subscription race is a sibling-button stall), and the lineHeight P2 drops to P3 on arithmetic. The long tail (push cold start, 3 s provider tick, per-keystroke `scheduleSlots`, Arabic outside copy.ts, GPS note wipe) is correctly diagnosed and correctly P3.

**R4.** Two P1s stand exactly as written (hardcoded 78-name list, no `test:persistence` in CI) and are the most valuable findings in either report. The Docker-guard P1 drops to P2 because it is latent, not live. The release findings (no image build, `settle()` race) stand at P2; `versionCode` and the 4188 port drop to P3. The "what I checked and found clean" lists in both reports are unusually accurate and should be kept — with the caveat that R4's "78 suites" number is inflated by duplicate reruns, and R3's clean list did not catch that `commission: 0` breaks quoting.

**Scoreboard.** R3: 1 P1 ✓ (reworded), 2 of 5 P2s confirmed, 3 P2s downgraded, 6 P3s confirmed. R4: 2 of 3 P1s confirmed, 1 P1 downgraded, 2 of 4 P2s confirmed, 2 P2s downgraded, 3 P3s confirmed. No finding is fabricated; the losses are over-stated impact, not invented code.
