# Authentication, authorization and attacker-facing abuse-surface review

## Verdict
The object-level authorization layer is unusually disciplined: every `/api/orders/:id/*`, `/api/jobs/:id/*` and `/api/admin/*` handler I traced re-derives the caller's relationship to the row, `getOrder`'s `canSee`/`released` gate is the single chokepoint, and I found no unparameterized SQL, no cookie/CSRF surface, no path traversal in the static server, and no dev backdoor in the shipped client. What is weak is the *pre-authentication* surface: the per-address limiter is keyed on headers an attacker chooses, the password KDF is synchronous on the request path, and two public endpoints accept unbounded unauthenticated writes. Three findings would let a single unauthenticated client degrade or scale-abuse the platform without ever holding an account; the rest are object-level and privacy leaks that need a session.

## Findings

### [P1] Per-address auth limits are keyed on attacker-chosen headers, and production sets `WIND_TRUST_PROXY=1`
- Where: `server/main.ts:2778` (and the same pattern at `server/main.ts:1543`, `server/domain/phone-identity.ts:48`); enabled by `infra/main.bicep:317`
- Code:
```js
const forwarded = req.headers['x-real-ip'] ?? (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0]?.trim() : undefined);
const address = process.env.WIND_TRUST_PROXY === '1' && typeof forwarded === 'string' ? forwarded : req.socket.remoteAddress ?? 'unknown';
(await limit(identityKey(url.pathname, address), perAddress, 10 * 60_000));
```
`infra/main.bicep:317` is `{ name: 'WIND_TRUST_PROXY', value: '1' }`, and the ingress is Azure Container Apps (`infra/main.bicep:306-307`), which *appends* the peer to `X-Forwarded-For` — it does not set or strip `X-Real-IP` — and neither does the code check that the header came from the proxy.
- Why it matters: `publicAuthLimits` (`server/main.ts:2750`) is the only wall in front of `/api/auth/login` (50), `/api/auth/register` (20), `/api/auth/reset` (20) and `/api/auth/entra` (30). The *per-identity* limit inside `login` is 5 per 10 minutes (`server/main.ts:535-536`), which is fine against one account but does nothing against credential stuffing across many accounts. Spoofing the address bucket removes the only aggregate cap.
- Failure scenario: attacker sends `POST /api/auth/login` with `X-Forwarded-For: <random>` on every request (or `X-Real-IP: <random>`). Each request lands in a fresh `login:<sha(pathname,ip)>` bucket, so the 50/10min cap never fires. They now spray 5 passwords per username across the entire user table at line speed, and `checkPassword` runs `scryptSync` on every miss — see the next finding.
- Fix: derive the address from the *rightmost* `X-Forwarded-For` hop and drop `X-Real-IP` entirely (`const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean); const address = trustProxy && fwd.length ? fwd[fwd.length-1] : req.socket.remoteAddress`). Better: since the ingress already terminates TLS, require a shared secret header (`X-Wind-Proxy: <secret>`) and ignore all forwarding headers without it. Apply the same helper in `main.ts:1543` and `phone-identity.ts:48` instead of three copies.
- Confidence: HIGH (XFF leftmost is definitionally client-controlled); MEDIUM only on whether `X-Real-IP` survives the Container Apps ingress unmodified.

### [P1] Password hashing is synchronous (`scryptSync`) on every unauthenticated auth request
- Where: `server/main.ts:178-191`, used at `server/main.ts:540` (login), `server/main.ts:669` (reset), `server/main.ts:520` (register)
- Code:
```js
function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 32));
}
```
`server/main.ts:669` runs it *before* any account lookup, on a fully unauthenticated request:
```js
const password = hashPassword(newPassword(body.password)); // before the lookup: the same checks whether or not it exists
```
- Why it matters: Node's default `scrypt` is N=16384, r=8, p=1 — roughly 16 MiB and tens of milliseconds of *blocking* CPU per call. There is one thread. Every concurrent login/register/reset stalls every other request in the process, including driver GPS uploads and order state transitions.
- Failure scenario: attacker (2 IPs, or 1 with the header spoof above) POSTs `{"identifier":"x","password":"<12 chars>"}` to `/api/auth/login` 100 times. Each burns ~50 ms of the single event loop, so the whole API is unresponsive for ~5 s; repeating it keeps it dead. The same 100 requests against `/api/auth/reset` do the hash before the account lookup, so no valid target is even needed. This is a total outage for a dispatch platform, from an unauthenticated client.
- Fix: use `scrypt` (async, via `util.promisify(scrypt)`) or `crypto.scrypt` in a small bounded worker pool, and only after the cheap checks. For `/api/auth/reset`, move `hashPassword` *after* `useCode` succeeds rather than before the lookup — the timing-equalisation the comment wants is already provided by the uniform `wrong_email_code` answer.
- Confidence: HIGH

