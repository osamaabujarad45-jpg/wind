# Uber reference → Wind upgrade plan (1 Nov 2026)

Inputs: the six `docs/KNOWLEDGE-2026-11-01-*.md` deep-pass documents and the
37-section `C:\UberAppKnowledge\UBER-APP-COMPLETE-KNOWLEDGE-2026-11-01.md`
(SHA-256 `84195732…3485`).

## Where things stand

- **The reference is not new to the project.** The same file (same hash) was
  analysed at 12:43 today in `reports/uber-adoption-analysis-2026-11-01.md` +
  `…-backend-analysis…`, and the owner approved seven priorities ("OK DO THEM").
- **Half the approved work already exists, uncommitted, in the main checkout**
  (`Fastship/`, branch `master`): 68 modified + ~45 new files (driver receipts,
  offline recovery, runtime config, wire contracts, map failures/viewport,
  ride/freight, migration 28, infra). Last edit 13:43. Client and server
  typecheck both pass on that tree (local run, 1 Nov 15:10). None of it is
  committed, and none of it is on this branch (`83533e3`).
- No Claude session is running on Fastship. Earlier agents (Codex/DeepSeek/Haiku)
  stopped. The tracker `tasks/UBER-ADOPTION-IMPLEMENTATION-2026-11-01.md` was last
  updated at 13:13, so later slices are unverified.

The biggest risk right now is not a missing feature. It is ~1,200 changed lines
sitting uncommitted in a OneDrive folder.

## Phase 0: land the in-flight work (first)

1. Copy the main checkout's modified and untracked files into this branch. Leave out
   `.artifacts/`, `.expo/`, env files and `node_modules`. The main checkout itself is not touched.
2. Gates on k5 (isolated folder + own PG port, per memory `wind-k5-remote-tests`):
   `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:persistence`.
   Fix whatever fails.
3. Commit in reviewable slices: config/readiness · driver receipts + recovery ·
   offline recovery + storage · wire contracts · map provider/failures/projection ·
   ride/freight + migration 28 · infra · docs/reports.
4. PR → Haiku 5.5 xhigh review → fix → merge (owner PR rule). After the merge the
   main checkout's dirty tree equals master, so the owner can discard it there.

## Phase 1: close the approved items that are coded but not wired

| # | Item | Uber evidence | What's left in Wind |
|---|---|---|---|
| 1 | Map fallback driven by real failures | Maps deep dive §2.1–2.2: config said `uber`, the live session drew `google` (`MapProviderState.didFallback`) | `src/map-failures.ts` exists, and `map-mode.ts` reads it. Every renderer must call `recordMapFailure` on a real failure (tile/load timeout, WebView `onRenderProcessGone`, missing key/module). Route loading follows the *effective* renderer. Retries stay bounded, and the last resort is the route diagram. |
| 2 | One camera intent for all maps | §5: `LAT_LNG_BOUNDS_MAX_ZOOM`, fit-as-intent, density-aware projection | `src/map-viewport.ts` (`mapCameraIntent`) is written but **unused**. Wire it into `route-map.tsx`, `route-map.native.tsx`, `route-map.android.tsx` and `google-map.*`: fit with a zoom cap, follow the driver, stop auto-moving after user drag, and pad by measured sheet insets. Delete the per-renderer `FOLLOW_ZOOM`/region-delta copies. |
| 3 | Offline cold start | F23: `HomeScreenDataStore`, cached trip | `offline-recovery.ts` is wired into `session.tsx` and `api.ts`. Still to verify: airplane-mode reopen shows a stale, read-only active order with its saved-at time, a different account can't read it, and logout purges it. |
| 4 | Durable driver commands | N11: dedicated failure routes, offer `ack`/`expire` | Server and client are wired (`driver-command.ts`, `driver-receipts.ts`). Still to verify: kill the app after send, reopen, and exactly one transition happens. Repeat after reassignment and after a version conflict. |
| 5 | Runtime contract validation | §1 backend: generated model layer, 13k type adapters | `wire-contracts.ts` is used by `api.ts`. Check that it covers receipt/order/quote/offer/config, and add version-skew fixtures. |
| 6 | Timing diagnostics | N1/N12: warm launch, first-party reporter queue | `client-diagnostics.ts` is wired. Add usable-home, map-ready and command-ack timings, with no coordinates or tokens. |
| 7 | UI pass AR/EN | Screens doc §5: bottom sheets as screens, progressive disclosure | Finish the draft `reports/ui-review-2026-11-01.md` screen by screen, then run `npm run screens`. |

## Phase 2: new from the deep-pass docs (not in the approved list)

| Item | Uber evidence | Wind change | Why for the pilot |
|---|---|---|---|
| **Minimum-client gate** | N13 `ForceUpgradeActivity` | Server config returns `minClientBuild`. `_layout.tsx` blocks older builds with an update screen that reuses `install-link.tsx`. | 50 sideloaded APKs: a breaking API change today fails silently on old installs. One field plus one gate. |
| **Geofence-aware "Arrived"** | F12 `GeofenceBroadcastReceiver` | The driver's Arrive button shows the distance to pickup from the last fresh fix. It becomes the primary action only within `RIDE_ARRIVAL_RADIUS_METERS` (300 m, fix ≤120 s), which the server already enforces. Client-only, and it reuses `map-math` distance. | Stops `409 arrival_too_far` round trips at the kerb. |

Checked and skipped: a light/dark map style (Uber's auto stylesheet), because
`app.json` is `userInterfaceStyle: light`. Dedicated failure copy (N11) already
exists (`err_offer_expired`, `err_arrival_too_far`, …).

## Phase 3: acceptance

- k5: full gates after each phase.
- Physical A53 (`R5CTB0FJP9Z`), no emulator, run for parcel, ride and freight: restart, network loss,
  stale or denied GPS, screen lock, reassignment, Arabic and English, large text, TalkBack.
- Physical iOS is still a separate, owner-supplied prerequisite.

## Do not build (unchanged from the approved analysis)

An own GL renderer, imagery cubes or 3-D · H3 · RIBs or a new navigation framework ·
server-driven UI · thousands of flags · Eats/transit/scooters/AV/ads · surge ·
custom crypto or integrity probes · copying Uber's rider permission set (Wind
drivers need active-job tracking) · a "no third-party analytics" privacy claim
borrowed from the study.

## Owner inputs still external

The same list as `docs/implementation/uber-parity.md` §Owner inputs: EAS
projectId/FCM/APNs, PSP agreement, SMS contract, store accounts, operator route
corpus, staffed safety/support rota.
