# WP09 prep review: recoverable native notifications + authenticated realtime

Read-only research (Muse Spark 1.3 Contributor). No files changed by the review.
Spec: `reports/Fastship Claude implementation plan.md` section 09. WP09 implementation
starts only after WP08 lands.

## Existing inventory

**Web Push (keep as-is).** `server/main.ts`: `GET /api/push/key` (:806, public, VAPID
via `pushKeys()` :740-748), `POST /api/push/subscribe` (:807-819, allowlisted endpoints
+ P-256 check, upsert by endpoint PK, 5/user cap), `POST /api/push/unsubscribe`
(:820-823). Crypto in `server/push.ts` (`encrypt` :8, `vapid` :28, endpoint allowlist
:37-42). Table `push_subscriptions(endpoint PK, user_id, p256dh, auth, lang,
created_at)` (sqlite `server/db/sqlite-schema.ts:83`, `postgres-schema.sql:180`).
Keyed to `user_id` only — no session binding. Service worker `public/sw.js` renders
`{kind,order,url,lang}` ar/en. Client `src/push.ts` is web-only.

**Expo push: absent.** No `expo-notifications`/`expo-device` in `package.json`
(expo `~57.0.31`); `app.json` has no notifications plugin, `projectId`, or FCM/APNs
config. Blocker: needs owner's Expo account/EAS project + Firebase FCM v1 key
(`CAPABILITY-MAP.md:32`). Must stay disabled until then.

**Push queue/flush.** `queuePush` `server/main.ts:750-754` (PG → durable
`enqueuePush`, SQLite → `persistence.defer(sendPush)`); `flushPush` (:756);
`sendPush` (:757-762, TTLs job 300s / offer 600s / else 3600s); `deliver` (:764-772,
deletes on 404/410); `newJobPush` (:774-788; 5 alerts/10min/customer, ≤100 drivers).
`OFFER_TTL` 10 min (:270).

**WP04 outbox (durability base).** `server/db/postgres-events.sql`: `domain_events`,
`outbox` (pending/processing/delivered/obsolete/review), `consumer_inbox`,
`append_domain_event()`. `enqueuePush` (`server/domain/events.ts:6`) runs inside the
mutation transaction; destinations `webpush:{userId}:{sha256(endpoint)}`. Worker
`server/worker.ts`: `SKIP LOCKED` claim (:30-45), 30s lease, 8 attempts, doubling
backoff capped 1h + 25% jitter (:115-118), 404/410 → delete + `obsolete` (:142-144),
at-least-once documented (:52). Requires `WIND_DATABASE_URL` + migration 4.
Snapshot-resync already exists: `GET /api/orders/:id?protocol=1&after=`
(`orderProtocol` `server/main.ts:2209-2221`, `nextCursor` + `snapshotRequired:true`,
participant/admin-only).

**Live/long-poll (fallback to keep).** `/api/orders/:id/live` (:1067-1077),
`/api/track/:token/live` (:1142-1150); `liveFix` (:1730-1762), `LIVE_HOLD` 12s,
single-process only — WP09's PubSub motivation (:1723).

**Revocation paths.** `sessions(token_hash PK, user_id, created_at)`;
`startSession` (:398-402); `SESSION_DAYS=90`. Logout (:530-534, also deletes all
`push_subscriptions`), password reset (:523), account delete (:583-588), admin
status/role change (:2095), reset (:2144), phone change/recovery
(`server/domain/phone-identity.ts:289`). Held-request re-auth precedent: live read
re-authenticates inside `read()` (:1071) and after hold (:1758).

**Session-binding pattern to copy (WP07).** `server/db/postgres-presence.sql:21`
`FOREIGN KEY(auth_session_hash, driver_id) REFERENCES sessions ON DELETE CASCADE`;
`server/domain/presence.ts:81` 409s on session change; routes via
`registerPresenceRoutes`, wired at `server/main.ts:328-329`.

**Realtime infra/docs only.** `infra/main.bicep:263-267` declares Web PubSub
Standard_S1. Zero `PubSub|SignalR` hits in server/src/scripts/tests code.