### [P2] Any driver can read any searching order's declared cargo value and external reference
- Where: `server/domain/resource-scope.ts:250-256` (mirrored in `summary` at `server/domain/resource-scope.ts:184-189`)
- Code:
```js
async getScope(actor: Actor, orderId: number) {
  await this.requireAvailable();
  const order = (await this.db.one('SELECT * FROM orders WHERE id=?', orderId)) ?? this.fail(404, 'not_found');
  const searchingDriver = actor.role === 'driver' && order!.status === 'searching';
  if (!searchingDriver) this.participant(order!, actor);
  const row = await declaredScopeRow(this.db, orderId);
  return { declaredScope: row ? serializeScope(row) : null, custody: await custodyFor(this.db, orderId) };
}
```
`serializeScope` returns `declaredValueMinor`, `sourceRef`, `accessConstraints`, `pickupPromisedAfter/Before` and `dropoffPromisedBefore` (`server/domain/resource-scope.ts:114-125`).
- Why it matters: this bypasses the two filters every other driver-facing read applies — `servesFor(viewer.vehicle).includes(service)` and `enabledServices` — in `getOrder` (`server/main.ts:321-324`) and `GET /api/jobs` (`server/main.ts:1768-1776`). A driver with a `car` who cannot serve freight can read a freight load's declared value and the shipper's own `sourceRef`. `sourceRef` is documented as the customer's external reference (a Souq/partner order number), so this leaks a cross-tenant identifier into a competitor's app.
- Failure scenario: a driver registers (self-service sign-up is open when `WIND_IDENTITY_MODE=self-service`), signs in with status `active`, and loops `GET /api/orders/1/scope` … `GET /api/orders/200000/scope` with their bearer token. Every `searching` order returns `{declaredScope:{declaredValueMinor: 40000, sourceRef: "SOUQ-88213", accessConstraints:["disabled_access"], ...}, custody:[]}`. The 404 for non-`searching` ids also confirms which order numbers exist.
- Fix: require the same predicate `getOrder` uses — `viewer.role === 'driver' && order.status === 'searching' && enabledServices.includes(order.service) && servesFor(viewer.vehicle).includes(order.service) && (order.scheduled_for == null || order.scheduled_for <= Date.now() + RELEASE_BEFORE)` — before the driver fast-path, and drop `sourceRef`/`declaredValueMinor` from what a non-assigned driver gets (they are not needed to decide whether to bid; `itemCount`/`massGrams`/dimensions are).
- Confidence: HIGH (code traced; live only on the Postgres cutover, since `requireAvailable` returns 409 on SQLite)

