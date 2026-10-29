import { createHash, randomUUID } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';
import { Eligibility, dispatchEnabled, eligibilityDefaults } from './eligibility.ts';

type Fail = (status: number, message: string) => never;
type Actor = { id: number; role: string; status: string };
type Context = { user: Actor; body: Row; params: string[] };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>, isPublic?: boolean) => unknown;
export type EtaResult = { seconds: number; estimated: boolean };
export type EtaProvider = (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) => Promise<EtaResult>;

export const DISPATCH_SHORTLIST_LIMIT = 10;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeStatuses = "('assigned','at_pickup','in_transit','on_hold','returning')";
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Pure rank: rating is never an input (WP10 binding formula). */
export const idleCreditSeconds = (idleSeconds: number) => Math.min(eligibilityDefaults.rankIdleCreditMaxSeconds, Math.floor(Math.max(0, idleSeconds) / eligibilityDefaults.rankIdleDivisor));
export const rankScore = (pickupEtaSeconds: number, idleSeconds: number) => pickupEtaSeconds - idleCreditSeconds(idleSeconds);
export type RankCandidate = { driverId: number; pickupEtaSeconds: number; idleSeconds: number };
export function rankCandidates<T extends RankCandidate>(candidates: T[]): (T & { idleCreditSeconds: number; rankScore: number })[] {
  return candidates.map(c => ({ ...c, idleCreditSeconds: idleCreditSeconds(c.idleSeconds), rankScore: rankScore(c.pickupEtaSeconds, c.idleSeconds) }))
    .sort((a, b) => a.rankScore - b.rankScore || a.driverId - b.driverId);
}

/** The raw lease nonce is never stored; it is re-derived server-side from the bound
 * presence session's credential hash and disclosed only to that driver. */
export const leaseNonceFor = (offerId: string, authSessionHash: string) => sha256(`dispatch-lease:${offerId}:${authSessionHash}`);
export const leaseNonceHash = (nonce: string) => sha256(nonce);

const haversineMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const rad = (n: number) => n * Math.PI / 180;
  const p = rad(b.latitude - a.latitude), q = rad(b.longitude - a.longitude);
  const v = Math.sin(p / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(q / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(v)));
};
/** Clearly-marked straight-line fallback; never presented as road ETA. */
export const straightLineEta: EtaProvider = async (from, to) => ({ seconds: Math.max(1, Math.ceil(haversineMeters(from, to) / (30_000 / 3600))), estimated: true });

export async function dispatchAvailable(db: Persistence): Promise<boolean> {
  if (db.backend !== 'postgres') return false;
  // Request-scoped: list endpoints call this once per row, and the answer cannot change mid-request.
  return db.memo('dispatchAvailable', async () => {
    const tables = await db.one("SELECT to_regclass('dispatch_rounds') AS rounds, to_regclass('dispatch_offers') AS offers, to_regclass('schema_migrations') AS migrations");
    return !!(tables?.rounds && tables.offers && tables.migrations && await db.one('SELECT version FROM schema_migrations WHERE version=13'));
  });
}

export class Dispatch {
  private db: Persistence;
  private eligibility: Eligibility;
  private fail: Fail;
  private eta: EtaProvider;
  onOffer?: (driverId: number, orderId: number) => Promise<void>;
  constructor(db: Persistence, eligibility: Eligibility, fail: Fail, eta: EtaProvider = straightLineEta, onOffer?: (driverId: number, orderId: number) => Promise<void>) {
    this.db = db; this.eligibility = eligibility; this.fail = fail; this.eta = eta; this.onOffer = onOffer;
  }
  enabled() { return dispatchEnabled(); }
  async available() { return dispatchAvailable(this.db); }
  private async requireAvailable() { if (!(await this.available())) this.fail(409, 'dispatch_unavailable'); }
  private isConflict(error: unknown) { return !!error && typeof error === 'object' && (error as { status?: unknown }).status === 409; }

