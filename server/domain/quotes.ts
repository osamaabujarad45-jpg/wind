import { createHash, randomUUID } from 'node:crypto';
import type { Persistence, Row } from '../db/persistence.ts';
import { evaluateRoutingEvidence, type EvidenceQuality, type RevisionMetadata, type DirectedCrossing } from './routing-policy.ts';
import type { DeclaredScopeInput } from './resource-scope.ts';

const QUOTE_TTL_MS = 120_000;

export async function quotesAvailable(db: Persistence): Promise<boolean> {
  if (db.backend !== 'postgres') return false;
  const table = await db.one("SELECT to_regclass('quotes') AS q, to_regclass('road_restrictions') AS r");
  if (!table?.q || !table.r) return false;
  const migration = await db.one('SELECT version FROM schema_migrations WHERE version=11');
  return !!migration;
}

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}

export function tariffVersionFor(settings: Record<string, unknown>): string {
  const hash = createHash('sha256').update(JSON.stringify(canonical(settings))).digest('hex');
  return hash.slice(0, 16);
}

export function tariffBasisPoints(settings: Record<string, unknown>): Record<string, number> {
  const bps: Record<string, number> = {};
  for (const key of ['commission','proCommission','plusDiscount','sharedDiscount','nightExtra']) {
    const value = settings[key];
    if (typeof value === 'number' && Number.isFinite(value)) bps[key] = Math.round(value * 10000);
  }
  return bps;
}

export function itineraryHash(body: Row): string {
  const itinerary = {
    service: body.service,
    pickupCity: body.pickupCity,
    dropoffCity: body.dropoffCity,
    pickupPoint: body.pickupPoint ?? null,
    dropoffPoint: body.dropoffPoint ?? null,
    pickupNote: body.pickupNote ?? '',
    dropoffNote: body.dropoffNote ?? '',
    option: body.option,
    loadingHelp: !!body.loadingHelp,
    shared: !!body.shared,
    scheduledFor: body.scheduledFor ?? null,
    detail: body.detail ?? '',
    contact: body.contact ?? '',
    pickupContact: body.pickupContact ?? null,
    recipientName: body.recipientName ?? '',
    recipientPhone: body.recipientPhone ?? null,
  };
  return createHash('sha256').update(JSON.stringify(canonical(itinerary))).digest('hex');
}

export function minorUnits(ils: number): number {
  if (!Number.isFinite(ils) || ils < 0) throw new RangeError('invalid ILS amount');
  const minor = Math.round(ils * 100);
  if (!Number.isSafeInteger(minor) || minor < 1 || minor > Number.MAX_SAFE_INTEGER) throw new RangeError('unsafe minor amount');
  return minor;
}

function linesFor(priceMinor: number, tariffBps: Record<string, number>): Row[] {
  return [{ kind: 'transport', amountMinor: priceMinor, currency: 'ILS', description: 'fare', basisPoints: tariffBps }];
}

async function restrictionRevision(db: Persistence): Promise<string | null> {
  try {
    const row = await db.one('SELECT MAX(version)::text AS v FROM road_restrictions');
    return row?.v ?? null;
  } catch { return null; }
}

async function buildCrossings(db: Persistence, service: string, routeLine: [number, number][] | null, fallback: { pickup: { latitude: number; longitude: number } | null; dropoff: { latitude: number; longitude: number } | null }): Promise<DirectedCrossing[]> {
  let line = routeLine;
  if (!line || line.length < 2) {
    if (!fallback.pickup || !fallback.dropoff) return [];
    line = [[fallback.pickup.longitude, fallback.pickup.latitude], [fallback.dropoff.longitude, fallback.dropoff.latitude]];
  }
  const now = Date.now();
  try {
    // Genuine directed crossings only: latest version per restriction key, currently valid,
    // whose geometry intersects the candidate route (OSRM line, else the straight pickup-dropoff line).
    // A restriction that is merely nearby (within 200 m, not intersecting) is recorded as an
    // unresolved crossing (uncertain), never as a confirmed prohibition.
    const geojson = JSON.stringify({ type: 'LineString', coordinates: line });
    const start = line[0]!, end = line[line.length - 1]!;
    const rows: Row[] = await db.all(
      `SELECT restriction_key, state, confirmed_prohibition, direction AS restriction_direction, vehicle_classes,
         ST_Intersects(geometry, route_geom) AS intersects_route,
         (ST_LineLocatePoint(geometry, start_geom) <= ST_LineLocatePoint(geometry, end_geom)) AS forward_match
       FROM (
         SELECT DISTINCT ON (restriction_key) restriction_key, state, confirmed_prohibition, direction, vehicle_classes, geometry,
           ST_SetSRID(ST_GeomFromGeoJSON(?),4326) AS route_geom,
           ST_SetSRID(ST_Point(?,?),4326) AS start_geom,
           ST_SetSRID(ST_Point(?,?),4326) AS end_geom
         FROM road_restrictions
         WHERE services @> ?::jsonb AND valid_from <= ? AND valid_until > ?
         ORDER BY restriction_key, version DESC
       ) latest
       WHERE ST_Intersects(geometry, route_geom) OR ST_DWithin(geometry::geography, route_geom::geography, 200)`,
      geojson, start[0], start[1], end[0], end[1], JSON.stringify([service]), now, now
    );
    return rows.map(r => {
      const classes = Array.isArray(r.vehicle_classes) ? r.vehicle_classes
        : typeof r.vehicle_classes === 'string' ? JSON.parse(r.vehicle_classes) as unknown : null;
      // The quote is issued before a driver/vehicle is assigned: a restriction scoped to
      // specific vehicle classes cannot be confirmed applicable, so it stays uncertain.
      const applicability = Array.isArray(classes) && classes.length === 0 ? 'applies' as const : 'unknown' as const;
      let direction: DirectedCrossing['direction'] = 'unknown';
      if (r.intersects_route) {
        if (r.restriction_direction === 'bidirectional') direction = 'crossed';
        else if (r.restriction_direction === 'forward') direction = r.forward_match ? 'crossed' : 'not_crossed';
        else if (r.restriction_direction === 'backward') direction = r.forward_match ? 'not_crossed' : 'crossed';
      }
      return {
        restrictionId: String(r.restriction_key),
        direction,
        applicability,
        status: (['closed', 'restricted'].includes(r.state) ? r.state : r.state === 'open' ? 'open' as const : 'unknown' as const),
        confirmedProhibition: r.confirmed_prohibition === true || r.confirmed_prohibition === 1,
      };
    });
  } catch {
    // If PostGIS query fails, treat as uncertain (no fabricated crossing)
    return [{ restrictionId: 'query_failed', direction: 'unknown' as const, applicability: 'unknown' as const, status: 'unknown' as const, confirmedProhibition: false }];
  }
}

