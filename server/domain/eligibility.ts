import { randomInt } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';
import { offerRange, vehicleServices, type Vehicle } from '../../src/model.ts';
import { declaredScopeRow } from './resource-scope.ts';

type Fail = (status: number, message: string) => never;
type Actor = { id: number; role: string; status: string };
type Context = { user: Actor; body: Row; params: string[] };
type Register = (method: string, path: string, handler: (ctx: Context) => Promise<unknown>) => unknown;
const active = "('assigned','at_pickup','in_transit','on_hold','returning')";
const states = ['draft','submitted','under_review','approved','changes_required','rejected','suspended','expired'];
const classes = ['bicycle','motorcycle','car','van','truck'];
const services = ['ride','parcel','freight'];
export const eligibilityDefaults = Object.freeze({ version: 1, boundary: 'ST_Covers', coordinateOrder: 'longitude_latitude',
  dimensionPolicy: 'fixed_axes_no_stacking', reservationPolicy: 'all_accepted_pickups_until_finished', secondaryCountLimit: 200,
  insertionOptimization: false, identityScansCollected: false, legacyCapacityMeasured: false,
  presenceHeartbeatSeconds: 15, presenceLeaseSeconds: 60, matchingFixMaxAgeSeconds: 30,
  movingLocationSeconds: 5, stationaryLocationSeconds: 15, locationTransportMinSeconds: 2,
  dispatchOfferSeconds: 15, dispatchMaxOffers: 3, dispatchSearchSeconds: 90, quoteSeconds: 120,
  negotiatedOfferSeconds: 600, newWaitingFeeMinor: 0, newCancellationFeeMinor: 0,
  projectedCashCapMinor: 100000, cashCapActivated: false, futureDispatchActivated: false,
  otpSeconds: 300, otpAttempts: 5, otpResendSeconds: 45, otpPhoneDevicePer15Minutes: 3, otpPhoneDevicePerDay: 10,
  otpIpPerHourReview: 30, rawLocationHistory: false, consentedQaTraceRetentionHours: 24,
  scheduleMaxDays: 7, scheduleReleaseMinutes: 30, guaranteedReservation: false,
  rankIdleCreditMaxSeconds: 60, rankIdleDivisor: 10, newBoardingChallengeDigits: 4, newBoardingChallengeAttempts: 5,
  futureBoardingChallengeActivated: false });

/** WP10 activation gate: real dispatch stays off; only an explicit test process may enable it. */
export const dispatchEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  eligibilityDefaults.futureDispatchActivated || (env.NODE_ENV === 'test' && env.WIND_DISPATCH_TEST_ONLY === '1');

export async function measuredCapability(db: Persistence) {
  if (db.backend !== 'postgres') return false;
  const tables = await db.one("SELECT to_regclass('schema_migrations') m,to_regclass('eligibility_policy') p");
  return !!(tables?.m && tables.p && await db.one('SELECT version FROM schema_migrations WHERE version=8'));
}

/** Safe measured scope only; no reviewer, provenance, geometry or candidate vehicle locations. */
export async function measuredScopes(db: Persistence, orderIds: number[]) {
  if (!orderIds.length || !(await measuredCapability(db))) return {} as Record<number, Row>;
  const ids=[...new Set(orderIds)];
  const rows: Row[]=[];
  for (let offset=0;offset<ids.length;offset+=50) {
    const batch=ids.slice(offset,offset+50);
    rows.push(...await db.all(`SELECT order_id,revision,grams,cm3,pieces,seats,items,equipment,rotation_policy,route_seconds,service_seconds,pickup_after,pickup_before,dropoff_before
      FROM order_requirements WHERE order_id IN (${batch.map(()=>'?').join(',')})`,...batch));
  }
  return Object.fromEntries(rows.map(r=>[r.order_id,Object.freeze({requirementsRevision:r.revision,grams:r.grams,cm3:r.cm3,pieces:r.pieces,seats:r.seats,
    items:r.items,equipment:r.equipment,rotationPolicy:r.rotation_policy,routeSeconds:r.route_seconds,serviceSeconds:r.service_seconds,
    pickupAfter:r.pickup_after,pickupBefore:r.pickup_before,dropoffBefore:r.dropoff_before})]));
}

/** The open pool is browsable only by an active driver whose own vehicle may carry the
 *  service, once a scheduled order is released, and never by a driver who released it. */
export async function openToDriver(db: Persistence, driver: { id: number; role: string; status?: string; vehicle?: string | null },
  order: Row, now = Date.now()): Promise<boolean> {
  if (driver.role !== 'driver' || driver.status !== 'active' || order.status !== 'searching') return false;
  const enabled = (process.env.WIND_ENABLED_SERVICES ?? 'parcel').split(',').map(service => service.trim());
  if (!services.includes(order.service) || !enabled.includes(order.service)) return false;
  if (!(vehicleServices[driver.vehicle as Vehicle] ?? []).includes(order.service)) return false;
  if (order.scheduled_for != null && Number(order.scheduled_for) > now + eligibilityDefaults.scheduleReleaseMinutes * 60_000) return false;
  return !(await db.one('SELECT 1 FROM order_releases WHERE order_id=? AND driver_id=?', order.id, driver.id));
}

