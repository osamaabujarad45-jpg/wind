# Uber-parity gap research (Muse Wonder 1.0, max)

Read-only research. "Uber-level" here means the handoff's own target: server-owned
dispatch with expiring offers and DB-enforced ownership, immutable minor-unit
quotes, consented presence with fresh road-time ranking, durable outbox + native
push + snapshot-resync realtime, balanced money journals, versioned Palestine
serviceability/restrictions with measured ETA intervals, restore-tested Azure
hosting. It does not mean copying Uber's private algorithms (D01–D34 are
independent designs). Launch modes fixed: ride=instant_dispatch,
freight=negotiated_offer, parcel=courier_batch.

## Parity matrix (severity for a Palestine pilot)

| Capability | State | Severity | Closes in |
|---|---|---|---|
| Dispatch/matching | Absent — browse-and-claim, random fan-out; no rounds/offers/leases | BLOCKER (ride) | WP10 |
| ETA/routing | OSRM + WP08 restrictions landed; quotes `uncertain`, never `feasible`; no driver→pickup ETA; 100-case corpus missing | HIGH | WP08 corpus → WP10 |
| Pricing/quotes | Landed PG-only (migration 11); SQLite legacy preserved; server enables parcel only by default | HIGH (ride/freight), LOW (parcel) | WP16 cutover |
| Presence/GPS | Slice landed (migration 9), dispatch hard-disabled; active-job fencing experimental (WP07) | HIGH | WP07 remainder → WP10 |
| Realtime/push | Outbox+worker landed (WP04); native-push backend landed (migration 12) but client absent, PubSub Bicep-only, `WIND_EXPO_PUSH_ENABLED` off | HIGH | WP09 remainder |
| Payments | Absent — cash only, REAL floats on live path; no PSP/ledger | MEDIUM (cash pilot), BLOCKER (digital claims) | WP13 → WP14 |
| Safety | SOS baseline present; no staffed escalation/roles | HIGH | WP15 + rota |
| Support/ops | Single admin; no role split/ownership/SLA | HIGH | WP15 |
| Ratings/trust | Matches v1 spec (completed-only) | LOW | WP10 pair-block |
| Surge/pricing intelligence | Correctly absent in v1 | None — do not build | WP17 gate |
| Accessibility/i18n | AR/EN RTL landed; no capability/guest fields | MEDIUM | WP17 |
| Observability | Minimal; App Insights provisioned in Bicep, nothing emits | HIGH | WP16 |
| Deployment/DR | Not deployed; production still Railway SQLite; Bicep gated `enableWorkloads=false`; PG runtime test-only gated | BLOCKER (staging pilot) | WP16 |

Spanning note: live SQLite path still uses 15 km city circles + `PARCEL_LOAD=200`;
WP05 polygons/measured capacity are PG-only behind an inactive operator policy.

## Critical path to a deployed staging pilot

1. WP07 remainder — production-grade active-job fencing decision (or explicit
   acceptance of the test-only fence + legacy limits).
2. WP09 remainder — Expo client (needs EAS projectId/FCM), PubSub credentials
   endpoint + client resync; keep long-poll fallback.
3. WP10 dispatch — rounds/offers/history, PostGIS KNN → OSRM ETA → rank, worker
   expiry, additive accept/decline/retry. Requires measured-requirements rows
   (fail-closed) until A8 is decided.
4. WP11 lifecycle — boarding PIN, arrival proof/override, epoch redispatch.
5. WP05 activation + WP08 corpus (parallel; blocks real ride dispatch):
   operator-signed matrices + ≥100 adjudicated OD cases per area.
6. WP12 courier/freight resource contracts + private Blob evidence.
7. WP13 money — balanced journals, ₪1,000 projected-exposure lock.
8. WP15 ops — split roles, MFA boundary, escalation, degraded-mode drill.
9. WP16 Azure staging — reviewed PG cutover (extend test-only runtime gate),
   Bicep `enableWorkloads=true`, env-configured API origin, latency/restore/load
   gates. Parcel-only staging can precede steps 3–4; a ride pilot cannot.

## Owner inputs required (cannot be faked)

- Commercial PAYG Azure subscription (student credit is dev-only) + region/quota
  approval + full cost export.
- Expo account + EAS `projectId`, Firebase FCM v1 key, APNs key.
- Bank of Palestine merchant agreement + capability/fee/sandbox matrix
  (WP14 stays coded-but-off without it; pilot remains cash-only).
- Telecom SMS contract (Ooredoo/Jawwal), sender approval, HMAC keys, budgets,
  real handset tests on both carriers.
- Apple Developer + Google Play accounts; physical iOS device for the
  permission/background matrix.
- Operator-adjudicated restriction data + corridor polygons + route corpus.
- Permitted-services writing, staffed safety/support rota, Cloudflare Email
  domain, VAPID subject, `SUPPORT_CONTACT`.

## Deliberate v1 divergences — do NOT build

No surge (multiplier 1), no H3, no ML dispatch/ETA, no pooling/shared rides,
no auto-repositioning. Negotiated freight retained (different object from the
15s dispatch lease). Cash-first: no Stripe/wallets/escrow. Zero new
wait/no-show/cancel fees, no tipping, no drop-off photo, no driver ID scans.
Excluded infra: AKS, Cosmos/Azure SQL duplicates, Notification Hubs, Entra
External ID for consumers, Service Bus/Redis until measured.

## Contradictions flagged

- Plan says "PostgreSQL is authoritative" but `server/db/runtime.ts` hard-gates
  PG to test-only loopback; SQLite on Railway is still live.
- CAPABILITY-MAP marks routing-eta/live-map "Shipped" (web/SQLite truth), but
  there is no Azure OSRM, no corpus, and quotes are `uncertain` by design.
- WP09-prep inventory is stale: the native-push backend half has since landed;
  the client half is still absent.