export type QuoteInput = {
  customerId: number;
  service: string;
  pickupCity: string;
  dropoffCity: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  pickupNote: string;
  dropoffNote: string;
  contact: string;
  pickupContact: string | null;
  recipientName: string;
  recipientPhone: string | null;
  detail: string;
  option: string;
  loadingHelp: boolean;
  shared: boolean;
  scheduledFor: number | null;
  price: number;
  priceMinor: number;
  commissionMinor: number | null;
  km: number;
  minutes: number;
  estimated: boolean;
  tariffSnapshot: Record<string, unknown>;
  tariffBps: Record<string, number>;
  tariffVersion: string;
  declaredScope?: DeclaredScopeInput | null;
};

export async function evaluateQuoteFeasibility(db: Persistence, input: { service: string; routeLine: [number, number][] | null; estimated: boolean; pickup?: { latitude: number; longitude: number } | null; dropoff?: { latitude: number; longitude: number } | null }): Promise<{ verdict: ReturnType<typeof evaluateRoutingEvidence>; revisions: RevisionMetadata; provider: EvidenceQuality; graph: EvidenceQuality; restrictions: EvidenceQuality; crossings: DirectedCrossing[] }> {
  // No versioned OSRM graph/provider release identifier is exposed by the retained adapter,
  // so none is recorded: a URL or an invented label would fabricate revision evidence.
  const graphVersion = null;
  const providerVersion = null;
  const restrictionVersion = await restrictionRevision(db);
  // The OSRM driving profile genuinely produced the route only when a road route exists.
  const profileVersion = input.estimated ? null : 'driving';
  const revisions: RevisionMetadata = {
    graph: graphVersion,
    profile: profileVersion,
    restriction: restrictionVersion,
    provider: providerVersion,
  };
  const provider: EvidenceQuality = input.estimated ? 'missing' : 'complete';
  const graph: EvidenceQuality = input.estimated ? 'missing' : 'complete';
  // Complete restriction evidence requires explicit coverage of whole route; absent coverage is missing.
  // Until operator provides coverage attestation, treat as missing -> uncertain, never feasible.
  const restrictions: EvidenceQuality = 'missing';
  const crossings = await buildCrossings(db, input.service, input.routeLine, { pickup: input.pickup ?? null, dropoff: input.dropoff ?? null });
  const verdict = evaluateRoutingEvidence({ revisions, provider, graph, restrictions, crossings });
  return { verdict, revisions, provider, graph, restrictions, crossings };
}