**Migrations.** `server/db/postgres-schema.ts:18` runs 3→10. Next free number was 11
at review time — re-check at implementation start (WP08 may take 11; WP09 then takes
12). New tables must also be allowlisted in `server/migrate.ts:168`.

## Implementation map (after WP08 lands)

1. **Device-token registration bound to auth session.** New migration:
   `native_push_tokens(token_hash PK, user_id, auth_session_hash, device_hash,
   platform, expo_push_token, lang, prefs_json, created_at, updated_at, disabled_at)`
   with FK `(auth_session_hash,user_id) → sessions ON DELETE CASCADE` (mirror
   presence). New `server/domain/native-push.ts` + `registerNativePushRoutes`:
   `POST /api/push/native/register` (validate `ExponentPushToken[…]` format; upsert
   per device; reassign on account change), `/unregister`, `/preferences`
   (quiet-hours/nonessential opt-out). Revocation paths cascade via FK; test each.
   SQLite mirrors Web Push best-effort; PG is durable.
2. **Durable attempts linked to outbox.** Extend `enqueuePush`
   (`server/domain/events.ts:6-18`) to also insert `expon:{userId}:{tokenHashPrefix}`
   destinations in the same transaction/event ID.
3. **Worker handling.** Extend `DurableWorker` (`server/worker.ts`): resolver for
   `expon:` destinations reusing TTL/epoch/role/lifecycle checks (:63-91) plus
   `disabled_at`/prefs suppression and offer-expiry check; injectable
   `expoTransport` with deterministic fake in tests; `DeviceNotRegistered` → delete
   token + `obsolete`; transient → existing backoff; poison → `review`.
4. **Realtime credentials + snapshot-resync.** New `server/domain/realtime.ts`:
   `GET /api/orders/:id/realtime` (participant/admin check copied from
   `orderProtocol`; returns `{url, token, group:"order-{id}", expiresAt: now+5min,
   eventCursor}`); share-link variant scoped to the `trackView` allowlist.
   Client dedupes by `eventId`, discards older `assignmentEpoch`, fetches
   `?protocol=1&after=` on gap/reconnect. `liveFix` stays as fallback.
   Do not invent quote/route versions — WP08 owns those aggregates.
5. **Client (native only).** `npx expo install expo-notifications expo-device`
   (SDK 57 docs first), `notifications` plugin + `projectId` in `app.json`, token
   refresh on launch/login/account-switch, unregister on sign-out (mirror
   `disablePush` `src/push.ts:54-60`). Web path untouched. Blocked on real EAS/FCM
   credentials for any non-test delivery.

## Tests to add

- `tests/native-push.mjs` (PG): register/refresh/reassign/unregister, revocation
  cascades, wrong-account registration, invalid-token → `obsolete`, expired-offer
  suppression, worker-kill boundaries. Patterns: `tests/pg-support.mjs`,
  `tests/outbox.mjs`, `tests/events.mjs`.
- `tests/realtime-auth.mjs` (PG): credential auth matrix, 5-min expiry, revoked
  session/share token during held read, reconnect snapshot-resync, fake-hub fallback.
- `tests/native-push-sqlite.mjs`: legacy best-effort contract + 409s, mirroring
  `tests/commands-sqlite.mjs`.
- Register PG suites in `scripts/check-persistence.mjs`; SQLite suite in
  `scripts/run-tests.mjs`. Keep frozen contract counts green
  (`tests/pg-contracts.mjs`).

## Must stay test-only without credentials

Real Expo delivery (no EAS `projectId`/FCM/APNs keys), real Web PubSub connection
strings, SMS fallback, urgent staffing escalation, production PG flags. Fakes
deterministic and test-scoped (mirror the phone-provider fake,
`server/domain/phone-provider.ts`). Provider failure surfaces as `review`/operator
queue, never fake-delivered.

## WP08 conflict flags

`server/main.ts` is owned by the WP08 agent until it lands. WP09 keeps its surface
in new `server/domain/native-push.ts` + `server/domain/realtime.ts` with
`register*Routes` so the `main.ts` diff is wiring + revocation one-liners; rebase
onto landed WP08 first. Migration number race: re-check `postgres-schema.ts` at
implementation start. Offer push TTL vs WP08's future 15 s dispatch lease are
distinct objects — do not conflate.