  async summary(orderId: number, viewerDriverId?: number) {
    if (!(await this.available())) return null;
    const round = await this.db.one('SELECT * FROM dispatch_rounds WHERE order_id=? ORDER BY round_number DESC LIMIT 1', orderId);
    if (!round) return null;
    const result: Row = { roundId: round.id, state: round.state, closeReason: round.close_reason ?? null,
      offersIssued: Number(round.offers_issued), deadlineAt: Number(round.deadline_at), startedAt: Number(round.started_at) };
    if (viewerDriverId) {
      const offer = await this.db.one(`SELECT o.*, s.auth_session_hash FROM dispatch_offers o
        LEFT JOIN driver_presence_sessions s ON s.id=o.presence_session_id AND s.driver_id=o.driver_id
        WHERE o.order_id=? AND o.driver_id=? AND o.state='open' ORDER BY o.issued_at DESC LIMIT 1`, orderId, viewerDriverId);
      result.myOffer = offer ? { id: offer.id, offerId: offer.id, expiresAt: Number(offer.expires_at), issuedAt: Number(offer.issued_at),
        leaseNonce: offer.auth_session_hash ? leaseNonceFor(offer.id, offer.auth_session_hash) : null,
        pickupEtaSeconds: Number(offer.pickup_eta_seconds), idleSeconds: Number(offer.idle_seconds),
        idleCreditSeconds: Number(offer.idle_credit_seconds), rankScore: Number(offer.rank_score), etaEstimated: !!offer.eta_estimated } : null;
    }
    return result;
  }

  private async lockOrderAndRound(roundId: string) {
    const peek = await this.db.one('SELECT order_id FROM dispatch_rounds WHERE id=?::uuid', roundId);
    if (!peek) return { order: undefined, round: undefined };
    const order = await this.db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', peek.order_id);
    await this.db.one('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', `dispatch:${peek.order_id}`);
    const round = await this.db.one('SELECT * FROM dispatch_rounds WHERE id=?::uuid FOR UPDATE', roundId);
    return { order, round };
  }

  async startRound(orderId: number, now = Date.now()) {
    if (!this.enabled() || !(await this.available())) return null;
    const order = await this.db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', orderId);
    await this.db.one('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', `dispatch:${orderId}`);
    if (!order || order.service !== 'ride' || order.status !== 'searching') return null;
    const open = await this.db.one("SELECT * FROM dispatch_rounds WHERE order_id=? AND state='open' ORDER BY round_number DESC LIMIT 1", orderId);
    if (open) {
      const offer = await this.db.one("SELECT * FROM dispatch_offers WHERE round_id=?::uuid AND state='open' LIMIT 1", open.id);
      return { round: open, offer: offer ?? null };
    }
    const last = await this.db.one('SELECT COALESCE(MAX(round_number),0) AS n FROM dispatch_rounds WHERE order_id=?', orderId);
    const roundId = randomUUID();
    const round = await this.db.one(`INSERT INTO dispatch_rounds(id,order_id,round_number,state,started_at,deadline_at,offers_issued)
      VALUES(?::uuid,?,?, 'open',?,?,0) RETURNING *`, roundId, orderId, Number(last!.n) + 1, now, now + eligibilityDefaults.dispatchSearchSeconds * 1000);
    const offer = await this.issueNext(roundId, now);
    return { round: (await this.db.one('SELECT * FROM dispatch_rounds WHERE id=?::uuid', roundId)) ?? round!, offer };
  }