export async function createQuoteRecord(db: Persistence, input: QuoteInput, feasibilityInfo: { verdict: ReturnType<typeof evaluateRoutingEvidence>; revisions: RevisionMetadata }): Promise<Row> {
  const id = randomUUID();
  const now = Date.now();
  const expiresAt = now + QUOTE_TTL_MS;
  const itineraryHashValue = itineraryHash({
    service: input.service,
    pickupCity: input.pickupCity,
    dropoffCity: input.dropoffCity,
    pickupPoint: input.pickupLat != null ? { latitude: input.pickupLat, longitude: input.pickupLng } : null,
    dropoffPoint: input.dropoffLat != null ? { latitude: input.dropoffLat, longitude: input.dropoffLng } : null,
    pickupNote: input.pickupNote,
    dropoffNote: input.dropoffNote,
    option: input.option,
    loadingHelp: input.loadingHelp,
    shared: input.shared,
    scheduledFor: input.scheduledFor,
    detail: input.detail,
    contact: input.contact,
    pickupContact: input.pickupContact,
    recipientName: input.recipientName,
    recipientPhone: input.recipientPhone,
  });
  const etaMinSeconds = Math.max(1, input.minutes) * 60;
  const etaMaxSeconds = etaMinSeconds + (feasibilityInfo.verdict.feasibility === 'uncertain' || input.estimated ? 900 : 300);
  const lines = linesFor(input.priceMinor, input.tariffBps);
  const reasons = feasibilityInfo.verdict.reasons;
  const disclosures: string[] = [];
  if (feasibilityInfo.verdict.feasibility === 'uncertain') disclosures.push('uncertain_routing');
  if (input.estimated) disclosures.push('estimated_route');
  if (feasibilityInfo.verdict.feasibility === 'feasible') disclosures.push('feasible_route');
  if (feasibilityInfo.verdict.feasibility === 'infeasible') disclosures.push('infeasible_route');
  disclosures.push(`provider:${feasibilityInfo.verdict.revisions.provider ?? 'missing'}`);
  const row: Row = {
    id,
    customer_id: input.customerId,
    service: input.service,
    pickup_city: input.pickupCity,
    dropoff_city: input.dropoffCity,
    pickup_lat: input.pickupLat,
    pickup_lng: input.pickupLng,
    dropoff_lat: input.dropoffLat,
    dropoff_lng: input.dropoffLng,
    pickup_note: input.pickupNote,
    dropoff_note: input.dropoffNote,
    contact: input.contact,
    pickup_contact: input.pickupContact,
    recipient_name: input.recipientName,
    recipient_phone: input.recipientPhone,
    detail: input.detail,
    option: input.option,
    loading_help: input.loadingHelp ? 1 : 0,
    shared: input.shared ? 1 : 0,
    scheduled_for: input.scheduledFor,
    currency: 'ILS',
    price_minor: input.priceMinor,
    discount_minor: null,
    commission_minor: input.commissionMinor,
    tariff_snapshot: JSON.stringify(input.tariffSnapshot),
    tariff_basis_points: JSON.stringify(input.tariffBps),
    tariff_version: input.tariffVersion,
    graph_version: feasibilityInfo.revisions.graph,
    profile_version: feasibilityInfo.revisions.profile,
    restriction_version: feasibilityInfo.revisions.restriction,
    provider_version: feasibilityInfo.revisions.provider,
    eta_min_seconds: etaMinSeconds,
    eta_max_seconds: etaMaxSeconds,
    feasibility: feasibilityInfo.verdict.feasibility,
    reasons: JSON.stringify(reasons),
    disclosures: JSON.stringify(disclosures),
    lines: JSON.stringify(lines),
    itinerary_hash: itineraryHashValue,
    expires_at: expiresAt,
    created_at: now,
    declared_scope: input.declaredScope ? JSON.stringify(input.declaredScope) : null,
  };
  await db.run(
    `INSERT INTO quotes (id, customer_id, service, pickup_city, dropoff_city, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
      pickup_note, dropoff_note, contact, pickup_contact, recipient_name, recipient_phone, detail, option, loading_help, shared, scheduled_for,
      currency, price_minor, discount_minor, commission_minor, tariff_snapshot, tariff_basis_points, tariff_version,
      graph_version, profile_version, restriction_version, provider_version, eta_min_seconds, eta_max_seconds,
      feasibility, reasons, disclosures, lines, itinerary_hash, expires_at, created_at, declared_scope)
     VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ?, ?::jsonb)`,
    row.id, row.customer_id, row.service, row.pickup_city, row.dropoff_city, row.pickup_lat, row.pickup_lng, row.dropoff_lat, row.dropoff_lng,
    row.pickup_note, row.dropoff_note, row.contact, row.pickup_contact, row.recipient_name, row.recipient_phone, row.detail, row.option, row.loading_help, row.shared, row.scheduled_for,
    row.currency, row.price_minor, row.discount_minor, row.commission_minor, row.tariff_snapshot, row.tariff_basis_points, row.tariff_version,
    row.graph_version, row.profile_version, row.restriction_version, row.provider_version, row.eta_min_seconds, row.eta_max_seconds,
    row.feasibility, row.reasons, row.disclosures, row.lines, row.itinerary_hash, row.expires_at, row.created_at, row.declared_scope
  );
  return row;
}

export async function fetchQuote(db: Persistence, quoteId: string): Promise<Row | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId)) return undefined;
  return db.one('SELECT * FROM quotes WHERE id=?::uuid', quoteId);
}

export async function consumeQuote(db: Persistence, quoteId: string, orderId: number): Promise<void> {
  const now = Date.now();
  const result = await db.run('UPDATE quotes SET consumed_at=?, consumed_order_id=? WHERE id=?::uuid AND consumed_at IS NULL', now, orderId, quoteId);
  if (!result.changes) throw new Error('quote already consumed');
}