### [P2] Public phone-recovery verify has no rate limit and writes one row plus a global advisory lock per request
- Where: `server/domain/phone-identity.ts:367` (route), `server/domain/phone-identity.ts:68-86` (`command`), `server/domain/phone-identity.ts:258-275` (`prove`)
- Code:
```js
route('POST','/api/auth/phone/recovery/verify',async ctx=>phone.prove(ctx,true),true);
```
```js
const result=await this.db.atomic({id:ctx.user?.id,purpose:ctx.user?undefined:'phone_public',correlationId:randomUUID()},async()=>{
  await this.lock('identity_commands');
  await this.lock(`command:${scope}:${commandId}`);await authorize();
  const old=await this.db.one('SELECT * FROM phone_command_results WHERE scope_hash=? AND command_id=?::uuid',scope,commandId);
  if(old) { ... }
  const response=await work();
  if(response.persist!==false)await this.db.run('INSERT INTO phone_command_results(...) VALUES(...)', ...);
```
`issue` calls `admitPublicChallenge()` and `rate()`; `prove` calls neither, and `scope = digest('wp06-public:'+deviceHash)` is derived from a client-supplied UUID, so the idempotency key is not a limit either.
- Why it matters: two harms. (a) Unbounded table growth: each call with a fresh `deviceId`/`commandId`/`challengeId` returns 400 but still inserts a permanent `phone_command_results` row, from an unauthenticated client with no `publicAuthLimits` entry. (b) Every one of those requests takes the **global** `pg_advisory_xact_lock` named `identity_commands` inside an open transaction, serialising the entire phone-identity subsystem (provisioning, change, recovery) behind an anonymous flood.
- Failure scenario: `for i in 1..N: POST /api/auth/phone/recovery/verify {"commandId":"<uuid>","deviceId":"<uuid>","challengeId":"<uuid>","purpose":"recovery","code":"000000","password":"aaaaaaaaaaaa"}`. Returns `400 phone_proof_invalid` every time, grows `phone_command_results` by one row per request, and holds the global phone lock on each. Legitimate users then cannot send or verify a recovery SMS, and the DB volume fills.
- Fix: add `(await limit(identityKey('phone-prove', address), 20, 10*60_000))` before `command()` (same address helper as the P1 finding), and skip the `command()` write path entirely when the challenge does not resolve — do the challenge lookup first, and only take `identity_commands` once a real challenge row matched. Also bound `phone_command_results` retention (`DELETE ... WHERE created_at < now - 24h` in `reconcileStale`).
- Confidence: HIGH

### [P2] Support password reset returns a plaintext password and leaves no audit record
- Where: `server/main.ts:2631-2644`
- Code:
```js
route('POST', '/api/admin/users/:id/password', async ({ user, params }) => {
  need(user, 'admin');
  (await limit(identityKey('support-password', user.id), 20, 60 * 60_000));
  const target = (await one("SELECT * FROM users WHERE id = ? AND role != 'admin' AND phone NOT LIKE 'deleted-%' AND phone NOT LIKE 'partner:%'", Number(params[0]))) ?? fail(404, 'not_found');
  const password = randomBytes(12).toString('base64url');
  const hashed = hashPassword(password);
  (await persistence.exec('BEGIN IMMEDIATE'));
  try {
    (await run('UPDATE users SET password = ? WHERE id = ?', hashed, target.id));
    (await run('DELETE FROM sessions WHERE user_id = ?', target.id));
    (await persistence.exec('COMMIT'));
  } catch (error) { (await persistence.exec('ROLLBACK')); throw error; }
  return { password };
});
```
- Why it matters: the recovery step deletes the victim's sessions and returns a working credential to the caller — an irreversible takeover of any non-admin account. Every other sensitive admin action on this server writes an audit trail (`security_events` for disputes `server/main.ts:1606`, incidents `:1658`, proof reset `:2496`, destination accept `server/domain/destination-change.ts:147`; `staff_actions` for ops). This one writes nothing, so an admin whose laptop is borrowed, or a compromised admin token, can silently take over 20 accounts an hour with no trace, and the account owner cannot tell support what happened.
- Failure scenario: attacker obtains one admin bearer token (phishing link, a shared support workstation). `POST /api/admin/users/4821/password` → `{"password":"kQ3vT9..."}`. They sign in as that customer, read `GET /api/orders` (all their history, phones, addresses), `GET /api/me/referral` credits, and can re-run for every user id. Nothing in `security_events`, `staff_actions` or the logs distinguishes this from a normal session.
- Fix: write the audit row in the same transaction as the password update —
  `INSERT INTO security_events(actor_id, order_id, action, detail, created_at) VALUES(?, NULL, 'SUPPORT_PASSWORD_RESET', ?, ?)` with `{userId, reason}` — and require a `reason` in the body (min 5 chars) like `proof-reset` and `disputes/:id/resolve` already do. Longer term, return a one-time reset link instead of the password.
- Confidence: HIGH