  private async candidates(order: Row, req: Row, roundId: string, now: number): Promise<Row[]> {
    if (order.pickup_lng == null || order.pickup_lat == null) return [];
    const fresh = now - eligibilityDefaults.matchingFixMaxAgeSeconds * 1000;
    const equipment = typeof req.equipment === 'string' ? req.equipment : JSON.stringify(req.equipment ?? []);
    const check = (kind: string, vehicle: boolean) => `COALESCE((SELECT c.outcome='approved' AND c.valid_from<=${now} AND c.expires_at>${now}${vehicle ? ' AND c.vehicle_revision=v.revision' : ''}
      FROM verification_checks c WHERE ${vehicle ? 'c.vehicle_id=v.id' : 'c.driver_id=u.id'} AND c.kind='${kind}' AND c.permit_key='' ORDER BY c.id DESC LIMIT 1),false)`;
    return this.db.all(`SELECT u.id AS driver_id, s.id AS session_id, s.started_at, s.auth_session_hash,
        l.lat, l.lng, d.vehicle_id, d.revision AS driver_revision, v.revision AS vehicle_revision,
        p.revision AS policy_revision, vr.revision AS run_revision
      FROM driver_presence_sessions s
      JOIN users u ON u.id=s.driver_id AND u.role='driver' AND u.status='active'
      JOIN driver_eligibility d ON d.driver_id=u.id AND d.enrolled=1 AND d.state='approved' AND d.valid_until>?
      JOIN vehicles v ON v.id=d.vehicle_id AND v.id=s.vehicle_id AND v.state='approved' AND v.valid_until>? AND v.inspection_required=0 AND u.vehicle=v.class
      JOIN eligibility_policy p ON p.id=1 AND p.activated=1 AND p.revision=s.policy_revision AND d.revision=s.driver_revision AND v.revision=s.vehicle_revision
      JOIN vehicle_runs vr ON vr.vehicle_id=v.id
      JOIN driver_latest_locations l ON l.driver_id=u.id AND l.session_id=s.id AND l.effective_at>=?
      WHERE s.state='online' AND s.lease_until>?
        AND ${check('driver_license', false)} AND ${check('vehicle_registration', true)} AND ${check('vehicle_inspection', true)}
        AND ? <= v.seats AND v.equipment @> ?::jsonb
        AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.driver_id=u.id AND o.status IN ${activeStatuses})
        AND NOT EXISTS(SELECT 1 FROM orders o JOIN driver_vehicles dv ON dv.driver_id=o.driver_id
          JOIN driver_eligibility selected ON selected.driver_id=dv.driver_id AND selected.vehicle_id=dv.vehicle_id
          WHERE dv.vehicle_id=v.id AND o.status IN ${activeStatuses})
        AND NOT EXISTS(SELECT 1 FROM order_releases r WHERE r.order_id=? AND r.driver_id=u.id)
        AND NOT EXISTS(SELECT 1 FROM dispatch_offers prior WHERE prior.round_id=?::uuid AND prior.driver_id=u.id)
        AND NOT EXISTS(SELECT 1 FROM dispatch_offers other_open WHERE other_open.driver_id=u.id AND other_open.state='open')
      ORDER BY l.position <-> ST_SetSRID(ST_MakePoint(?,?),4326), u.id
      LIMIT ${DISPATCH_SHORTLIST_LIMIT}`,
      now, now, fresh, now, req.seats, equipment, order.id, roundId, order.pickup_lng, order.pickup_lat);
  }