/** One implementation for actual HTTP offer/accept paths; no client eligibility assertion is trusted. */
export class Eligibility {
  db: Persistence;
  fail: Fail;
  constructor(db: Persistence, fail: Fail) { this.db = db; this.fail = fail; }
  str(value: unknown, max = 160) {
    if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max || /[\x00-\x1f]/.test(value)) this.fail(400,'invalid_input');
    return (value as string).trim();
  }
  int(value: unknown, min = 0, max = 1_000_000_000) {
    if (!Number.isSafeInteger(value) || (value as number)<min || (value as number)>max) this.fail(400,'invalid_input');
    return value as number;
  }
  list(value: unknown, allowed?: string[]) {
    if (!Array.isArray(value) || value.length>30 || value.some(x=>typeof x!=='string' || !/^[a-z][a-z0-9_]{0,63}$/.test(x) || (allowed && !allowed.includes(x)))) this.fail(400,'invalid_input');
    return [...new Set(value as string[])].sort();
  }
  choice(value: unknown, allowed: string[]) { if (!allowed.includes(value as string)) this.fail(400,'invalid_input'); return value as string; }
  fields(body: Row, allowed: string[]) { if (Object.keys(body).some(k=>!allowed.includes(k))) this.fail(400,'invalid_input'); }
  reason(body: Row) { const s=this.str(body.reason,500); if (s.length<5) this.fail(400,'reason_required'); return s; }
  ref(body: Row) { const s=this.str(body.evidenceRef); if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,159}$/.test(s)) this.fail(400,'invalid_evidence_ref'); return s; }
  async available() { if (!(await measuredCapability(this.db))) this.fail(409,'measured_protocol_unavailable'); }
  async lockPolicy(mode:'update'|'share'='update') { await this.available(); return (await this.db.one(`SELECT * FROM eligibility_policy WHERE id=1 FOR ${mode==='share'?'SHARE':'UPDATE'}`))!; }
  async audit(actor: number, action: string, subject: number, reason: string, evidence: string | null = null) {
    await this.db.run('INSERT INTO eligibility_audit(actor_id,action,subject_id,reason,evidence_ref,created_at) VALUES(?,?,?,?,?,?)',actor,action,subject,reason,evidence,Date.now());
    // Safe domain event intentionally excludes operator free text and provenance references.
    await this.db.one("SELECT append_domain_event(NULL,'eligibility.changed',?::jsonb) id",JSON.stringify({action,subjectId:subject}));
  }
  async geometry(value: unknown, line = false) {
    if (!value || typeof value!=='object' || Array.isArray(value)) this.fail(400,'invalid_geometry');
    const g=value as Row;
    if (g.type!==(line?'LineString':'Polygon') && (line || g.type!=='MultiPolygon')) this.fail(400,'invalid_geometry');
    let points=0;
    const point=(v: unknown): v is number[]=>{
      points++; return Array.isArray(v) && v.length===2 && v.every(Number.isFinite) && Math.abs(v[0])<=180 && Math.abs(v[1])<=90;
    };
    const ring=(v: unknown): boolean=>Array.isArray(v) && v.length>=4 && v.every(point) && v[0][0]===v[v.length-1][0] && v[0][1]===v[v.length-1][1];
    const polygon=(v: unknown): boolean=>Array.isArray(v) && v.length>0 && v.every(ring);
    const valid=line ? Array.isArray(g.coordinates) && g.coordinates.length>=2 && g.coordinates.every(point)
      : g.type==='Polygon' ? polygon(g.coordinates) : Array.isArray(g.coordinates) && g.coordinates.length>0 && g.coordinates.every(polygon);
    if (!valid || points>(line?2000:10000)) this.fail(400,'invalid_geometry');
    const encoded=JSON.stringify({type:g.type,coordinates:g.coordinates});
    const r=await this.db.one('SELECT ST_IsValid(ST_GeomFromGeoJSON(?),0) valid,ST_IsEmpty(ST_GeomFromGeoJSON(?)) empty',encoded,encoded);
    if (!r?.valid || r.empty) this.fail(400,'invalid_geometry');
    return encoded;
  }
  validity(body: Row) {
    const from=this.int(body.validFrom,0,Number.MAX_SAFE_INTEGER),until=this.int(body.validUntil,1,Number.MAX_SAFE_INTEGER);
    if (until<=from) this.fail(400,'invalid_validity'); return {from,until};
  }
  async unknown(vehicleId: number) {
    return !!await this.db.one(`SELECT o.id FROM orders o JOIN driver_vehicles dv ON dv.driver_id=o.driver_id
      JOIN driver_eligibility selected ON selected.driver_id=dv.driver_id AND selected.vehicle_id=dv.vehicle_id
      LEFT JOIN capacity_reservations r ON r.order_id=o.id AND r.vehicle_id=dv.vehicle_id AND r.driver_id=o.driver_id
      WHERE dv.vehicle_id=? AND o.status IN ${active} AND r.order_id IS NULL LIMIT 1`,vehicleId);
  }
  async markInspection(vehicleId: number, actorId: number) {
    const changed=await this.db.run('UPDATE vehicles SET inspection_required=1 WHERE id=? AND inspection_required=0',vehicleId);
    if (changed.changes) await this.audit(actorId,'unknown_legacy_load',vehicleId,'Unknown active legacy load requires physical inspection');
  }
  async checked(kind: string, driverId: number, vehicle: Row, permit = '', through = Date.now()) {
    const subject=kind==='driver_license' ? 'driver_id=?' : 'vehicle_id=?';
    const c=await this.db.one(`SELECT * FROM verification_checks WHERE ${subject} AND kind=? AND permit_key=? ORDER BY id DESC LIMIT 1`,kind==='driver_license'?driverId:vehicle.id,kind,permit);
    return !!(c && c.outcome==='approved' && c.valid_from<=Date.now() && c.expires_at>through
      && (kind==='driver_license' || c.vehicle_revision===vehicle.revision));
  }
  async permit(key: string, driverId: number, vehicle: Row, through: number) {
    // Configured conservative evaluation: either subject's latest applicable negative vetoes.
    const d=await this.db.one("SELECT * FROM verification_checks WHERE driver_id=? AND kind='permit' AND permit_key=? AND valid_from<=? ORDER BY id DESC LIMIT 1",driverId,key,Date.now());
    const v=await this.db.one("SELECT * FROM verification_checks WHERE vehicle_id=? AND vehicle_revision=? AND kind='permit' AND permit_key=? AND valid_from<=? ORDER BY id DESC LIMIT 1",vehicle.id,vehicle.revision,key,Date.now());
    const applicable=[d,v].filter((c): c is Row=>!!c && c.valid_from<=Date.now());
    if (applicable.some(c=>c.outcome!=='approved')) return false;
    return applicable.some(c=>c.outcome==='approved' && c.expires_at>through);
  }
  point(value: unknown) {
    if (!value || typeof value!=='object' || Array.isArray(value)) this.fail(400,'invalid_coordinates');
    const p=value as Row; this.fields(p,['longitude','latitude']);
    if (!Number.isFinite(p.longitude) || !Number.isFinite(p.latitude) || Math.abs(p.longitude)>180 || Math.abs(p.latitude)>90) this.fail(400,'invalid_coordinates');
    return p;
  }
  async approach(order: Row, req: Row, v: Row, run: Row, loads: Row[], start: number, now: number) {
    const leg=await this.db.one('SELECT * FROM order_approaches WHERE order_id=? AND vehicle_id=? ORDER BY id DESC LIMIT 1',order.id,v.id);
    if (!leg) this.fail(409,'approach_evidence_missing');
    if (leg.vehicle_revision!==v.revision || leg.requirements_revision!==req.revision || leg.run_revision!==run.revision) this.fail(409,'approach_evidence_changed');
    if (leg.observed_at>now || leg.observed_at<now-300000 || leg.valid_until<=now || leg.valid_until<start+leg.seconds*1000) this.fail(409,'approach_evidence_expired');
    if (leg.to_lng!==order.pickup_lng || leg.to_lat!==order.pickup_lat) this.fail(409,'approach_endpoint_mismatch');
    const last=[...loads].sort((a,b)=>b.planned_end-a.planned_end || b.order_id-a.order_id)[0];
    if (last) {
      const end=await this.db.one('SELECT dropoff_lng,dropoff_lat FROM orders WHERE id=?',last.order_id);
      if (!end || leg.from_lng!==end.dropoff_lng || leg.from_lat!==end.dropoff_lat) this.fail(409,'approach_endpoint_mismatch');
    }
    return leg.seconds*1000;
  }
  async base(driverId: number, policy: Row, requireEnrolled = true) {
    const user=await this.db.one('SELECT id,role,status,vehicle FROM users WHERE id=? FOR UPDATE',driverId);
    const d=await this.db.one('SELECT * FROM driver_eligibility WHERE driver_id=? FOR UPDATE',driverId);
    if (!d || (requireEnrolled && !d.enrolled)) this.fail(409,'measured_cohort_required');
    const v=await this.db.one('SELECT * FROM vehicles WHERE id=? FOR UPDATE',d.vehicle_id);
    if (!v) this.fail(409,'vehicle_evidence_missing');
    await this.db.run('INSERT INTO vehicle_runs(vehicle_id) VALUES(?) ON CONFLICT DO NOTHING',v.id);
    const run=await this.db.one('SELECT * FROM vehicle_runs WHERE vehicle_id=? FOR UPDATE',v.id);
    if (await this.unknown(v.id)) { await this.markInspection(v.id,driverId); this.fail(409,'legacy_load_inspection_required'); }
    if (!policy.activated) this.fail(409,'coverage_policy_inactive');
    if (!user || user.role!=='driver' || user.status!=='active' || d.state!=='approved' || d.valid_until<=Date.now()) this.fail(409,'driver_ineligible');
    if (v.state!=='approved' || v.valid_until<=Date.now() || v.inspection_required || user.vehicle!==v.class) this.fail(409,'vehicle_ineligible');
    if (!(await this.checked('driver_license',driverId,v))) this.fail(409,'driver_document_invalid');
    for (const kind of ['vehicle_registration','vehicle_inspection']) if (!(await this.checked(kind,driverId,v))) this.fail(409,'vehicle_document_invalid');
    return {d,v,run:run!};
  }
  async coverage(order: Row, req: Row, vehicle: Row, driverId: number, through: number) {
    if (order.pickup_lng==null || order.dropoff_lng==null) this.fail(409,'confirmed_coordinates_required');
    const endpoint=await this.db.one(`SELECT ST_Equals(ST_StartPoint(route),ST_SetSRID(ST_MakePoint(?,?),4326)) a,
      ST_Equals(ST_EndPoint(route),ST_SetSRID(ST_MakePoint(?,?),4326)) b FROM order_requirements WHERE order_id=?`,order.pickup_lng,order.pickup_lat,order.dropoff_lng,order.dropoff_lat,order.id);
    if (!endpoint?.a || !endpoint.b) this.fail(409,'route_endpoint_mismatch');
    const rows=await this.db.all(`SELECT p.id,p.required_permits route_permits,a.required_permits from_permits,b.required_permits to_permits
      FROM route_permissions p JOIN service_areas a ON a.id=p.from_area_id JOIN service_areas b ON b.id=p.to_area_id
      JOIN order_requirements r ON r.order_id=?
      WHERE p.state='approved' AND a.state='approved' AND b.state='approved'
      AND NOT EXISTS(SELECT 1 FROM route_permissions newer WHERE newer.route_key=p.route_key AND newer.version>p.version)
      AND NOT EXISTS(SELECT 1 FROM service_areas newer WHERE newer.area_key=a.area_key AND newer.version>a.version)
      AND NOT EXISTS(SELECT 1 FROM service_areas newer WHERE newer.area_key=b.area_key AND newer.version>b.version)
      AND p.valid_from<=? AND p.valid_until>=? AND a.valid_from<=? AND a.valid_until>=? AND b.valid_from<=? AND b.valid_until>=?
      AND p.services @> ?::jsonb AND a.services @> ?::jsonb AND b.services @> ?::jsonb
      AND p.vehicle_classes @> ?::jsonb AND a.vehicle_classes @> ?::jsonb AND b.vehicle_classes @> ?::jsonb
      AND ST_Covers(a.geometry,ST_StartPoint(r.route)) AND ST_Covers(b.geometry,ST_EndPoint(r.route)) AND ST_Covers(p.corridor,r.route)
      ORDER BY p.id`,order.id,Date.now(),through,Date.now(),through,Date.now(),through,
      JSON.stringify([order.service]),JSON.stringify([order.service]),JSON.stringify([order.service]),
      JSON.stringify([vehicle.class]),JSON.stringify([vehicle.class]),JSON.stringify([vehicle.class]));
    if (!rows.length) this.fail(409,'route_not_permitted');
    for (const r of rows) {
      let allowed=true;
      for (const key of new Set<string>([...r.route_permits,...r.from_permits,...r.to_permits])) if (!(await this.permit(key,driverId,vehicle,through))) allowed=false;
      if (allowed) return;
    }
    this.fail(409,'permit_missing');
  }
  /** Declared orders carry no operator route geometry: coverage is proven from
   * the confirmed pickup/dropoff points inside approved areas on an approved
   * route permission, with the same permit checks. No corridor is invented. */
  async coverageDeclared(order: Row, vehicle: Row, driverId: number, through: number) {
    if (order.pickup_lng==null || order.dropoff_lng==null) this.fail(409,'confirmed_coordinates_required');
    const rows=await this.db.all(`SELECT p.id,p.required_permits route_permits,a.required_permits from_permits,b.required_permits to_permits
      FROM route_permissions p JOIN service_areas a ON a.id=p.from_area_id JOIN service_areas b ON b.id=p.to_area_id
      WHERE p.state='approved' AND a.state='approved' AND b.state='approved'
      AND NOT EXISTS(SELECT 1 FROM route_permissions newer WHERE newer.route_key=p.route_key AND newer.version>p.version)
      AND NOT EXISTS(SELECT 1 FROM service_areas newer WHERE newer.area_key=a.area_key AND newer.version>a.version)
      AND NOT EXISTS(SELECT 1 FROM service_areas newer WHERE newer.area_key=b.area_key AND newer.version>b.version)
      AND p.valid_from<=? AND p.valid_until>=? AND a.valid_from<=? AND a.valid_until>=? AND b.valid_from<=? AND b.valid_until>=?
      AND p.services @> ?::jsonb AND a.services @> ?::jsonb AND b.services @> ?::jsonb
      AND p.vehicle_classes @> ?::jsonb AND a.vehicle_classes @> ?::jsonb AND b.vehicle_classes @> ?::jsonb
      AND ST_Covers(a.geometry,ST_SetSRID(ST_MakePoint(?,?),4326)) AND ST_Covers(b.geometry,ST_SetSRID(ST_MakePoint(?,?),4326))
      ORDER BY p.id`,Date.now(),through,Date.now(),through,Date.now(),through,
      JSON.stringify([order.service]),JSON.stringify([order.service]),JSON.stringify([order.service]),
      JSON.stringify([vehicle.class]),JSON.stringify([vehicle.class]),JSON.stringify([vehicle.class]),
      order.pickup_lng,order.pickup_lat,order.dropoff_lng,order.dropoff_lat);
    if (!rows.length) this.fail(409,'route_not_permitted');
    for (const r of rows) {
      let allowed=true;
      for (const key of new Set<string>([...r.route_permits,...r.from_permits,...r.to_permits])) if (!(await this.permit(key,driverId,vehicle,through))) allowed=false;
      if (allowed) return;
    }
    this.fail(409,'permit_missing');
  }
  async guard(driverId: number, orderId: number, kind: 'offer'|'accept'|'offer_accept', requested: unknown, offeredPrice?: unknown, expectedRequirementsRevision?: unknown) {
    if (requested!==undefined && requested!==1) this.fail(400,'invalid_capacity_protocol');
    if (expectedRequirementsRevision!==undefined) this.int(expectedRequirementsRevision,1,Number.MAX_SAFE_INTEGER);
    if (!(await measuredCapability(this.db))) {
      if (requested!==undefined) this.fail(409,'measured_protocol_unavailable');
      // A partially upgraded PostgreSQL schema may already contain enrolled drivers or
      // measured work. Do not let an omitted protocol flag bypass their safety gates.
      if (this.db.backend==='postgres' && (await this.db.one("SELECT to_regclass('driver_eligibility') t"))?.t) {
        const cohort=await this.db.one('SELECT 1 FROM driver_eligibility WHERE driver_id=?',driverId);
        const scope=await this.db.one('SELECT 1 FROM order_requirements WHERE order_id=?',orderId);
        if (cohort || scope || await declaredScopeRow(this.db,orderId)) this.fail(409,'measured_protocol_unavailable');
      }
      return;
    }
    const cohort=await this.db.one('SELECT * FROM driver_eligibility WHERE driver_id=?',driverId);
    let req=await this.db.one('SELECT * FROM order_requirements WHERE order_id=?',orderId);
    const declaredEarly=req ? null : await declaredScopeRow(this.db,orderId);
    const oldOffer=kind==='offer_accept' ? await this.db.one('SELECT * FROM eligibility_offers WHERE order_id=? AND driver_id=?',orderId,driverId) : undefined;
    if (!cohort?.enrolled && requested===undefined && !req && !declaredEarly && !oldOffer) {
      // Linked installed clients may retain their flow, but cannot add unknown work to a measured/shared exclusive run.
      if (cohort) {
        await this.lockPolicy();
        await this.db.one('SELECT id FROM vehicles WHERE id=? FOR UPDATE',cohort.vehicle_id);
        const busy=await this.db.one(`SELECT o.id FROM orders o JOIN driver_vehicles dv ON dv.driver_id=o.driver_id
          JOIN driver_eligibility selected ON selected.driver_id=dv.driver_id AND selected.vehicle_id=dv.vehicle_id
          WHERE dv.vehicle_id=? AND o.id<>? AND o.status IN ${active}
          AND (o.service<>'parcel' OR (SELECT service FROM orders WHERE id=?)<>'parcel'
            OR EXISTS(SELECT 1 FROM capacity_reservations r WHERE r.order_id=o.id)) LIMIT 1`,cohort.vehicle_id,orderId,orderId);
        if (busy) this.fail(409,'shared_vehicle_busy');
      }
      return;
    }
    const policy=await this.lockPolicy();
    // A scope assessment may have committed while this request waited for the policy lock.
    req=await this.db.one('SELECT * FROM order_requirements WHERE order_id=? FOR SHARE',orderId);
    const {d,v,run}=await this.base(driverId,policy);
    const order=await this.db.one('SELECT * FROM orders WHERE id=?',orderId) ?? this.fail(404,'not_found');
    if (order.status!=='searching') this.fail(409,'already_taken');
    // WP12 precedence: a measured order_requirements row wins whenever it
    // exists; customer-declared scope is the reservation source only when no
    // measurement exists. An order with neither keeps the legacy inspection
    // gate — dimensions are never invented for unknown size.
    const declared=req ? null : await declaredScopeRow(this.db,orderId);
    if (!req && !declared) this.fail(409,'measured_requirements_missing');
    const tokens=(value: unknown): string[]=>Array.isArray(value) ? value as string[]
      : typeof value==='string' ? JSON.parse(value) as string[] : [];
    const eff: Row=req ? {...req} : (()=>{
      const pieces=Number(declared!.item_count ?? 1), grams=Number(declared!.mass_grams ?? 0);
      const hasDims=declared!.length_mm!=null;
      return { revision:Number(declared!.revision), grams, pieces,
        cm3:declared!.volume_cm3!=null ? Number(declared!.volume_cm3) : 0,
        // Freight crew rides in the vehicle: the existing seats check is the
        // crew-capacity check, in the existing error vocabulary.
        seats:order.service==='freight' ? Number(declared!.crew_count ?? 1) : 0,
        items:hasDims ? [{count:pieces,gramsEach:pieces>0 ? Math.ceil(grams/pieces) : grams,
          lengthMm:Number(declared!.length_mm),widthMm:Number(declared!.width_mm),heightMm:Number(declared!.height_mm)}] : [],
        // Freight access constraints are enforced as equipment needs.
        equipment:[...new Set([...tokens(declared!.equipment),...tokens(declared!.access_constraints)])].sort(),
        route_seconds:0, service_seconds:0,
        pickup_after:Number(declared!.pickup_promised_after ?? declared!.loading_after ?? 0),
        pickup_before:Number(declared!.pickup_promised_before ?? declared!.loading_before ?? 9007199254740991),
        dropoff_before:Number(declared!.dropoff_promised_before ?? declared!.pickup_promised_before ?? declared!.loading_before ?? 9007199254740991) };
    })();
    // Cargo measurements do not erase seats required for the declared load crew.
    if (order.service==='freight') eff.seats=Math.max(Number(eff.seats),Number((await declaredScopeRow(this.db,orderId))?.crew_count??0));
    if (order.service==='freight' && req && Number(eff.seats)>0
      && !await this.db.one('SELECT version FROM schema_migrations WHERE version=28')) this.fail(409,'measured_protocol_unavailable');
    if (expectedRequirementsRevision!==undefined && expectedRequirementsRevision!==eff.revision) this.fail(409,'requirements_changed');
    if (requested===1 && kind!=='offer_accept' && expectedRequirementsRevision===undefined) this.fail(409,'requirements_revision_required');
    if (kind==='offer') {
      if (order.recommended_price==null) this.fail(409,'fixed_price');
      const [min,max]=offerRange(order.recommended_price);
      if (!Number.isInteger(offeredPrice) || (offeredPrice as number)<min || (offeredPrice as number)>max) this.fail(400,'invalid_offer');
    }
    if (kind==='offer_accept') {
      const live=await this.db.one('SELECT created_at FROM order_offers WHERE order_id=? AND driver_id=?',orderId,driverId);
      if (!live || live.created_at<=Date.now()-eligibilityDefaults.negotiatedOfferSeconds*1000) this.fail(409,'offer_expired');
      if (!oldOffer) this.fail(409,'measured_offer_required');
      if (oldOffer.vehicle_id!==v.id || oldOffer.vehicle_revision!==v.revision || oldOffer.driver_revision!==d.revision || oldOffer.policy_revision!==policy.revision
        || oldOffer.requirements_revision!==eff.revision || oldOffer.run_revision!==run.revision) this.fail(409,'eligibility_changed');
    }
    const hasDeclaredTable=!!(await this.db.one("SELECT to_regclass('order_declared_scope') AS t"))?.t;
    const loads=await this.db.all(hasDeclaredTable
      ? `SELECT r.*,o.service,q.items reserved_items,ds.length_mm declared_length_mm,ds.width_mm declared_width_mm,ds.height_mm declared_height_mm FROM capacity_reservations r JOIN orders o ON o.id=r.order_id
      LEFT JOIN order_requirements q ON q.order_id=r.order_id LEFT JOIN order_declared_scope ds ON ds.order_id=r.order_id
      WHERE r.vehicle_id=? AND o.status IN ${active} AND o.driver_id=r.driver_id AND o.id<>?`
      : `SELECT r.*,o.service,q.items reserved_items FROM capacity_reservations r JOIN orders o ON o.id=r.order_id
      LEFT JOIN order_requirements q ON q.order_id=r.order_id
      WHERE r.vehicle_id=? AND o.status IN ${active} AND o.driver_id=r.driver_id AND o.id<>?`,v.id,orderId);
    const now=Date.now();
    if (loads.some(x=>x.planned_end<=now)) this.fail(409,'prior_run_overdue');
    if (loads.some(x=>x.service!=='parcel') || (order.service!=='parcel' && loads.length)) this.fail(409,'shared_vehicle_busy');
    if (loads.length>=200 || loads.reduce((s,x)=>s+x.pieces,eff.pieces)>Math.min(200,v.max_pieces)) this.fail(409,'piece_capacity_exceeded');
    if (loads.reduce((s,x)=>s+x.grams,eff.grams)>v.usable_grams || loads.reduce((s,x)=>s+x.cm3,eff.cm3)>v.usable_cm3) this.fail(409,'measured_capacity_exceeded');
    if (eff.seats>v.seats) this.fail(409,'seats_unavailable');
    if (eff.equipment.some((x:string)=>!v.equipment.includes(x))) this.fail(409,'equipment_unavailable');
    // Deliberately conservative packing certificate: fixed axes, every piece occupies its own
    // longitudinal slice, full width/height. Summed volume or sorted dimensions is NOT packing proof.
    const allItems=[...eff.items];
    for (const l of loads) {
      if (Array.isArray(l.reserved_items)) { allItems.push(...l.reserved_items); continue; }
      if (l.declared_length_mm!=null) { allItems.push({count:Number(l.pieces),gramsEach:0,lengthMm:Number(l.declared_length_mm),widthMm:Number(l.declared_width_mm),heightMm:Number(l.declared_height_mm)}); continue; }
      this.fail(409,'measured_requirements_missing');
    }
    if (allItems.some(x=>x.widthMm>v.width_mm || x.heightMm>v.height_mm || x.lengthMm>v.length_mm)
      || allItems.reduce((s,x)=>s+x.lengthMm*x.count,0)>v.length_mm) this.fail(409,'dimensions_unavailable');
    const start=Math.max(now,...loads.map(x=>x.planned_end));
    const approach=await this.approach(order,eff,v,run,loads,start,now);
    const pickup=Math.max(start+approach,eff.pickup_after), end=pickup+(eff.route_seconds+2*eff.service_seconds)*1000;
    // Declared scope carries no route duration, so the reservation horizon is
    // the pickup instant itself (chaining further pickups from there), while
    // the promised dropoff bound above is still enforced as contract data. A
    // declared order without any promised bound cannot be reserved at all.
    const plannedEnd=req ? end : pickup;
    if (pickup+eff.service_seconds*1000>eff.pickup_before || plannedEnd>eff.dropoff_before
      || (!req && eff.dropoff_before>=9007199254740991)) this.fail(409,'stop_window_infeasible');
    if (d.valid_until<=plannedEnd || v.valid_until<=plannedEnd) this.fail(409,'eligibility_expires_before_finish');
    if (!(await this.checked('driver_license',driverId,v,'',plannedEnd))) this.fail(409,'driver_document_invalid');
    for (const check of ['vehicle_registration','vehicle_inspection']) if (!(await this.checked(check,driverId,v,'',plannedEnd))) this.fail(409,'vehicle_document_invalid');
    if (req) await this.coverage(order,req,v,driverId,plannedEnd);
    else await this.coverageDeclared(order,v,driverId,plannedEnd);
    if (kind==='offer') {
      await this.db.run(`INSERT INTO eligibility_offers(order_id,driver_id,vehicle_id,vehicle_revision,driver_revision,policy_revision,requirements_revision,run_revision,created_at)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(order_id,driver_id) DO UPDATE SET vehicle_id=excluded.vehicle_id,vehicle_revision=excluded.vehicle_revision,
        driver_revision=excluded.driver_revision,policy_revision=excluded.policy_revision,requirements_revision=excluded.requirements_revision,run_revision=excluded.run_revision,created_at=excluded.created_at`,
        orderId,driverId,v.id,v.revision,d.revision,policy.revision,eff.revision,run.revision,Date.now());
    } else {
      await this.db.run('UPDATE vehicle_runs SET revision=revision+1 WHERE vehicle_id=?',v.id);
      await this.db.run(`INSERT INTO capacity_reservations(order_id,vehicle_id,driver_id,vehicle_revision,driver_revision,policy_revision,requirements_revision,run_revision,grams,cm3,pieces,seats,service,planned_end,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET vehicle_id=excluded.vehicle_id,driver_id=excluded.driver_id,vehicle_revision=excluded.vehicle_revision,
        driver_revision=excluded.driver_revision,policy_revision=excluded.policy_revision,requirements_revision=excluded.requirements_revision,run_revision=excluded.run_revision,
        grams=excluded.grams,cm3=excluded.cm3,pieces=excluded.pieces,seats=excluded.seats,service=excluded.service,planned_end=excluded.planned_end,created_at=excluded.created_at,evidence_kind='new_acceptance'`,
        orderId,v.id,driverId,v.revision,d.revision,policy.revision,eff.revision,run.revision+1,eff.grams,eff.cm3,eff.pieces,eff.seats,order.service,plannedEnd,Date.now());
      await this.db.run('DELETE FROM capacity_stops WHERE order_id=?',orderId);
      for (const position of [0,1]) await this.db.run(`INSERT INTO capacity_stops(order_id,position,kind,not_before,not_after,service_seconds,grams_delta,cm3_delta,pieces_delta) VALUES(?,?,?,?,?,?,?,?,?)`,
        orderId,position,position?'dropoff':'pickup',position?pickup:eff.pickup_after,position?eff.dropoff_before:eff.pickup_before,eff.service_seconds,
        (position?-1:1)*eff.grams,(position?-1:1)*eff.cm3,(position?-1:1)*eff.pieces);
    }
  }
}