### [P2] `/api/ready` is unauthenticated, unlimited, and takes the SQLite write lock
- Where: `server/main.ts:479-495` (public flag at `:495`), lock semantics at `server/db/persistence.ts:184-197`
- Code:
```js
route('GET', '/api/ready', async () => {
  let schema = 3;
  ...
    (await persistence.exec('BEGIN IMMEDIATE')); (await persistence.exec('ROLLBACK'));
  } catch { fail(503, 'unavailable'); }
  return { ok: true, schema };
}, true);
```
`persistence.exec('BEGIN IMMEDIATE')` on the non-pooled backend does `owner.release = await this.sqliteLock(); this.sqlite!.exec('BEGIN IMMEDIATE')` (`server/db/persistence.ts:194-195`) — i.e. it takes the writer mutex and the SQLite RESERVED lock.
- Why it matters: `infra/main.bicep:10` states the PostgreSQL cutover is not done, so production runs the SQLite backend. An unauthenticated GET now contends for the same write lock every booking, assignment, advance and cash entry needs, and there is no entry in `publicAuthLimits` (`server/main.ts:2750`) for it. It also returns the migration level (`schema`), which tells an attacker which additive endpoints are live.
- Failure scenario: `while true; do curl -s https://api/…/api/ready & done` (a few hundred parallel). Each holds the writer mutex through `BEGIN IMMEDIATE`, and concurrent `POST /api/orders` / `POST /api/orders/:id/advance` start failing `DB_ACQUIRE_TIMEOUT` (503) under a load that never needed authentication.
- Fix: replace the write probe with a read-only one (`SELECT 1` or the existing `SELECT COUNT(*) FROM sqlite_schema`), and either move readiness behind an internal header/loopback check or give it an address bucket. Drop `schema` from the public body — return it only when an operator header is present.
- Confidence: HIGH

### [P2] Account deletion leaves user-typed free text attached to the anonymised account
- Where: `server/main.ts:723-749`
- Code:
```js
(await run(`UPDATE users SET name = '—', phone = ?, email = NULL, phone_verified_at = NULL, ... password = '', status = 'blocked', vehicle = NULL, plate = NULL WHERE id = ?`, `deleted-${user.id}`, user.id));
...
(await run("UPDATE checkpoint_reports SET note = '' WHERE reporter_id = ?", user.id));
(await run("UPDATE order_messages SET body = '—' WHERE sender_id = ?", user.id));
```
- Why it matters: the anonymisation pass covers orders, messages, place and checkpoint notes, but not the other free-text a user typed about themselves or others: `order_disputes.reason` (up to 1000 chars, `server/main.ts:1575`), `safety_incidents.note` (up to 300 chars, `server/main.ts:1622`), `order_scope_checks` payloads, and `security_events.detail` JSON. Those rows keep `customer_id`/`reporter_id` pointing at the now-anonymised user, and are served on `GET /api/admin/disputes` (`server/main.ts:1586`) and `GET /api/admin/incidents` (`:1641`) next to `customerName`. "Delete my account" is the store-policy requirement (`account-deletion.html`, `POST /api/me/delete`), and the statement it makes is false for this text.
- Failure scenario: a user who filed a safety report naming a co-worker deletes their account; the narrative stays readable by any admin indefinitely, joined to `reporter_id`, and re-identifiable from the order it belongs to in one query.
- Fix: add to the same transaction — `UPDATE order_disputes SET reason = '—' WHERE customer_id = ?`, `UPDATE safety_incidents SET note = '' WHERE reporter_id = ?`, `UPDATE order_scope_checks` (there is no free text there, so skip), and `UPDATE security_events SET detail = '{}' WHERE actor_id = ?`. Keep the structured columns (status, kind, amounts) so accounting still reconciles.
- Confidence: HIGH

