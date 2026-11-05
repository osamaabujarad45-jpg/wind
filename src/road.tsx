import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { deadlineSeconds } from './api-clock';
import type { JourneyEta } from './journey-contracts';
import type { NavStep } from './nav-steps';
import { useApi } from './api';
import { approachKey, canShowOnRenderer, googleApproachPath, routeProvider, selectRenderer, SIGNIFICANT_MOVEMENT_METRES } from './map-provider';
import { useMapMode } from './map-mode';
import { publicFixAgeMs, publicFixClock } from './location-state';
import { etaRange, fromDriver, nearLine, roadPath, shownApproach } from './map-math';
import { activeStatuses, city, type Order, type Point } from './model';
import { fill, palette, Row, Txt, useCopy } from './ui';

type Anchor = { key: string; fix: (Point & { heading?: number | null }) | null; metres: number; at: number };

export type RoadRoute = { km: number; minutes: number; line: [number, number][]; avoids?: string[]; through?: string[]; closed?: Point[]; provider?: string; eta?: JourneyEta; steps?: NavStep[] };

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
export function useRoad(order: Order | undefined, stepsLanguage?: 'ar' | 'en' | null) {
  const withSteps = !!stepsLanguage;
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
  // a refocus never even changes it. The free OSRM approach keeps its ~110 m grid and refresh-on-focus, and also moves only
  // on a significant movement: a new URL per fix would spend the route budget (120 per 10 minutes) on a fast road and lose the ETA.
  const stopKey = order && target ? approachKey(order, target, renderer ?? 'unavailable') : '';
  // A status change at the same stop, assigned to at_pickup say, is not a new route to buy.
  const billKey = order && target ? approachKey({ ...order, status: undefined }, target, renderer ?? 'unavailable') : '';
  const nowhere: Anchor = { key: '', fix: null, metres: 0, at: 0 };
  const [billed, setBilled] = useState(nowhere);
  // The free turn-by-turn route keeps its own anchor: leaving the line reroutes it, and that must never move what the paid URL is built from.
  const [steered, setSteered] = useState(nowhere);
  const [kept, setKept] = useState<{ stop: string; route: RoadRoute }>();
  const fix = driver ? { latitude: driver.latitude, longitude: driver.longitude, heading: driver.heading } : null;
  const reanchor = (anchor: Anchor, set: (next: Anchor) => void, key: string, mayLeaveLine: boolean) => {
    if (key !== anchor.key || (fix && !anchor.fix)) { set({ key, fix, metres: 0, at: monotonic }); return; }
    if (!driver || !anchor.fix || (driver.latitude === anchor.fix.latitude && driver.longitude === anchor.fix.longitude)) return;
    const metres = Math.hypot((driver.longitude - anchor.fix.longitude) * 111_320 * Math.cos(driver.latitude * Math.PI / 180),
      (driver.latitude - anchor.fix.latitude) * 110_540);
    // Leaving the line asks for a new one after 50 m so GPS drift cannot refetch, and at most every 30 s so an unmapped track
    // cannot spend the route budget (120 per 10 minutes, blocked calls included).
    const left = mayLeaveLine && metres >= 50 && monotonic - anchor.at >= 30_000 && kept?.stop === stopKey && !nearLine(driver, kept.route.line, 40);
    if (metres >= SIGNIFICANT_MOVEMENT_METRES || left) set({ key, fix, metres, at: monotonic });
  };
  reanchor(billed, setBilled, billKey, false);
  reanchor(steered, setSteered, stopKey, withSteps);
  const approachUrl = !renderer || !driver || !target ? null
    // The driver's turns need a line from where they are, not from a 110 m grid cell, which can be the next street.
    : withSteps ? steered.fix && `${roadPath(steered.fix, target, 5, steered.fix.heading)}&steps=1&lang=${stepsLanguage}`
    : steered.fix && roadPath(steered.fix, target, 3, steered.fix.heading);
  const approach = useApi<RoadRoute>(approachUrl, 25_000);
  // On a Google map a paid line overlays that free route. It is never polled or reloaded: when its ETA lapses or the call
  // fails, the free route carries the line and minutes, so a waiting driver costs nothing and never loses them.
  const paidUrl = renderer === 'google' && driver && target && foreground && billKey && billed.fix ? googleApproachPath(billed.fix, target, billed.metres) : null;
  const paidApproach = useApi<RoadRoute>(paidUrl, undefined, { refetchOnFocus: false });
  // useApi keeps the last data when a refresh fails, so a failed fetch must not count as fresh.
  const fetched = approach.error ? undefined : showable(approach.data);
  // Keep showing the previous ETA while the next one is fetched, but only to the same stop: a new order,
  // driver, stop or provider drops it rather than show an ETA to somewhere the driver is no longer heading.
  const provider = renderer === 'google' ? 'google' : renderer ?? 'unavailable';
  const stop = order ? approachKey(order, target, provider) : '';
  if (fetched && (fetched !== kept?.route || kept.stop !== stop)) setKept({ stop, route: fetched });
  const candidate = driver && renderer ? showable(shownApproach(fetched, !!approach.error, kept, stop)) : undefined;
  const fixFresh = !!driver && publicFixAgeMs(driver, now, fixClock.key === fixKey ? fixClock.clock : undefined, monotonic) < 30_000;
  const unexpired = (r: RoadRoute | undefined) => r && fixFresh && (!r.eta || deadlineSeconds(r.eta.validity.expiresAt, r.eta, now) > 0) ? r : undefined;
  const free = unexpired(candidate);
  // A paid answer with no ETA has no expiry, so it can never read as current. Nor can one from before the driver left the
  // line: the turn banner already follows the new free route, and the line and minutes must agree with it.
  const paidRoute = paidApproach.error || steered.at > billed.at ? undefined : showable(paidApproach.data);
  const eta = (paidRoute?.eta ? unexpired(paidRoute) : undefined) ?? free;
  // The server keeps a free calculation for 30 s and its ETA expires with it, but the poll runs every 25 s, so a
  // stationary driver's cache hit would leave the ETA hidden until the next poll. Refetch once when the shown
  // calculation lapses; a billable Google approach only ever refetches after significant movement.
  const lapsed = fixFresh && candidate?.eta && deadlineSeconds(candidate.eta.validity.expiresAt, candidate.eta, now) <= 0
    ? candidate.eta.validity.issuedAt : undefined;
  const reloadApproach = approach.reload;
  useEffect(() => { if (lapsed !== undefined) void reloadApproach(); }, [lapsed, reloadApproach]);
  // Closed checkpoints the shown routes steer around, or still cross (SPEC-checkpoint-routing.md). The policy reads the free
  // route: a paid answer carries none, so a notice must not vanish for the seconds a paid line is valid.
  const shown = [route, driver ? free : undefined];
  const through = [...new Set(shown.flatMap(r => r?.through ?? []))];
  const avoids = [...new Set(shown.flatMap(r => r?.avoids ?? []))].filter(n => !through.includes(n));
  const closed = shown.flatMap(r => r?.closed ?? []).filter((p, i, all) => all.findIndex(q => q.latitude === p.latitude && q.longitude === p.longitude) === i);
  return { steps: withSteps ? free?.steps : undefined, navLine: withSteps ? free?.line : undefined, road: route?.line ?? null, approach: eta?.line && driver ? fromDriver(eta.line, driver) : null, eta: eta ? eta.eta ? [Math.ceil(eta.eta.minSeconds / 60), Math.ceil(eta.eta.maxSeconds / 60)] as [number,number] : etaRange(eta.minutes) : null, km: eta?.km ?? null, avoids, through, closed };
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
