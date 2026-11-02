import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { deadlineSeconds } from './api-clock';
import type { JourneyEta } from './journey-contracts';
import { useApi } from './api';
import { approachKey, canShowOnRenderer, googleApproachPath, routeProvider, selectRenderer, SIGNIFICANT_MOVEMENT_METRES } from './map-provider';
import { useMapMode } from './map-mode';
import { publicFixAgeMs, publicFixClock } from './location-state';
import { etaRange, fromDriver, roadPath, shownApproach } from './map-math';
import { activeStatuses, city, type Order, type Point } from './model';
import { fill, palette, Row, Txt, useCopy } from './ui';

export type RoadRoute = { km: number; minutes: number; line: [number, number][]; avoids?: string[]; through?: string[]; closed?: Point[]; provider?: string; eta?: JourneyEta };

/** The app's foreground state: a billable reroute may only be triggered while the user is watching. */
function useForeground() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * Road line pickup→dropoff and the live driver's ETA to the next stop (SPEC-routing-eta.md).
 * All null when routing is unavailable; the map then shows pins without a line.
 */
export function useRoad(order: Order | undefined) {
  const from = order && (order.pickupPoint ?? city(order.pickupCity));
  const to = order && (order.dropoffPoint ?? city(order.dropoffCity));
  const active = !!order && activeStatuses.includes(order.status);
  // T06/T14: a route drawn here must come from a provider this platform's renderer may show
  // (tasks/maps-contract.md): Google-sourced geometry never reaches a MapLibre/Apple overlay, and unknown
  // provenance fails closed. The renderer also decides where the approach route is fetched from.
  const [mode] = useMapMode();
  const foreground = useForeground();
  const [{ wall: now, monotonic }, setNow] = useState(() => ({ wall: Date.now(), monotonic: performance.now() }));
  useEffect(() => { if (!foreground) return; const timer = setInterval(() => setNow({ wall: Date.now(), monotonic: performance.now() }), 1000); return () => clearInterval(timer); }, [foreground]);
  const renderer = selectRenderer(Platform.OS, Constants.expoConfig?.extra?.googleMaps, mode);
  const showable = (route: RoadRoute | undefined) => route && canShowOnRenderer(routeProvider(route.provider), renderer) ? route : undefined;
  const route = showable(useApi<RoadRoute>(from && to && (active || order?.status === 'searching') ? roadPath(from, to, 5) : null).data);
  // Before collection (and when returning to the sender) the driver heads to pickup, otherwise to dropoff.
  const toPickup = !!order && ['assigned', 'at_pickup', 'returning'].includes(order.status);
  // A courier with other stops first is not heading straight here: no ETA or approach line (SPEC-courier-run-eta.md).
  const driver = active && !order?.sharedRun ? order?.driverLocation : null;
  const target = toPickup ? from : to;
  const fixKey = driver ? `${order?.id}:${order?.driverId}:${order?.recovery?.assignmentEpoch}:${driver.updatedAt}` : '';
  const [fixClock, setFixClock] = useState<{ key: string; clock?: ReturnType<typeof publicFixClock> }>({ key: '' });
  if (fixClock.key !== fixKey) setFixClock({ key: fixKey, clock: driver ? publicFixClock(driver, now, monotonic) : undefined });

  // T08.2/T14: a Google approach bills once as a shown preview per stop, then only for a significant movement
  // while foregrounded; the URL is built from the last billed fix, so a stationary poll, a background timer or
  // a refocus never even changes it. The free OSRM approach keeps its ~110 m grid and refresh-on-focus.
  const stopKey = order && target ? approachKey(order, target, renderer ?? 'unavailable') : '';
  const [billed, setBilled] = useState<{ key: string; fix: Point | null; metres: number }>({ key: '', fix: null, metres: 0 });
  if (stopKey !== billed.key) setBilled({ key: stopKey, fix: driver ? { latitude: driver.latitude, longitude: driver.longitude } : null, metres: 0 });
  else if (driver && !billed.fix) setBilled({ key: stopKey, fix: { latitude: driver.latitude, longitude: driver.longitude }, metres: 0 });
  else if (driver && billed.fix && (driver.latitude !== billed.fix.latitude || driver.longitude !== billed.fix.longitude)) {
    const metres = Math.hypot((driver.longitude - billed.fix.longitude) * 111_320 * Math.cos(driver.latitude * Math.PI / 180),
      (driver.latitude - billed.fix.latitude) * 110_540);
    if (metres >= SIGNIFICANT_MOVEMENT_METRES) setBilled({ key: stopKey, fix: { latitude: driver.latitude, longitude: driver.longitude }, metres });
  }
  const approachUrl = !renderer || !driver || !target ? null
    : renderer === 'google'
      ? foreground && stopKey && billed.fix ? googleApproachPath(billed.fix, target, billed.metres) : null
      : roadPath(driver, target, 3, driver.heading);
  const approach = useApi<RoadRoute>(approachUrl, renderer === 'google' ? undefined : 25_000, { refetchOnFocus: renderer !== 'google' });
  // useApi keeps the last data when a refresh fails, so a failed fetch must not count as fresh.
  const fetched = approach.error ? undefined : showable(approach.data);
  // Keep showing the previous ETA while the next one (after a billable movement) is fetched, but only to the
  // same stop: a new order, driver, stop or provider drops it rather than show an ETA to somewhere the
  // driver is no longer heading.
  const provider = renderer === 'google' ? 'google' : renderer ?? 'unavailable';
  const stop = order ? approachKey(order, target, provider) : '';
  const [kept, setKept] = useState<{ stop: string; route: RoadRoute }>();
  if (fetched && (fetched !== kept?.route || kept.stop !== stop)) setKept({ stop, route: fetched });
  const candidate = driver && renderer ? showable(shownApproach(fetched, !!approach.error, kept, stop)) : undefined;
  const fixFresh = !!driver && publicFixAgeMs(driver, now, fixClock.key === fixKey ? fixClock.clock : undefined, monotonic) < 30_000;
  const eta = candidate && fixFresh && (!candidate.eta || deadlineSeconds(candidate.eta.validity.expiresAt, candidate.eta, now) > 0) ? candidate : undefined;
  // The server keeps a free calculation for 30 s and its ETA expires with it, but the poll runs every 25 s, so a
  // stationary driver's cache hit would leave the ETA hidden until the next poll. Refetch once when the shown
  // calculation lapses; a billable Google approach only ever refetches after significant movement.
  const lapsed = renderer !== 'google' && fixFresh && candidate?.eta && deadlineSeconds(candidate.eta.validity.expiresAt, candidate.eta, now) <= 0
    ? candidate.eta.validity.issuedAt : undefined;
  const reloadApproach = approach.reload;
  useEffect(() => { if (lapsed !== undefined) void reloadApproach(); }, [lapsed, reloadApproach]);
  // Closed checkpoints the shown routes steer around, or still cross (SPEC-checkpoint-routing.md).
  const shown = [route, driver ? eta : undefined];
  const through = [...new Set(shown.flatMap(r => r?.through ?? []))];
  const avoids = [...new Set(shown.flatMap(r => r?.avoids ?? []))].filter(n => !through.includes(n));
  const closed = shown.flatMap(r => r?.closed ?? []).filter((p, i, all) => all.findIndex(q => q.latitude === p.latitude && q.longitude === p.longitude) === i);
  return { road: route?.line ?? null, approach: eta?.line && driver ? fromDriver(eta.line, driver) : null, eta: eta ? eta.eta ? [Math.ceil(eta.eta.minSeconds / 60), Math.ceil(eta.eta.maxSeconds / 60)] as [number,number] : etaRange(eta.minutes) : null, km: eta?.km ?? null, avoids, through, closed };
}

/** One line per outcome under a route map: the route goes around closed checkpoints, or cannot. */
export function RouteCheckpoints({ avoids, through }: { avoids: string[]; through: string[] }) {
  const { c, language } = useCopy();
  if (!avoids.length && !through.length) return null;
  const sep = language === 'ar' ? '، ' : ', ';
  return <View accessibilityLiveRegion="polite" style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 4 }}>
    {avoids.length > 0 && <Row gap={8}>
      <Ionicons name="git-branch-outline" size={16} color={palette.olive} />
      <Txt variant="caption" style={{ flex: 1, color: palette.olive }}>{fill(c.routeAvoids, { names: avoids.join(sep) })}</Txt>
    </Row>}
    {through.length > 0 && <Row gap={8}>
      <Ionicons name="alert-circle-outline" size={16} color={palette.error} />
      <Txt variant="caption" style={{ flex: 1, color: palette.error }}>{fill(c.routeThrough, { names: through.join(sep) })}</Txt>
    </Row>}
  </View>;
}