### [P2] The Entra `nonce` is compared against a value the client reads out of the token
- Where: `server/main.ts:360-362`, check at `server/domain/entra.ts:125`
- Code:
```js
(await limit(identityKey('entra-attempt', idToken.slice(-24) || 'empty'), 10, 10 * 60_000, false));
const nonce = typeof body.nonce === 'string' ? body.nonce : '';
if (!nonce) fail(401, 'invalid_token'); // the client always mints one; a token without it is not ours
```
```js
if (options.nonce !== undefined && claims.nonce !== options.nonce) throw new Error('invalid_token');
```
- Why it matters: the client supplies both the token and the nonce, and `claims.nonce` is in the base64url-readable JWT payload. So `nonce` proves only that the caller could read the token — not that it was issued to a request this server saw. The comment claims otherwise. Replay is in fact blocked by the separate `entra_replay` table keyed on `jti` (`server/main.ts:372-375`), so this is a defence-in-depth hole rather than a live takeover, but the layered control is decorative and would silently stop protecting anything if `jti` handling changed.
- Failure scenario: an ID token leaks into a proxy log or a support screenshot. An attacker base64url-decodes its payload, takes `nonce`, and POSTs `{idToken, nonce}` to `/api/auth/entra` from their own device — passing the nonce gate. Only the `entra_replay` insert (which fails on the second use) stops them.
- Fix: make the nonce server-issued: `POST /api/auth/entra/nonce` returns a random value bound to a short-lived row (or an HMAC of `issuedAt|random` with a server key), and `/api/auth/entra` accepts `{nonce, issuedAt, signature}` verified against that. Until then, delete the comment's claim and note in `entra.ts` that replay rests solely on `entra_replay`.
- Confidence: HIGH on the mechanism; the practical impact is bounded by the replay table, hence P2 not P1.

### [P3] Any driver sees an unassigned customer's rating and trip count on every searching order
- Where: `server/main.ts:292`
- Code: `...(viewer.role === 'driver' && (assigned || r.status === 'searching') && { customerStats: (await customerStats(r.customer_id)) }),`
- Why it matters: the gate is "searching", not "you may serve this" and not "you bid". So `GET /api/jobs` and `GET /api/orders/:id` disclose `{rating, trips}` for every waiting customer to every signed-in driver, including drivers whose vehicle cannot serve the service and drivers who never offered. Combined with `pickupCity`/`dropoffCity` (also returned) it is a coarse per-customer profile.
- Failure scenario: a driver polls `GET /api/jobs` every minute and builds a table of city+timing+rating+trips for customers who book repeatedly, then targets high-trip customers with inflated offers.
- Fix: require `assigned || (viewer.role === 'driver' && r.status === 'searching' && enabledServices.includes(r.service) && servesFor(viewer.vehicle).includes(r.service))`, which is the same predicate `getOrder.canSee` already applies. Cheap, one condition.
- Confidence: HIGH

### [P3] `GET /api/route` has no role gate
- Where: `server/main.ts:2338-2343`
- Code:
```js
route('GET', '/api/route', async ({ user, query }) => {
  (await limit(identityKey('route', user.id), 120, 10 * 60_000));
  const heading = query.get('heading') == null ? null : Number(query.get('heading'));
  ...
  return (await roadRoute(queryPoint(query.get('from')), queryPoint(query.get('to')), heading));
});
```
- Why it matters: every other customer-facing route opens with `need(user, 'customer'); needActive(user)`; this one accepts `needActive`-less access from any authenticated account, including a `pending` driver awaiting approval, and each call is a billable/free-tier OSRM route. It is the only un-gated path into `roadRoute`.
- Failure scenario: a freshly registered driver (`status: 'pending'`, still gets a token from `startSession`) loops `/api/route?from=31.9,35.2&to=32.2,35.3` at 120/10min to burn the OSRM quota that dispatch and ETA depend on.
- Fix: add `needActive(user)` (or `need(user, 'customer', 'driver', 'admin')`) as the first line. The cache in `roadCache` already bounds repeat cost, so this is only about who may call it.
- Confidence: HIGH