  /** Issue the next single offer, or exhaust the round. Assumes an enclosing transaction. */
  async issueNext(roundId: string, now = Date.now()) {
    const { order, round } = await this.lockOrderAndRound(roundId);
    if (!order || !round || round.state !== 'open') return null;
    if (order.service !== 'ride' || order.status !== 'searching') {
      await this.db.run("UPDATE dispatch_rounds SET state='cancelled',close_reason='cancelled',closed_at=? WHERE id=?::uuid AND state='open'", now, roundId);
      return null;
    }
    const deadline = Number(round.deadline_at);
    const exhaust = async (reason: 'no_driver' | 'deadline') => {
      await this.db.run("UPDATE dispatch_rounds SET state='exhausted',close_reason=?,closed_at=? WHERE id=?::uuid AND state='open'", reason, now, roundId);
      return null;
    };
    if (now >= deadline) return exhaust('deadline');
    if (Number(round.offers_issued) >= eligibilityDefaults.dispatchMaxOffers) return exhaust('no_driver');
    // Fail closed (prep A8): an unmeasured ride is never dispatched.
    const req = await this.db.one('SELECT * FROM order_requirements WHERE order_id=?', order.id);
    if (!req) return exhaust('no_driver');
    const shortlist = await this.candidates(order, req, roundId, now);
    const pickup = { latitude: Number(order.pickup_lat), longitude: Number(order.pickup_lng) };
    const ranked: Row[] = rankCandidates(await Promise.all(shortlist.map(async c => {
      let eta: EtaResult;
      try { eta = await this.eta({ latitude: Number(c.lat), longitude: Number(c.lng) }, pickup); }
      catch { eta = await straightLineEta({ latitude: Number(c.lat), longitude: Number(c.lng) }, pickup); }
      if (!Number.isFinite(eta.seconds) || eta.seconds < 0) eta = await straightLineEta({ latitude: Number(c.lat), longitude: Number(c.lng) }, pickup);
      return { ...c, driverId: Number(c.driver_id), pickupEtaSeconds: Math.round(eta.seconds), etaEstimated: !!eta.estimated,
        idleSeconds: Math.max(0, Math.floor((now - Number(c.started_at)) / 1000)) };
    })));
    let policy: Row;
    try { policy = await this.eligibility.lockPolicy('share'); } catch { return exhaust('no_driver'); }
    for (const candidate of ranked) {
      if (Date.now() >= deadline) return exhaust('deadline');
      if (Number((await this.db.one('SELECT offers_issued FROM dispatch_rounds WHERE id=?::uuid', roundId))!.offers_issued) >= eligibilityDefaults.dispatchMaxOffers) return exhaust('no_driver');
      try {
        const { d, v, run } = await this.eligibility.base(candidate.driverId, policy);
        if (d.revision !== candidate.driver_revision || v.revision !== candidate.vehicle_revision || run.revision !== candidate.run_revision) continue;
        const session = await this.db.one('SELECT * FROM driver_presence_sessions WHERE driver_id=? FOR UPDATE', candidate.driverId);
        if (!session || session.id !== candidate.session_id || session.state !== 'online' || Number(session.lease_until) <= now
          || session.driver_revision !== d.revision || session.vehicle_revision !== v.revision || session.policy_revision !== policy.revision) continue;
        if (await this.db.one(`SELECT 1 FROM orders WHERE driver_id=? AND status IN ${activeStatuses} LIMIT 1`, candidate.driverId)) continue;
        const leg = await this.db.one('SELECT * FROM order_approaches WHERE order_id=? AND vehicle_id=? ORDER BY id DESC LIMIT 1', order.id, v.id);
        if (!leg || leg.vehicle_revision !== v.revision || leg.requirements_revision !== req.revision || leg.run_revision !== run.revision
          || Number(leg.valid_until) <= now || Number(leg.to_lng) !== Number(order.pickup_lng) || Number(leg.to_lat) !== Number(order.pickup_lat)) continue;
        const through = now + candidate.pickupEtaSeconds * 1000 + (Number(req.route_seconds) + 2 * Number(req.service_seconds)) * 1000;
        await this.eligibility.coverage(order, req, v, candidate.driverId, through);
        const expires = Math.min(now + eligibilityDefaults.dispatchOfferSeconds * 1000, deadline);
        if (expires <= now) return exhaust('deadline');
        const offerId = randomUUID();
        const nonce = leaseNonceFor(offerId, session.auth_session_hash as string);
        const offer = await this.db.one(`INSERT INTO dispatch_offers(id,round_id,order_id,driver_id,state,nonce_hash,issued_at,expires_at,
            order_revision,assignment_epoch,presence_session_id,vehicle_id,driver_revision,vehicle_revision,policy_revision,requirements_revision,run_revision,
            pickup_eta_seconds,idle_seconds,idle_credit_seconds,rank_score,eta_estimated)
          VALUES(?::uuid,?::uuid,?,?,'open',?,?,?,?,?,?::uuid,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
          offerId, roundId, order.id, candidate.driverId, leaseNonceHash(nonce), now, expires,
          order.version, order.assignment_epoch, session.id, v.id, d.revision, v.revision, policy.revision, req.revision, run.revision,
          candidate.pickupEtaSeconds, candidate.idleSeconds, candidate.idleCreditSeconds, candidate.rankScore, candidate.etaEstimated ? 1 : 0);
        await this.db.run('UPDATE dispatch_rounds SET offers_issued=offers_issued+1 WHERE id=?::uuid', roundId);
        if (this.onOffer) await this.onOffer(candidate.driverId, Number(order.id));
        return { ...offer!, leaseNonce: nonce };
      } catch (error) { if (this.isConflict(error)) continue; throw error; }
    }
    return exhaust(now >= deadline ? 'deadline' : 'no_driver');
  }

  async decline(driverId: number, offerId: string) {
    await this.requireAvailable();
    if (!uuidPattern.test(offerId)) this.fail(400, 'invalid_input');
    const peek = await this.db.one('SELECT * FROM dispatch_offers WHERE id=?::uuid', offerId) ?? this.fail(404, 'not_found');
    await this.db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', peek!.order_id);
    await this.db.one('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', `dispatch:${peek!.order_id}`);
    await this.db.one('SELECT id FROM users WHERE id=? FOR UPDATE', driverId);
    const offer = await this.db.one('SELECT * FROM dispatch_offers WHERE id=?::uuid FOR UPDATE', offerId) ?? this.fail(404, 'not_found');
    if (Number(offer!.driver_id) !== driverId) this.fail(404, 'not_found');
    if (offer!.state === 'declined') return { ok: true, offerId, state: 'declined', dispatch: await this.summary(Number(offer!.order_id), driverId) };
    if (offer!.state !== 'open') this.fail(409, 'dispatch_offer_closed');
    const now = Date.now();
    await this.db.run("UPDATE dispatch_offers SET state='declined',responded_at=? WHERE id=?::uuid", now, offerId);
    await this.issueNext(offer!.round_id, now);
    return { ok: true, offerId, state: 'declined', dispatch: await this.summary(Number(offer!.order_id), driverId) };
  }

  async retry(customerId: number, orderId: number) {
    await this.requireAvailable();
    if (!this.enabled()) this.fail(409, 'dispatch_unavailable');
    const order = await this.db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', orderId) ?? this.fail(404, 'not_found');
    await this.db.one('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', `dispatch:${orderId}`);
    if (Number(order!.customer_id) !== customerId) this.fail(404, 'not_found');
    if (order!.service !== 'ride' || order!.status !== 'searching') this.fail(409, 'dispatch_retry_unavailable');
    await this.startRoundLocked(order!, Date.now());
    return { ok: true, orderId, dispatch: await this.summary(orderId) };
  }
  private async startRoundLocked(order: Row, now: number) {
    const open = await this.db.one("SELECT * FROM dispatch_rounds WHERE order_id=? AND state='open' ORDER BY round_number DESC LIMIT 1", order.id);
    if (open) return { round: open, offer: await this.db.one("SELECT * FROM dispatch_offers WHERE round_id=?::uuid AND state='open' LIMIT 1", open.id) };
    const last = await this.db.one('SELECT COALESCE(MAX(round_number),0) AS n FROM dispatch_rounds WHERE order_id=?', order.id);
    const roundId = randomUUID();
    await this.db.run("INSERT INTO dispatch_rounds(id,order_id,round_number,state,started_at,deadline_at,offers_issued) VALUES(?::uuid,?,?, 'open',?,?,0)",
      roundId, order.id, Number(last!.n) + 1, now, now + eligibilityDefaults.dispatchSearchSeconds * 1000);
    return { round: await this.db.one('SELECT * FROM dispatch_rounds WHERE id=?::uuid', roundId), offer: await this.issueNext(roundId, now) };
  }

  async hasOpenOffer(orderId: number): Promise<boolean> {
    if (!(await this.available())) return false;
    return !!(await this.db.one("SELECT 1 FROM dispatch_offers WHERE order_id=? AND state='open' LIMIT 1", orderId));
  }

  async cancelForOrder(orderId: number, now = Date.now()) {
    if (!(await this.available())) return false;
    const round = await this.db.one("SELECT * FROM dispatch_rounds WHERE order_id=? AND state='open' ORDER BY round_number DESC LIMIT 1", orderId);
    if (!round) return false;
    await this.db.run("UPDATE dispatch_offers SET state='revoked',responded_at=? WHERE round_id=?::uuid AND state='open'", now, round.id);
    await this.db.run("UPDATE dispatch_rounds SET state='cancelled',close_reason='cancelled',closed_at=? WHERE id=?::uuid AND state='open'", now, round.id);
    return true;
  }

  async recordRelease(orderId: number, driverId: number, now = Date.now()) {
    if (!(await this.available())) return;
    const order = await this.db.one('SELECT assignment_epoch FROM orders WHERE id=?', orderId);
    await this.db.run(`INSERT INTO assignment_history(order_id,driver_id,action,assignment_epoch,actor_id,created_at) VALUES(?,?,'released',?,?,?)`,
      orderId, driverId, Number(order?.assignment_epoch ?? 0), driverId, now);
  }

  /** Validate and close a dispatch acceptance; `assign` performs the legacy order assignment. */
  async acceptOffer<T>(input: { driverId: number; orderId: number; offerId: unknown; leaseNonce: unknown; capacityProtocol?: unknown; expectedRequirementsRevision?: unknown }, assign: () => Promise<T>): Promise<T> {
    await this.requireAvailable();
    if (typeof input.offerId !== 'string' || !uuidPattern.test(input.offerId) || typeof input.leaseNonce !== 'string' || !input.leaseNonce) this.fail(400, 'invalid_input');
    const offerId = input.offerId, now = Date.now();
    const order = await this.db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', input.orderId) ?? this.fail(404, 'not_found');
    await this.db.one('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', `dispatch:${input.orderId}`);
    const driver = await this.db.one('SELECT * FROM users WHERE id=? FOR UPDATE', input.driverId);
    if (!driver || driver.role !== 'driver' || driver.status !== 'active') this.fail(403, 'driver_ineligible');
    const presence = await this.db.one('SELECT * FROM driver_presence_sessions WHERE driver_id=? FOR UPDATE', input.driverId);
    const peek = await this.db.one('SELECT * FROM dispatch_offers WHERE id=?::uuid', offerId);
    if (peek) {
      await this.db.one('SELECT * FROM vehicles WHERE id=? FOR UPDATE', peek.vehicle_id);
      await this.db.one('SELECT * FROM vehicle_runs WHERE vehicle_id=? FOR UPDATE', peek.vehicle_id);
    }
    const offer = await this.db.one('SELECT * FROM dispatch_offers WHERE id=?::uuid FOR UPDATE', offerId) ?? this.fail(404, 'not_found');
    if (Number(offer!.order_id) !== input.orderId || Number(offer!.driver_id) !== input.driverId) this.fail(404, 'not_found');
    if (offer!.state === 'expired') this.fail(409, 'offer_expired');
    if (offer!.state !== 'open') this.fail(409, 'dispatch_offer_closed');
    if (leaseNonceHash(input.leaseNonce as string) !== offer!.nonce_hash) this.fail(409, 'invalid_lease_nonce');
    if (Number(offer!.expires_at) <= now) this.fail(409, 'offer_expired');
    const round = await this.db.one('SELECT * FROM dispatch_rounds WHERE id=?::uuid FOR UPDATE', offer!.round_id);
    if (!round || round.state !== 'open') this.fail(409, 'dispatch_offer_closed');
    if (order!.service !== 'ride' || order!.status !== 'searching') this.fail(409, 'already_taken');
    if (Number(order!.version) !== Number(offer!.order_revision) || Number(order!.assignment_epoch) !== Number(offer!.assignment_epoch)) this.fail(409, 'dispatch_order_changed');
    if (!presence || presence.id !== offer!.presence_session_id || presence.state !== 'online' || Number(presence.lease_until) <= now) this.fail(409, 'presence_session_changed');
    const d = await this.db.one('SELECT * FROM driver_eligibility WHERE driver_id=?', input.driverId);
    const v = d && await this.db.one('SELECT * FROM vehicles WHERE id=?', d.vehicle_id);
    const policy = await this.db.one('SELECT * FROM eligibility_policy WHERE id=1');
    const req = await this.db.one('SELECT * FROM order_requirements WHERE order_id=?', input.orderId);
    const run = v && await this.db.one('SELECT * FROM vehicle_runs WHERE vehicle_id=?', v.id);
    if (!d || !v || !policy || !req || !run
      || Number(d.revision) !== Number(offer!.driver_revision) || Number(v.revision) !== Number(offer!.vehicle_revision)
      || Number(policy.revision) !== Number(offer!.policy_revision) || Number(req.revision) !== Number(offer!.requirements_revision)
      || Number(run.revision) !== Number(offer!.run_revision) || Number(v.id) !== Number(offer!.vehicle_id)
      || Number(presence.driver_revision) !== Number(d.revision) || Number(presence.vehicle_revision) !== Number(v.revision)
      || Number(presence.policy_revision) !== Number(policy.revision)) this.fail(409, 'eligibility_changed');
    if (await this.db.one(`SELECT 1 FROM orders WHERE driver_id=? AND status IN ${activeStatuses} LIMIT 1`, input.driverId)) this.fail(409, 'vehicle_busy');
    if (await this.db.one(`SELECT 1 FROM orders o JOIN driver_vehicles dv ON dv.driver_id=o.driver_id
        JOIN driver_eligibility selected ON selected.driver_id=dv.driver_id AND selected.vehicle_id=dv.vehicle_id
        WHERE dv.vehicle_id=? AND o.status IN ${activeStatuses} LIMIT 1`, offer!.vehicle_id)) this.fail(409, 'shared_vehicle_busy');
    if (await this.db.one('SELECT 1 FROM order_releases WHERE order_id=? AND driver_id=?', input.orderId, input.driverId)) this.fail(404, 'not_found');
    await this.eligibility.guard(input.driverId, input.orderId, 'accept', input.capacityProtocol, undefined, input.expectedRequirementsRevision);
    const result = await assign();
    const acceptedAt = Date.now();
    await this.db.run("UPDATE dispatch_offers SET state='accepted',responded_at=? WHERE id=?::uuid", acceptedAt, offerId);
    await this.db.run("UPDATE dispatch_offers SET state='revoked',responded_at=? WHERE round_id=?::uuid AND state='open'", acceptedAt, offer!.round_id);
    await this.db.run("UPDATE dispatch_rounds SET state='matched',close_reason='matched',closed_at=? WHERE id=?::uuid", acceptedAt, offer!.round_id);
    const after = await this.db.one('SELECT assignment_epoch FROM orders WHERE id=?', input.orderId);
    await this.db.run(`INSERT INTO assignment_history(order_id,driver_id,vehicle_id,round_id,offer_id,action,assignment_epoch,actor_id,created_at)
      VALUES(?,?,?,?,?::uuid,'assigned',?,?,?)`, input.orderId, input.driverId, offer!.vehicle_id, offer!.round_id, offerId, Number(after?.assignment_epoch ?? offer!.assignment_epoch), input.driverId, acceptedAt);
    await this.db.one("SELECT append_domain_event(?,'dispatch.matched',?::jsonb) AS id", input.orderId, JSON.stringify({ offerId, roundId: offer!.round_id, driverId: input.driverId }));
    if (result && typeof result === 'object') (result as Row).dispatch = await this.summary(input.orderId, input.driverId);
    return result;
  }

  private async expireOne(offerId: string, now: number): Promise<boolean> {
    const peek = await this.db.one('SELECT order_id FROM dispatch_offers WHERE id=?::uuid', offerId);
    if (!peek) return false;
    const order = await this.db.one('SELECT * FROM orders WHERE id=? FOR UPDATE', peek.order_id);
    await this.db.one('SELECT pg_advisory_xact_lock(hashtextextended(?,0))', `dispatch:${peek.order_id}`);
    const offerPeek = await this.db.one('SELECT * FROM dispatch_offers WHERE id=?::uuid', offerId);
    if (offerPeek) {
      await this.db.one('SELECT id FROM users WHERE id=? FOR UPDATE', offerPeek.driver_id);
      await this.db.one('SELECT * FROM driver_presence_sessions WHERE driver_id=? FOR UPDATE', offerPeek.driver_id);
      await this.db.one('SELECT * FROM vehicles WHERE id=? FOR UPDATE', offerPeek.vehicle_id);
      await this.db.one('SELECT * FROM vehicle_runs WHERE vehicle_id=? FOR UPDATE', offerPeek.vehicle_id);
    }
    const offer = await this.db.one('SELECT * FROM dispatch_offers WHERE id=?::uuid FOR UPDATE', offerId);
    if (!offer || offer.state !== 'open' || Number(offer.expires_at) > now) return false;
    // Identical version boundary to acceptance: exactly one of them can win.
    if (!order || order.status !== 'searching' || Number(order.version) !== Number(offer.order_revision) || Number(order.assignment_epoch) !== Number(offer.assignment_epoch)) {
      await this.db.run("UPDATE dispatch_offers SET state='revoked',responded_at=? WHERE id=?::uuid AND state='open'", now, offerId);
      return true;
    }
    await this.db.run("UPDATE dispatch_offers SET state='expired',responded_at=? WHERE id=?::uuid AND state='open'", now, offerId);
    await this.issueNext(offer.round_id, now);
    return true;
  }

  /** Worker-safe, idempotent expiry; safe to call again after a restart. */
  async processExpiries(limit = 100, now = Date.now()): Promise<number> {
    if (!(await this.available())) return 0;
    let processed = 0;
    const offers = await this.db.all("SELECT id FROM dispatch_offers WHERE state='open' AND expires_at<=? ORDER BY expires_at,id LIMIT ?", now, limit);
    for (const offer of offers) {
      const changed = await this.db.atomic({ purpose: 'dispatch_offer_expiry' }, () => this.expireOne(offer.id, now));
      if (changed) processed++;
    }
    const rounds = await this.db.all("SELECT id FROM dispatch_rounds WHERE state='open' AND deadline_at<=? ORDER BY deadline_at,id LIMIT ?", now, limit);
    for (const round of rounds) {
      const changed = await this.db.atomic({ purpose: 'dispatch_deadline_expiry' }, async () => {
        const { order, round: current } = await this.lockOrderAndRound(round.id);
        if (!current || current.state !== 'open' || Number(current.deadline_at) > now) return false;
        await this.db.run("UPDATE dispatch_offers SET state='expired',responded_at=? WHERE round_id=?::uuid AND state='open'", now, round.id);
        const reason = order && order.status === 'searching' ? 'deadline' : 'cancelled';
        await this.db.run('UPDATE dispatch_rounds SET state=?,close_reason=?,closed_at=? WHERE id=?::uuid AND state=?', reason === 'deadline' ? 'exhausted' : 'cancelled', reason, now, round.id, 'open');
        return true;
      });
      if (changed) processed++;
    }
    return processed;
  }
}

export function registerDispatchRoutes(route: Register, service: Dispatch) {
  route('POST', '/api/offers/([0-9a-f-]{36})/decline', ctx => service.decline(ctx.user.id, ctx.params[0]!));
  route('POST', '/api/orders/:id/dispatch/retry', ctx => service.retry(ctx.user.id, Number(ctx.params[0])));
}