export function registerEligibilityRoutes(route: Register, e: Eligibility) {
  const db=e.db, fail=e.fail;
  const admin=(user: Actor)=>{ if (user.role!=='admin') fail(403,'forbidden'); };
  const driver=(user: Actor)=>{ if (user.role!=='driver') fail(403,'forbidden'); };
  // HTTP's outer envelope commits intentional errors. Each configuration action owns a savepoint
  // so malformed evidence cannot leave a partial approval behind.
  const mutation=(fn:(ctx:Context)=>Promise<unknown>)=>async(ctx:Context)=>{
    admin(ctx.user);
    await e.available(); await db.exec('BEGIN IMMEDIATE');
    try { const result=await fn(ctx); await db.exec('COMMIT'); return result; }
    catch(error) { await db.exec('ROLLBACK'); throw error; }
  };
  route('GET','/api/driver/eligibility',async({user})=>{
    driver(user);
    if (!(await measuredCapability(db))) return {available:false,activated:false,reason:'measured_protocol_unavailable',defaults:eligibilityDefaults};
    const d=await db.one('SELECT * FROM driver_eligibility WHERE driver_id=?',user.id);
    const v=d ? await db.one('SELECT * FROM vehicles WHERE id=?',d.vehicle_id) : null;
    return {available:true,policy:await db.one('SELECT revision,activated FROM eligibility_policy WHERE id=1'),driver:d??null,vehicle:v,defaults:eligibilityDefaults};
  });
  route('POST','/api/driver/eligibility/activate',async({user,body})=>{
    driver(user); e.fields(body,['vehicleId','expectedRevision']);
    const p=await e.lockPolicy(), d=await db.one('SELECT * FROM driver_eligibility WHERE driver_id=? FOR UPDATE',user.id);
    if (!d || d.vehicle_id!==e.int(body.vehicleId,1) || d.revision!==e.int(body.expectedRevision,1)) fail(409,'eligibility_changed');
    await e.base(user.id,p,false);
    if (!d!.enrolled) { await db.run('UPDATE driver_eligibility SET enrolled=1,revision=revision+1 WHERE driver_id=?',user.id); await e.audit(user.id,'cohort_activated',user.id,'Driver opted into measured eligibility protocol'); }
    return {activated:true,driver:await db.one('SELECT * FROM driver_eligibility WHERE driver_id=?',user.id)};
  });
  route('GET','/api/admin/eligibility',async({user})=>{
    admin(user); await e.available();
    return {policy:await db.one('SELECT * FROM eligibility_policy WHERE id=1'),defaults:eligibilityDefaults,
      areas:await db.all('SELECT id,area_key,version,state,services,vehicle_classes,required_permits,valid_from,valid_until,ST_AsGeoJSON(geometry)::jsonb geometry FROM service_areas ORDER BY id DESC LIMIT 200'),
      routes:await db.all('SELECT id,route_key,version,from_area_id,to_area_id,state,services,vehicle_classes,required_permits,valid_from,valid_until FROM route_permissions ORDER BY id DESC LIMIT 200'),
      vehicles:await db.all('SELECT * FROM vehicles ORDER BY id DESC LIMIT 200'),drivers:await db.all('SELECT * FROM driver_eligibility ORDER BY driver_id DESC LIMIT 200'),
      checks:await db.all('SELECT * FROM verification_checks ORDER BY id DESC LIMIT 200')};
  });
  route('POST','/api/admin/eligibility',mutation(async({user,body})=>{
    admin(user); e.fields(body,['expectedRevision','activated','reason','evidenceRef']);
    const p=await e.lockPolicy(); if (p.revision!==e.int(body.expectedRevision,1)) fail(409,'eligibility_changed');
    if (typeof body.activated!=='boolean') fail(400,'invalid_input');
    const reason=e.reason(body),ref=e.ref(body);
    if (body.activated && !await db.one("SELECT id FROM route_permissions WHERE state='approved' AND valid_from<=? AND valid_until>? LIMIT 1",Date.now(),Date.now())) fail(409,'coverage_evidence_missing');
    await db.run('UPDATE eligibility_policy SET revision=revision+1,activated=?,evidence_ref=?,reviewer_id=?,reason=?,reviewed_at=? WHERE id=1',body.activated?1:0,ref,user.id,reason,Date.now());
    await e.audit(user.id,'policy_reviewed',1,reason,ref); return await db.one('SELECT * FROM eligibility_policy WHERE id=1');
  }));
  const areaFields=['key','state','services','vehicleClasses','requiredPermits','validFrom','validUntil','geometry','reason','evidenceRef'];
  route('POST','/api/admin/eligibility/areas',mutation(async({user,body})=>{
    admin(user); e.fields(body,areaFields); await e.lockPolicy();
    const key=e.str(body.key,64),state=e.choice(body.state,['approved','suspended']),ss=e.list(body.services,services),vc=e.list(body.vehicleClasses,classes),permits=e.list(body.requiredPermits);
    if (!ss.length || !vc.length) fail(400,'invalid_input');
    const {from,until}=e.validity(body),geometry=await e.geometry(body.geometry),reason=e.reason(body),ref=e.ref(body);
    const version=(await db.one('SELECT COALESCE(MAX(version),0)+1 n FROM service_areas WHERE area_key=?',key))!.n;
    const r=await db.one(`INSERT INTO service_areas(area_key,version,state,services,vehicle_classes,required_permits,valid_from,valid_until,geometry,reviewer_id,evidence_ref,reason,created_at)
      VALUES(?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(?),4326)),?,?,?,?) RETURNING id,version`,key,version,state,JSON.stringify(ss),JSON.stringify(vc),JSON.stringify(permits),from,until,geometry,user.id,ref,reason,Date.now());
    await db.run('UPDATE eligibility_policy SET revision=revision+1,activated=0 WHERE id=1'); await e.audit(user.id,'area_version_created',r!.id,reason,ref); return r;
  }));
  route('POST','/api/admin/eligibility/routes',mutation(async({user,body})=>{
    admin(user); e.fields(body,[...areaFields.filter(x=>x!=='geometry'),'fromAreaId','toAreaId','corridor']); await e.lockPolicy();
    const key=e.str(body.key,64),state=e.choice(body.state,['approved','suspended']),ss=e.list(body.services,services),vc=e.list(body.vehicleClasses,classes),permits=e.list(body.requiredPermits);
    const fromId=e.int(body.fromAreaId,1),toId=e.int(body.toAreaId,1);
    if (!ss.length || !vc.length || !await db.one('SELECT a.id FROM service_areas a JOIN service_areas b ON b.id=? WHERE a.id=?',toId,fromId)) fail(400,'invalid_input');
    const {from,until}=e.validity(body),corridor=await e.geometry(body.corridor),reason=e.reason(body),ref=e.ref(body);
    const version=(await db.one('SELECT COALESCE(MAX(version),0)+1 n FROM route_permissions WHERE route_key=?',key))!.n;
    const r=await db.one(`INSERT INTO route_permissions(route_key,version,from_area_id,to_area_id,state,services,vehicle_classes,required_permits,valid_from,valid_until,corridor,reviewer_id,evidence_ref,reason,created_at)
      VALUES(?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(?),4326)),?,?,?,?) RETURNING id,version`,key,version,fromId,toId,state,JSON.stringify(ss),JSON.stringify(vc),JSON.stringify(permits),from,until,corridor,user.id,ref,reason,Date.now());
    await db.run('UPDATE eligibility_policy SET revision=revision+1,activated=0 WHERE id=1'); await e.audit(user.id,'route_version_created',r!.id,reason,ref); return r;
  }));
  const vehicleFields=['plate','class','state','seats','usableGrams','usableCm3','lengthMm','widthMm','heightMm','maxPieces','equipment','validUntil','reason','evidenceRef','expectedRevision'];
  const vehicleValues=(body:Row)=>[e.str(body.plate,24),e.choice(body.class,classes),e.choice(body.state,states),e.int(body.seats,0,100),e.int(body.usableGrams),e.int(body.usableCm3),
    e.int(body.lengthMm,0,100000),e.int(body.widthMm,0,100000),e.int(body.heightMm,0,100000),e.int(body.maxPieces,1,200),JSON.stringify(e.list(body.equipment)),e.int(body.validUntil,1,Number.MAX_SAFE_INTEGER)];
  route('POST','/api/admin/eligibility/vehicles',mutation(async({user,body})=>{
    admin(user); e.fields(body,vehicleFields.filter(x=>x!=='expectedRevision')); await e.lockPolicy(); const values=vehicleValues(body),reason=e.reason(body),ref=e.ref(body);
    if (await db.one('SELECT id FROM vehicles WHERE plate=?',values[0])) fail(409,'plate_in_use');
    const r=await db.one(`INSERT INTO vehicles(plate,class,state,seats,usable_grams,usable_cm3,length_mm,width_mm,height_mm,max_pieces,equipment,valid_until,reviewer_id,evidence_ref,reason,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?,?,?,?) RETURNING *`,...values,user.id,ref,reason,Date.now());
    await db.run('INSERT INTO vehicle_runs(vehicle_id) VALUES(?)',r!.id); await e.audit(user.id,'vehicle_created',r!.id,reason,ref); return r;
  }));
  route('PATCH','/api/admin/eligibility/vehicles/:id',mutation(async({user,body,params})=>{
    admin(user); e.fields(body,vehicleFields); await e.lockPolicy(); const id=e.int(Number(params[0]),1),old=await db.one('SELECT * FROM vehicles WHERE id=? FOR UPDATE',id)??fail(404,'not_found');
    if (old.revision!==e.int(body.expectedRevision,1)) fail(409,'eligibility_changed');
    const values=vehicleValues(body),reason=e.reason(body),ref=e.ref(body);
    if (await db.one('SELECT id FROM vehicles WHERE plate=? AND id<>?',values[0],id)) fail(409,'plate_in_use');
    await db.run(`UPDATE vehicles SET plate=?,class=?,state=?,seats=?,usable_grams=?,usable_cm3=?,length_mm=?,width_mm=?,height_mm=?,max_pieces=?,equipment=?::jsonb,valid_until=?,
      reviewer_id=?,evidence_ref=?,reason=?,updated_at=?,revision=revision+1 WHERE id=?`,...values,user.id,ref,reason,Date.now(),id);
    // An edit never certifies a retained unknown load or releases existing reservations.
    await db.run('UPDATE vehicle_runs SET revision=revision+1 WHERE vehicle_id=?',id); await e.audit(user.id,'vehicle_revised',id,reason,ref); return await db.one('SELECT * FROM vehicles WHERE id=?',id);
  }));
  route('POST','/api/admin/eligibility/drivers/:id',mutation(async({user,body,params})=>{
    admin(user); e.fields(body,['vehicleId','state','validUntil','expectedRevision','reason','evidenceRef']); await e.lockPolicy();
    const id=e.int(Number(params[0]),1),vehicleId=e.int(body.vehicleId,1),state=e.choice(body.state,states),until=e.int(body.validUntil,1,Number.MAX_SAFE_INTEGER),reason=e.reason(body),ref=e.ref(body);
    const target=await db.one('SELECT * FROM users WHERE id=? FOR UPDATE',id); if (target?.role!=='driver') fail(404,'not_found');
    if (!await db.one('SELECT id FROM vehicles WHERE id=? FOR UPDATE',vehicleId)) fail(404,'not_found');
    const old=await db.one('SELECT * FROM driver_eligibility WHERE driver_id=?',id);
    if ((old?.revision??0)!==e.int(body.expectedRevision)) fail(409,'eligibility_changed');
    if (old && old.vehicle_id!==vehicleId && await db.one(`SELECT id FROM orders WHERE driver_id=? AND status IN ${active} LIMIT 1`,id)) fail(409,'active_vehicle_custody');
    await db.run(`INSERT INTO driver_vehicles(driver_id,vehicle_id,reviewer_id,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING`,id,vehicleId,user.id,reason,Date.now());
    await db.run(`INSERT INTO driver_eligibility(driver_id,vehicle_id,state,valid_until,reviewer_id,evidence_ref,reason,updated_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(driver_id) DO UPDATE SET vehicle_id=excluded.vehicle_id,state=excluded.state,valid_until=excluded.valid_until,reviewer_id=excluded.reviewer_id,
      evidence_ref=excluded.evidence_ref,reason=excluded.reason,updated_at=excluded.updated_at,revision=driver_eligibility.revision+1`,id,vehicleId,state,until,user.id,ref,reason,Date.now());
    if (await e.unknown(vehicleId)) await e.markInspection(vehicleId,user.id);
    await e.audit(user.id,'driver_reviewed',id,reason,ref); return await db.one('SELECT * FROM driver_eligibility WHERE driver_id=?',id);
  }));
  route('POST','/api/admin/eligibility/checks',mutation(async({user,body})=>{
    admin(user); e.fields(body,['driverId','vehicleId','kind','permitKey','outcome','validFrom','validUntil','method','issuer','reason','evidenceRef']); await e.lockPolicy();
    const hasDriver=body.driverId!==undefined,hasVehicle=body.vehicleId!==undefined;
    if (hasDriver===hasVehicle) fail(400,'invalid_input');
    const id=e.int(hasDriver?body.driverId:body.vehicleId,1),kind=e.choice(body.kind,['driver_license','vehicle_registration','vehicle_inspection','permit']);
    if ((kind==='driver_license' && !hasDriver) || (['vehicle_registration','vehicle_inspection'].includes(kind) && !hasVehicle)) fail(400,'invalid_input');
    const target=await db.one(hasDriver?"SELECT id FROM users WHERE id=? AND role='driver'":'SELECT id,revision FROM vehicles WHERE id=? FOR UPDATE',id)??fail(404,'not_found');
    const outcome=e.choice(body.outcome,['approved','rejected','invalid','suspended']),method=e.choice(body.method,['manual_in_person','operator_registry']),issuer=e.str(body.issuer,120),reason=e.reason(body),ref=e.ref(body),{from,until}=e.validity(body);
    const key=kind==='permit'?e.list([body.permitKey])[0]:'';
    if (kind!=='permit' && body.permitKey!==undefined) fail(400,'invalid_input');
    const r=await db.one(`INSERT INTO verification_checks(driver_id,vehicle_id,vehicle_revision,kind,permit_key,outcome,valid_from,expires_at,method,issuer,evidence_ref,reviewer_id,reason,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,hasDriver?id:null,hasVehicle?id:null,target.revision??null,kind,key,outcome,from,until,method,issuer,ref,user.id,reason,Date.now());
    if (hasDriver) await db.run('UPDATE driver_eligibility SET revision=revision+1 WHERE driver_id=?',id);
    else {
      await db.run('UPDATE vehicle_runs SET revision=revision+1 WHERE vehicle_id=?',id);
      if (kind==='vehicle_inspection' && outcome==='approved' && !(await e.unknown(id))) await db.run('UPDATE vehicles SET inspection_required=0 WHERE id=?',id);
    }
    await e.audit(user.id,'verification_recorded',r!.id,reason,ref); return r;
  }));
  route('POST','/api/admin/eligibility/orders/:id',mutation(async({user,body,params})=>{
    if (body.approach!==undefined) {
      e.fields(body,['expectedRevision','approach','reason','evidenceRef']); await e.lockPolicy();
      const id=e.int(Number(params[0]),1),order=await db.one('SELECT * FROM orders WHERE id=? FOR UPDATE',id)??fail(404,'not_found');
      if (order.status!=='searching') fail(409,'order_changed');
      // Approach evidence binds to the effective scope revision: measured
      // when present, otherwise the WP12 declared revision.
      const measuredReq=await db.one('SELECT * FROM order_requirements WHERE order_id=?',id);
      const declaredReq=measuredReq ? null : await declaredScopeRow(db,id);
      const req=(measuredReq ?? (declaredReq ? { revision: declaredReq.revision } : null)) as Row | null;
      if (!req) fail(409,'measured_requirements_missing');
      if (e.int(body.expectedRevision,1)!==req!.revision) fail(409,'requirements_changed');
      const a=body.approach;
      if (!a || typeof a!=='object' || Array.isArray(a)) fail(400,'invalid_input');
      e.fields(a,['vehicleId','expectedVehicleRevision','expectedRunRevision','from','to','seconds','observedAt','validUntil','method']);
      e.choice(a.method,['operator_attested']);
      const v=await db.one('SELECT * FROM vehicles WHERE id=? FOR UPDATE',e.int(a.vehicleId,1))??fail(404,'not_found');
      await db.run('INSERT INTO vehicle_runs(vehicle_id) VALUES(?) ON CONFLICT DO NOTHING',v.id);
      const run=(await db.one('SELECT * FROM vehicle_runs WHERE vehicle_id=? FOR UPDATE',v.id))!;
      if (e.int(a.expectedVehicleRevision,1)!==v.revision || e.int(a.expectedRunRevision)!==run.revision) fail(409,'approach_evidence_changed');
      const from=e.point(a.from),to=e.point(a.to),seconds=e.int(a.seconds,1,86400),now=Date.now();
      const observed=e.int(a.observedAt,0,Number.MAX_SAFE_INTEGER),until=e.int(a.validUntil,1,Number.MAX_SAFE_INTEGER);
      if (observed>now || observed<now-300000 || until<=now || until>observed+86400000) fail(400,'invalid_approach_validity');
      const reason=e.reason(body),ref=e.ref(body);
      const leg=await db.one(`INSERT INTO order_approaches(order_id,requirements_revision,vehicle_id,vehicle_revision,run_revision,from_lng,from_lat,to_lng,to_lat,seconds,observed_at,valid_until,method,reviewer_id,evidence_ref,reason,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,id,req!.revision,v.id,v.revision,run.revision,from.longitude,from.latitude,to.longitude,to.latitude,seconds,observed,until,a.method,user.id,ref,reason,now);
      const loads=await db.all(`SELECT r.* FROM capacity_reservations r JOIN orders o ON o.id=r.order_id WHERE r.vehicle_id=? AND o.status IN ${active}`,v.id);
      if (loads.some(x=>x.planned_end<=now)) fail(409,'prior_run_overdue');
      await e.approach(order,req!,v,run,loads,Math.max(now,...loads.map(x=>x.planned_end)),now);
      await e.audit(user.id,'approach_attested',leg!.id,reason,ref);
      return {approachId:leg!.id,orderId:id,requirementsRevision:req!.revision,vehicleId:v.id,vehicleRevision:v.revision,runRevision:run.revision,method:a.method,seconds,observedAt:observed,validUntil:until};
    }
    admin(user); e.fields(body,['expectedRevision','items','seats','equipment','rotationPolicy','route','routeSeconds','serviceSeconds','pickupAfter','pickupBefore','dropoffBefore','reason','evidenceRef']);
    const id=e.int(Number(params[0]),1),order=await db.one('SELECT * FROM orders WHERE id=? FOR UPDATE',id)??fail(404,'not_found'); await e.lockPolicy();
    if (!['searching','assigned','at_pickup','in_transit','on_hold','returning'].includes(order.status)) fail(409,'order_changed');
    // Accepted requirements are immutable except the one-time inspection of previously unknown
    // legacy custody. Recording it is accounting, never retroactive legal/approval authority.
    if (order.status!=='searching' && await db.one('SELECT order_id FROM capacity_reservations WHERE order_id=?',id)) fail(409,'accepted_requirements_immutable');
    const old=await db.one('SELECT revision FROM order_requirements WHERE order_id=?',id);
    if ((old?.revision??0)!==e.int(body.expectedRevision)) fail(409,'eligibility_changed');
    if (!Array.isArray(body.items) || body.items.length>200) fail(400,'invalid_input');
    let grams=0,cm3=0,pieces=0;
    const items=body.items.map((item:Row)=>{
      if (!item || typeof item!=='object' || Array.isArray(item)) fail(400,'invalid_input');
      e.fields(item,['count','gramsEach','lengthMm','widthMm','heightMm']);
      const count=e.int(item.count,1,200),gramsEach=e.int(item.gramsEach,1),lengthMm=e.int(item.lengthMm,1,100000),widthMm=e.int(item.widthMm,1,100000),heightMm=e.int(item.heightMm,1,100000);
      grams+=count*gramsEach; cm3+=count*Math.ceil(lengthMm*widthMm*heightMm/1000); pieces+=count;
      return {count,gramsEach,lengthMm,widthMm,heightMm};
    });
    e.int(grams); e.int(cm3); e.int(pieces,0,200);
    const seats=e.int(body.seats,0,100);
    const crew=order.service==='freight'?Number((await declaredScopeRow(db,id))?.crew_count??0):0;
    if (order.service==='freight' && seats>0 && !await db.one('SELECT version FROM schema_migrations WHERE version=28')) fail(409,'measured_protocol_unavailable');
    if ((order.service==='ride' && (seats<Number(order.option) || seats<1 || pieces>0))
      || (order.service==='parcel' && (seats!==0 || pieces<1))
      || (order.service==='freight' && (seats<crew || pieces<1))) fail(400,'invalid_input');
    e.choice(body.rotationPolicy,['fixed_axes_no_stacking']);
    const equipment=e.list(body.equipment),routeGeometry=await e.geometry(body.route,true),seconds=e.int(body.routeSeconds,1,86400),serviceSeconds=e.int(body.serviceSeconds,0,86400);
    const after=e.int(body.pickupAfter,0,Number.MAX_SAFE_INTEGER),before=e.int(body.pickupBefore,1,Number.MAX_SAFE_INTEGER),end=e.int(body.dropoffBefore,1,Number.MAX_SAFE_INTEGER),reason=e.reason(body),ref=e.ref(body);
    if (after>before || before>end) fail(400,'invalid_input');
    const endpoints=await db.one(`SELECT ST_Equals(ST_StartPoint(g),ST_SetSRID(ST_MakePoint(?,?),4326)) a,ST_Equals(ST_EndPoint(g),ST_SetSRID(ST_MakePoint(?,?),4326)) b FROM (SELECT ST_GeomFromGeoJSON(?) g) q`,order.pickup_lng,order.pickup_lat,order.dropoff_lng,order.dropoff_lat,routeGeometry);
    if (!endpoints?.a || !endpoints.b) fail(409,'route_endpoint_mismatch');
    await db.run(`INSERT INTO order_requirements(order_id,grams,cm3,pieces,seats,items,equipment,rotation_policy,route,route_seconds,service_seconds,pickup_after,pickup_before,dropoff_before,reviewer_id,evidence_ref,reason,created_at)
      VALUES(?,?,?,?,?,?::jsonb,?::jsonb,?,ST_SetSRID(ST_GeomFromGeoJSON(?),4326),?,?,?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET
      grams=excluded.grams,cm3=excluded.cm3,pieces=excluded.pieces,seats=excluded.seats,items=excluded.items,equipment=excluded.equipment,rotation_policy=excluded.rotation_policy,route=excluded.route,
      route_seconds=excluded.route_seconds,service_seconds=excluded.service_seconds,pickup_after=excluded.pickup_after,pickup_before=excluded.pickup_before,dropoff_before=excluded.dropoff_before,
      reviewer_id=excluded.reviewer_id,evidence_ref=excluded.evidence_ref,reason=excluded.reason,created_at=excluded.created_at,revision=order_requirements.revision+1`,
      id,grams,cm3,pieces,seats,JSON.stringify(items),JSON.stringify(equipment),body.rotationPolicy,routeGeometry,seconds,serviceSeconds,after,before,end,user.id,ref,reason,Date.now());
    if (order.status!=='searching') {
      const d=await db.one('SELECT * FROM driver_eligibility WHERE driver_id=? FOR UPDATE',order.driver_id)??fail(409,'vehicle_link_required');
      const v=(await db.one('SELECT * FROM vehicles WHERE id=? FOR UPDATE',d.vehicle_id))!;
      const p=(await db.one('SELECT revision FROM eligibility_policy WHERE id=1'))!;
      const run=(await db.one('UPDATE vehicle_runs SET revision=revision+1 WHERE vehicle_id=? RETURNING revision',v.id))!;
      await db.run(`INSERT INTO capacity_reservations(order_id,vehicle_id,driver_id,vehicle_revision,driver_revision,policy_revision,requirements_revision,run_revision,
        grams,cm3,pieces,seats,service,planned_end,created_at,evidence_kind) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'legacy_inspection')`,
        id,v.id,order.driver_id,v.revision,d.revision,p.revision,(old?.revision??0)+1,run.revision,grams,cm3,pieces,seats,order.service,end,Date.now());
      for (const position of [0,1]) await db.run(`INSERT INTO capacity_stops(order_id,position,kind,not_before,not_after,service_seconds,grams_delta,cm3_delta,pieces_delta) VALUES(?,?,?,?,?,?,?,?,?)`,
        id,position,position?'dropoff':'pickup',after,position?end:before,serviceSeconds,(position?-1:1)*grams,(position?-1:1)*cm3,(position?-1:1)*pieces);
      // A new independent vehicle-inspection check may clear this after every legacy item is measured.
      await db.run('UPDATE vehicles SET inspection_required=1 WHERE id=?',v.id);
    }
    await e.audit(user.id,'order_measured',id,reason,ref); return await db.one('SELECT order_id,revision,grams,cm3,pieces,seats FROM order_requirements WHERE order_id=?',id);
  }));
  route('POST','/api/admin/eligibility/orders/:id/recovery',mutation(async({user,body,params})=>{
    admin(user); e.fields(body,['action','reason','evidenceRef','expectedVersion']);
    const id=e.int(Number(params[0]),1),order=await db.one('SELECT * FROM orders WHERE id=? FOR UPDATE',id)??fail(404,'not_found'); await e.lockPolicy();
    if (e.int(body.expectedVersion,1)!==order.version) fail(409,'VERSION_CONFLICT');
    const reason=e.reason(body),ref=e.ref(body),action=e.choice(body.action,['hold','return','confirm_return']);
    if (!['in_transit','on_hold','returning'].includes(order.status)) fail(409,'custody_required');
    if (action==='hold') {
      if (order.status==='returning') fail(409,'cannot_resolve');
      await db.run("UPDATE orders SET status='on_hold',exception_reason='support',updated_at=? WHERE id=?",Date.now(),id);
    } else if (action==='return') {
      if (order.status!=='returning') {
        await db.run("UPDATE orders SET status='returning',return_code=?,updated_at=? WHERE id=?",String(randomInt(1000,10000)),Date.now(),id);
        await db.run('DELETE FROM proof_attempts WHERE order_id=?',id);
      }
    } else {
      if (order.status!=='returning') fail(409,'cannot_resolve');
      await db.run("UPDATE orders SET status='returned',completed_at=?,updated_at=? WHERE id=?",Date.now(),Date.now(),id);
    }
    await db.run("INSERT INTO security_events(actor_id,order_id,action,detail,created_at) VALUES(?,?,'ELIGIBILITY_CUSTODY_RECOVERY',?,?)",user.id,id,JSON.stringify({action,reason,evidenceRef:ref}),Date.now());
    await e.audit(user.id,`custody_${action}`,id,reason,ref); return await db.one('SELECT id,status,driver_id,version FROM orders WHERE id=?',id);
  }));
}