### [P3] Road-report authorization is a deny-list, not an allow-list
- Where: `server/main.ts:1723-1725`
- Code:
```js
route('POST', '/api/roads/:id/report', async ({ user, params, body }) => {
  if (user.role === 'customer') fail(403, 'forbidden');
  needActive(user);
```
- Why it matters: the intent is "drivers report road state" (the comment at `:1705` says so, and `GET /api/roads` feeds ETA for every order). Written as "not customer", any future role (a `merchant`, a `partner`, a read-only `support` role) is silently granted the ability to move every ETA on the platform — and admin accounts already can. A single denied role written as `!==` is exactly the shape that breaks when roles are added.
- Failure scenario: a `support`-scoped staff account, added later, files `{"status":"closed","note":"..."}` on the Ramallah–Nablus checkpoint. `roads()` (`server/main.ts:1715`) takes the newest report, so every order touching those cities shows `delayed` and the ETA band widens for two hours.
- Fix: `need(user, 'driver')` (plus `needActive`), and if admins must be able to report, make it `need(user, 'driver', 'admin')` so it reads as an allow-list.
- Confidence: HIGH

### [P3] `checkPassword` throws a 500 on a stored hash without a `salt:hash` separator
- Where: `server/main.ts:183-186`, reachable from `server/main.ts:540` and `server/main.ts:709`
- Code:
```js
function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 32));
}
```
- Why it matters: `Buffer.from(undefined, 'hex')` throws, and `timingSafeEqual` throws on a length mismatch. `deleteAccount` writes `password = ''` (`server/main.ts:731`), so a row with an unparseable hash exists by design. It happens to be unreachable today (the deleted row's `phone` becomes `deleted-<id>`, so no lookup matches), but the failure mode is "500 with `server_error` and a `logServerError`", not "401" — and this is the sole password-verification function for login, password change and the admin reset. Any future migration or manual `UPDATE users SET password = ...` typo turns into unhandled exceptions on an unauthenticated path.
- Failure scenario: an operator imports a legacy user table with a plaintext or `crypt`-format password. `POST /api/auth/login` for that user throws `TypeError: The first argument must be of type string`, returns 500 `server_error` instead of `wrong_credentials`, and the outlier response tells an attacker the account exists.
- Fix: fail closed — `const [salt, hash] = stored.split(':'); if (!salt || !hash || !/^[a-f0-9]{64}$/.test(hash)) return false;` before the buffers.
- Confidence: HIGH on the throw, MEDIUM on any currently reachable row.

## Suspicions (unverified)

- **`toUser` never exposes `staff_role`, but `ops.ts:8` derives it.** `staffRoleOf = actor.staff_role ?? (actor.role === 'admin' ? 'platform_admin' : null)`. `staffActor()` (`server/domain/ops.ts:19-23`) re-reads it, but only when `opsAvailable(db)` is true; before migration 18 every admin is implicitly `platform_admin`, which is what `needStaff(actor, fail)` with zero scopes grants. That is correct today, but the day migration 18 runs, every existing admin silently gains `platform_admin` until someone sets `staff_role`. Worth an explicit migration that backfills `staff_role='platform_admin'` for current admins — I did not check migration 18's body.
- **`POST /api/push/subscribe` reassigns an endpoint across accounts** (`server/main.ts:986-988`, `ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id`). The comment argues the endpoint is the browser's own secret and `pushEndpoint` restricts hosts. I found no API that returns another user's endpoint, so this needs an endpoint leak (browser profile copy, a screenshot of DevTools) before it becomes "attacker makes a victim's browser receive their notifications". Low.
- **`orderCode(id)` is `W-${id.padStart(5,'0')}`** (`src/model.ts:254-255`) and is returned to anyone holding a share link (`server/main.ts:1563`). So the public tracking page discloses the numeric order id. Every `/api/orders/:id` path is authz-guarded, so I could not build a chain — but it removes a layer between a leaked link and order enumeration.
- **`GET /api/orders/:id/live` re-reads with a full `authenticate()` per held request** (`server/main.ts:1471`). That is the right call for revocation, but with `LIVE_TOTAL = 200` and `LIVE_HOLD = 12 s` it is 200 extra session joins per 12 s — a cheap lever for a signed-in account. Not a vulnerability, an amplification.
- **`WIND_TRUST_PROXY` is read from `process.env` at each request** (`server/main.ts:1544, 2779`; `phone-identity.ts:48`) rather than captured at boot with the other production assertions (`server/main.ts:57-62`). A typo in one deployment's env silently flips the limiter from "global bucket" to "attacker-chosen bucket" with no startup failure. Related to the P1 finding, kept separate because it is a config-hardening gap rather than the same bug.

## What I checked and found clean

- **Working-tree delta (`git diff`, 7 files).** `db.memo` (`server/db/persistence.ts:96-107`) is scoped to the request `Owner` created in `scope()` and cleared by `exec()` at every transaction boundary (`:153, :172`), so the three new `db.memo` wraps in `resource-scope.ts:31`, `dispatch.ts:43`, `ride-lifecycle.ts:25` cannot leak a schema answer across requests. `worker.ts`'s `subscription()` now delegates to `validate()` — I diffed all nine guards (active user, kind, `/admin` and `/driver` path roles, ttl, assignment epoch, searching/scheduled window, offer_accepted, role-in-order, status-in-kind) and they are byte-equivalent to the removed inline block. `PUSH_KINDS` gained `destination_request|accepted|declined`, which the worker *previously rejected* with `invalid_notification`; `URGENT_KINDS` matches the array that `sendPush` already used (`server/main.ts:915-918`), so no behaviour changed there. No regression, and `tests/outbox.mjs` gained an assertion that every `PUSH_KINDS` member reaches `delivered` — a tightening, not a weakening. No source was modified by this review.
- **Cookies / CSRF.** `Set-Cookie` appears nowhere in `server/`. Auth is `Authorization: Bearer` only (`server/main.ts:2737`), so `Access-Control-Allow-Origin: *` (`:2753`) grants no cross-origin credential read and there is no CSRF surface at all. Session tokens are 32 random bytes, stored as `sha256` (`:553-554`), never in a URL.
- **Session lifecycle.** Fresh token on every `startSession`, no fixation path. Sessions killed on password reset (`:677`), password change (all but the current one, `:715`), account deletion (`:743`), and any admin identity/role/vehicle/status edit (`:2588`). Absolute 90-day and 30-day idle bounds enforced in the single `authenticate` (`:2740-2741`), in the schema-qualified re-checks inside handlers (`:2051, :2094, :2159-2170`), and swept (`:2926`).
- **Route table.** `route()` compiles `:param` to `(\d+)` only (`server/main.ts:440`), so no path-injection or parameter-smuggling into a handler. No method-override support. Every `/api/admin/*` route re-checks `need(user,'admin')` or `needStaff(...)` in its own body; I walked the full list (`server/main.ts:869-2696`, `ops.ts:85-95`, `payments.ts:118-125`, `ledger.ts:171-176`, `eligibility.ts:365-551`).
- **Object-level authorization, verb by verb.** `getOrder`'s `canSee` + `released` gate (`server/main.ts:317-324`) is used by cancel, schedule, rate, dispute, sos, messages, advance, exception, release, share, objects, scope, custody, pickup-check, payments, cash-receipt, COD, destination and the protocol snapshot. `owner`/`assigned` gate every PII field in `toOrder` (`:243-297`) — `handoverCode` customer-only, `returnCode` customer-only, `boardingCode` customer-or-assigned (`ride-lifecycle.ts:98-99`), phones only inside the contact window, pins/notes/names only to the parties. `private-objects.upload/list/mintRead/content` all call `participant()` and the read token is bound to both the object, the order *and* `subject_id` (`private-objects.ts:135-145`).
- **Quote IDOR.** `createOrder` locks the quote and requires `Number(quoted.customer_id) === user.id` (`server/main.ts:1135-1136`), so a supplied `quoteId` cannot cross accounts; `consumeQuote`'s missing `customer_id` predicate is unreachable behind that check.
- **Partner API.** Constant-time key compare over SHA-256 of both sides, with a `>= 32` char minimum and a 503 when unset (`server/main.ts:1359-1365`); `partnerOrder` requires a `partner_orders` row first (`:1417-1421`); the `partner:%` account is excluded from every admin user route (`:2542, :2549, :2617, :2625, :2634, :2647`).
- **Boarding / handover codes.** 4-digit, 5-attempt lockout with `security_events` and an admin page on the fifth miss (`server/main.ts:1941-1947`); boarding failures/codes are reset on reassignment and on release (`ride-lifecycle.ts:61-74`), so I could not build the "driver locks the order then releases" griefing chain.
- **SQL injection.** Every `all`/`one`/`run` call I read passes values as parameters. The only interpolated fragments are `inList()` over module-level constants (`server/main.ts:227-228`), the fixed `where`/`orderSelect` strings chosen by role (`:1442`), the constant `cashBalances` filter (`:2395-2403`) and the constant column list in the admin user search (`:2541`). None takes user input.
- **Path traversal / SSRF.** `serveWeb` decodes, rejects NUL, `resolve`s under `webRoot`, and rejects any `relative()` that escapes or is absolute (`server/main.ts:80-94`) — including `%5c` on Windows. `pushEndpoint` allowlists four push-service hosts, requires https, no port/user/pass, and caps length (`server/push.ts:39-45`). OSRM and the phone/email providers come from operator env with `redirect: 'error'`, timeouts and bounded responses (`main.ts:567`, `phone-provider.ts:66-67, 139-144`, `entra.ts:65-75`).
- **Entra token verification.** RS256 + `kid` only, JWKS URL and issuer derived exclusively from env and cross-pinned against the discovery document before fetching keys (`entra.ts:64-77, 110-125`), audience/iss/exp/iat/nbf all checked, `jti` replay table with a `lastMissAt` cooldown against forged kids. Linked accounts require a *verified* contact and refuse `admin`/already-linked rows (`main.ts:390-400`).
- **Secrets and the client bundle.** `.env.example` carries only `EXPO_PUBLIC_*` and signing variables — no real values, and no server secret. No hardcoded key in `server/` or `src/`. The phone-test backdoor is guarded three ways (`app.config.js:14-27`, `src/phone-test.ts:6-16`, `plugins/with-phone-test.js:8-22`): loopback-only API URL, `WIND_LOCAL_TEST=1`, and an explicit throw on `EAS_BUILD`/`WIND_RELEASE`. `with-release-guard.js` fails the Gradle build for a debug signing key, a cleartext or private API URL, or a local hostname.
- **Logs and error bodies.** `logServerError` emits only allowlisted category/sqlstate/code/correlationId/status (`diagnostics.ts:5-17`) and never an error message, which is where Postgres row data would appear. HTTP 500s return the literal `server_error`. Rate-limit, auth and code-verification failures return uniform messages; `entraExchange` and `accountFor` deliberately return the same answer whether or not the account exists.
- **OTP entropy and reuse.** 6 digits from `randomInt`, HMAC-SHA256 with a process-only key (`main.ts:601-603`), `timingSafeEqual` (`:621`, `phone-identity.ts:276`), 15-minute TTL, 5 tries then the code is deleted, one use, one purpose, and `ON CONFLICT DO UPDATE` so a resend replaces the previous code. Phone challenges bind `device_hash`, `session_hash`, `identity_revision`, `mapping_version` and `actor_role` into the digest and re-verify all of them (`phone-identity.ts:101-111`) — an OTP cannot be proven against a different session or phone. Recovery is public but refuses `admin` targets and requires the mapping to be `verified` (`:108`).
- **Presence / GPS.** Every write path re-reads the live session and role inside the write (`presence.ts:71-85`, `main.ts:2089-2095, 2159-2170`), the client-supplied accuracy cannot authorise an impossible jump (`presence.ts:176`), and the sweep removes precise pins more than 30 s old (`presence.ts:65-66`).
- **Client-side role gating is UX only.** `Stack.Protected` in `src/app/_layout.tsx` gates by `me.user.role`, but every screen's data comes from a server route that re-checks the role, so a patched client changes nothing. The bearer token lives in `SecureStore` on native and `localStorage` on web (`src/api.ts:24-31`); with no cookie, an XSS on the web origin can steal the token but cannot cross-site-forge a request.
- **Already-fixed items from `REVIEW-2026-10-07.md` that I re-checked and found still fixed:** the track-endpoint per-address limit and the HMAC-keyed public driver ref (`main.ts:1541-1545, 1566`), and the Entra partial-config boot guard (`main.ts:55-56`). No regression.
