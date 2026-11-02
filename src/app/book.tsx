// Route, service details, payment and one confirm action; uncertain submissions keep their identity.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { api, ApiError, errorCode, storage, useApi } from '../api';
import { againForm, orderRequest, pendingKey, pendingOutcome, pendingReleasable, pickupForm, newBooking, readBooking, scheduleSlots, type PendingBooking, type PendingOutcome } from '../booking';
import { browserPickupWatch, cachedPickup, findPickup, withPickupPermission } from '../customer-location';
import { city, CLOSED_MINUTES, distanceKm, isCity, isValidPhone, optionsFor, orderCode, quote, roadAlerts, services, servedCity, SLOW_MINUTES, type CityId, type Order, type Places, type Point, type PriceQuote, type Referral, type Road, type SavedPlace, type Service } from '../model';
import { type PlaceCandidate } from '../place-search';
import { PlaceSearch, type PlaceSearchText } from '../place-search-panel';
import { roadPath } from '../map-math';
import { canShowOnRenderer, googlePreviewPath, routeProvider, selectRenderer } from '../map-provider';
import { useMapMode } from '../map-mode';
import { RouteLine, serviceMeta, SlotPicker, useFormat } from '../parts';
import PinSheet from '../pin-sheet';
import RouteMap, { canPin } from '../route-map';
import { RouteCheckpoints, type RoadRoute } from '../road';
import { useSession } from '../session';
import { emptyFreightDraft, freightDraftFromScope, freightScope } from '../freight-scope';
import { FreightScopeForm } from '../freight-details';
import { Button, Card, Choices, confirm, ErrorText, fill, Field, haptic, Header, IconButton, palette, Press, Reason, Row, Screen, Stepper, Txt, useCopy } from '../ui';

export default function Book() {
  const { me } = useSession();
  // An account switch remounts the form: no field from the previous account stays on screen.
  return <BookForm key={me?.user.id ?? 0} />;
}

function BookForm() {
  const params = useLocalSearchParams<{ service?: string; from?: string; to?: string; pick?: string; when?: string; again?: string; keep?: string }>();
  const { me, refresh } = useSession();
  const { c, language, money, err, row, rtl } = useCopy();
  const { time } = useFormat();
  const [service, setService] = useState<Service>(params.service === 'ride' || params.service === 'freight' ? params.service : 'parcel');
  const [freight, setFreight] = useState(emptyFreightDraft);
  const [loadingHours, setLoadingHours] = useState(2);
  // a ride meets its passenger and drops them off: its place words differ from a parcel's
  const word = (k: 'pickupNote' | 'dropoffNote' | 'pickupOnMap' | 'dropoffOnMap') => service === 'ride' ? c[`${k}_ride` as const] : c[k];
  const [pickupCity, setPickupCity] = useState<CityId>(isCity(params.from) ? params.from : 'ramallah');
  const [dropoffCity, setDropoffCity] = useState<CityId>(isCity(params.to) ? params.to : 'nablus');
  const [pickupChosen, setPickupChosen] = useState(isCity(params.from));
  const [dropoffChosen, setDropoffChosen] = useState(isCity(params.to));
  const routeChosen = pickupChosen && dropoffChosen;
  const [pickupPoint, setPickupPoint] = useState<Point | null>(null);
  const [gpsPoint, setGpsPoint] = useState<Point | null>(null); // the chip says "from your location" only while the GPS fix is the pickup
  const gpsAt = useRef(0);
  const pinRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pinRequest.current?.abort(), []);
  const [dropoffPoint, setDropoffPoint] = useState<Point | null>(null);
  const [pinFor, setPinFor] = useState<'pickup' | 'dropoff' | null>(null);
  const [locating, setLocating] = useState(false);
  const [picker, setPicker] = useState<'pickup' | 'dropoff' | null>(params.pick === 'to' ? 'dropoff' : null);
  const [pickupNote, setPickupNote] = useState('');
  const [dropoffNote, setDropoffNote] = useState('');
  const [contact, setContact] = useState(me?.user.phone ?? '');
  const [detail, setDetail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [option, setOption] = useState(optionsFor(service)[0]);
  const [loadingHelp, setLoadingHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const locationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => locationRequest.current?.abort(), []);
  const [pending, setPending] = useState<PendingBooking | null>(null);
  const [outcome, setOutcome] = useState<PendingOutcome | null>(null); // the last read-only answer; null = not checked
  const [resolving, setResolving] = useState(false);
  const reading = useRef(false);
  const settled = useRef(false);
  const alive = useRef(true);
  const latest = useRef<PendingBooking | null>(null); // what the screen is actually holding, for late answers
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [ready, setReady] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<number | null>(null); // order-again source, for the caption
  const [sameFrom, setSameFrom] = useState(false); // send another: only the pickup was copied
  const copied = useRef<string | null>(null); // copy once: a language switch re-runs the effect and must not undo edits
  // Now or a 30-minute slot in the next 7 days, at least an hour ahead (the server allows 30 minutes of slack).
  const [when, setWhen] = useState<'now' | 'later'>(params.when === 'later' ? 'later' : 'now');
  const [slot, setSlot] = useState<number | null>(null);
  // T40: the ~227 Intl formattings behind scheduleSlots belong to the half-hour bucket, not to every keystroke.
  // The bucket is derived in an effect; the render keeps the last list until the next half-hour begins.
  const [slotBucket, setSlotBucket] = useState(() => ({ bucket: Math.floor(Date.now() / (30 * 60_000)), at: Date.now() }));
  useEffect(() => {
    const timer = setInterval(() => {
      const at = Date.now(), bucket = Math.floor(at / (30 * 60_000));
      setSlotBucket(previous => previous.bucket === bucket ? previous : { bucket, at });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- slotBucket is the recompute trigger; slots read the real clock
  const slots = useMemo(() => scheduleSlots(), [slotBucket]);
  const chosen = slot !== null && slots.includes(slot) ? slot : slots[0] ?? null;
  const scheduledFor = when === 'later' ? chosen : null;
  const wantsScope = service === 'freight' && me?.capabilities?.declaredScope === true;
  // An immediate load's window starts when its quote does: every re-quote (expiry, price change, retry) restarts it,
  // so the declared start is at most one quote lifetime old, not a half-hour bucket.
  const [quotedAt, setQuotedAt] = useState(() => Date.now());
  const declaredScope = useMemo(() => pending?.payload.declaredScope ?? (wantsScope ? freightScope(freight, scheduledFor ?? Math.max(slotBucket.at, quotedAt), loadingHours) : undefined),
    [pending?.payload.declaredScope, wantsScope, freight, scheduledFor, slotBucket.at, quotedAt, loadingHours]);
  const scopeInvalid = wantsScope && declaredScope === null;
  const sending = useRef(false);
  const savedKey = pendingKey(me!.user.id);
  const releasable = pendingReleasable(outcome);
  const enabledServices = me?.capabilities?.enabledServices ?? ['parcel'];
  const available = enabledServices.includes(service);
  const locked = busy || !!pending || !ready || locating || !available;
  // Per-field problems, shown under each field; cleared as soon as that field is edited.
  const [invalid, setInvalid] = useState<Partial<Record<'pickupNote' | 'dropoffNote' | 'detail' | 'contact' | 'recipientPhone', string>>>({});
  const scrollRef = useRef<ScrollView>(null);
  const [promo, setPromo] = useState<{ code: string; discount: number; price: number } | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [checking, setChecking] = useState(false);
  const [credits, setCredits] = useState<Referral['credits']>([]);
  const edit = (key: keyof typeof invalid, set: (v: string) => void) => (v: string) => { set(v); if (invalid[key]) setInvalid({ ...invalid, [key]: undefined }); };
  // Saved and recent places: landmarks are the address here, so reuse them instead of retyping.
  const isCustomer = me?.user.role === 'customer';
  const [places, setPlaces] = useState<Places>({ saved: [], recent: [] });
  useEffect(() => { if (isCustomer) api<Places>('/me/places').then(setPlaces).catch(() => undefined); }, [isCustomer]);
  useEffect(() => { if (isCustomer) api<Referral>('/me/referral').then(r => setCredits(r.credits)).catch(() => undefined); }, [isCustomer]);
  const [roads, setRoads] = useState<Road[]>([]);
  useEffect(() => { api<Road[]>('/roads').then(setRoads).catch(() => undefined); }, []);
  const alerts = roadAlerts(roads, pickupCity, dropoffCity);
  // T13: the preview line follows the selected renderer. The OSRM preview is free and refreshes on focus;
  // a Google display route is billed once per shown pin pair (never a rerender or refocus: refetchOnFocus
  // is off, and a changed pin pair is the only re-request), falls back to the free OSRM line when Google is
  // unavailable or exhausted, and is provenance-guarded like every other line. Money never reads it: fares,
  // feasibility and the servedCity bound stay on the server's /price and /orders policy.
  const [mapMode] = useMapMode();
  const mapRenderer = selectRenderer(Platform.OS, Constants.expoConfig?.extra?.googleMaps, mapMode);
  const previewFrom = pickupPoint ?? city(pickupCity), previewTo = dropoffPoint ?? city(dropoffCity);
  const pinPair = routeChosen ? `${previewFrom.latitude},${previewFrom.longitude}|${previewTo.latitude},${previewTo.longitude}` : null;
  // Which trigger the next Google preview may claim: the first shown pair bills as a preview, every different
  // pair afterwards as a destination change (render-phase adjustment, the sanctioned React pattern).
  const [previewTrigger, setPreviewTrigger] = useState<{ pair: string | null; changed: boolean }>({ pair: null, changed: false });
  if (pinPair !== previewTrigger.pair) setPreviewTrigger({ pair: pinPair, changed: previewTrigger.pair != null && pinPair != null });
  const osrmPreviewPath = routeChosen && pinPair ? roadPath(previewFrom, previewTo, 5) : null;
  const googlePreview = useApi<RoadRoute>(routeChosen && mapRenderer === 'google' && pinPair ? googlePreviewPath(previewFrom, previewTo, previewTrigger.changed) : null, undefined, { refetchOnFocus: false });
  const osrmPreview = useApi<RoadRoute>(mapRenderer === 'google' ? (pinPair && googlePreview.error ? osrmPreviewPath : null) : osrmPreviewPath);
  // A line renders only when its provenance is allowed on this renderer (T06); pins stay either way.
  const preview = [osrmPreview.data, googlePreview.data].find(line =>
    !!line && canShowOnRenderer(routeProvider(line.provider), mapRenderer));
  const savePlace = (label: SavedPlace['label'], placeCity: CityId, note: string) => api<Places>('/me/places', { label, city: placeCity, note: note.trim() })
    .then(next => { setPlaces(next); haptic.success(); AccessibilityInfo.announceForAccessibility(c.placeSaved); }).catch(e => setError(err(e)));

  // Denied for good: the system will not ask again, so the only way back is Settings.
  async function askLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted && !permission.canAskAgain) void Linking.openSettings().catch(() => {});
    return permission;
  }

  async function locate() {
    locationRequest.current?.abort();
    const request = new AbortController();
    locationRequest.current = request;
    setLocating(true);
    setLocationError('');
    try {
      // Permission setup shares the timeout: dismissing/backgrounding a native
      // prompt must not leave the booking form locked indefinitely.
      const result = await findPickup(Platform.OS === 'web' ? browserPickupWatch(navigator.geolocation)
        : withPickupPermission(askLocation, (receive, fail) => Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 1000 }, receive, fail)), request.signal);
      if (request.signal.aborted) return;
      setPickupCity(result.city); setPickupChosen(true);
      gpsAt.current = Date.now();
      setPickupPoint(result.point); setGpsPoint(result.point);
      setLocationError(fill(c.locationAccuracy, { city: city(result.city)[language], m: Math.ceil(result.accuracy) }));
    } catch (e) {
      if (!request.signal.aborted) setLocationError(e instanceof Error && e.message === 'outside' ? c.pinOutsideArea
        : e instanceof Error && e.message === 'inaccurate' ? c.locationInaccurate : c.locationManual);
    } finally { if (!request.signal.aborted) setLocating(false); }
  }

  // Read-only reconciliation uses the exact command receipt, never mutable order details.
  const checkPending = useCallback(async (command: PendingBooking) => {
    if (reading.current || settled.current) return;
    reading.current = true;
    setResolving(true);
    try {
      const answer = pendingOutcome(await api<{ orderId: number | null }>(`/orders/commands/${encodeURIComponent(command.requestId)}`), command);
      const held = latest.current;
      // Only apply an answer about the attempt this screen still holds: a late reply must not act for another account.
      if (!alive.current || settled.current || held?.requestId !== command.requestId || held?.attemptedAt !== command.attemptedAt) return;
      setOutcome(answer);
      if (answer.state === 'present') {
        settled.current = true;
        await storage.set(savedKey, null, true).catch(() => {}); // a retained successful command safely re-finds this order
        if (!alive.current) return;
        latest.current = null;
        setPending(null);
        router.replace(`/order/${answer.orderId}`);
      }
    } catch {
      if (alive.current && !settled.current) setOutcome({ state: 'unknown' }); // a failed check never unlocks editing
    } finally {
      reading.current = false;
      setResolving(false);
    }
  }, [savedKey]);

  useEffect(() => {
    let mounted = true;
    storage.get(savedKey, true).then(async saved => {
      let existing: PendingBooking | null = null;
      if (saved !== null) {
        try { existing = readBooking(saved); }
        catch { await storage.set(savedKey, null).catch(() => {}); } // an unreadable command must not lock the form forever
      }
      if (!mounted) return;
      if (existing) {
        const p = existing.payload;
        latest.current = existing;
        setPending(existing); setService(p.service); setPickupCity(p.pickupCity); setDropoffCity(p.dropoffCity);
        setPickupChosen(true); setDropoffChosen(true);
        setPickupPoint(p.pickupPoint); setDropoffPoint(p.dropoffPoint ?? null); setPickupNote(p.pickupNote); setDropoffNote(p.dropoffNote);
        setContact(p.contact); setDetail(p.detail); setOption(p.option); setLoadingHelp(p.loadingHelp);
        if (p.declaredScope) {
          setFreight(freightDraftFromScope(p.declaredScope));
          setLoadingHours((p.declaredScope.loadingBefore - p.declaredScope.loadingAfter) / 3_600_000);
        }
        setRecipientName(p.recipientName ?? ''); setRecipientPhone(p.recipientPhone ?? '');
        if (p.scheduledFor) { setWhen('later'); setSlot(p.scheduledFor); } // a retried booking keeps its time
        void checkPending(existing);
      } else if (params.again && copied.current !== `${params.again}:${params.keep}`) {
        // Order again (SPEC-order-again.md): an in-flight pending booking above always wins over the old order.
        const old = await api<Order>(`/orders/${encodeURIComponent(params.again)}`).catch(() => null); // missing/foreign: empty form
        if (!mounted) return;
        if (old && params.keep === 'pickup') { // send another (SPEC-send-another.md): pickup only, the next recipient is typed fresh
          const p = pickupForm(old);
          setService(p.service); setPickupCity(p.pickupCity); setPickupPoint(p.pickupPoint); setPickupNote(p.pickupNote); setOption(p.option);
          setSameFrom(true); setCopiedFrom(old.id);
          setPickupChosen(true);
        } else if (old) {
          const f = againForm(old);
          setService(f.service); setPickupCity(f.pickupCity); setDropoffCity(f.dropoffCity); setPickupPoint(f.pickupPoint); setDropoffPoint(f.dropoffPoint);
          setPickupNote(f.pickupNote); setDropoffNote(f.dropoffNote); setDetail(f.detail); setOption(f.option); setLoadingHelp(f.loadingHelp);
          if (f.contact) setContact(f.contact);
          setRecipientName(f.recipientName); setRecipientPhone(f.recipientPhone);
          setSameFrom(false); setCopiedFrom(old.id);
          setPickupChosen(true); setDropoffChosen(true);
        }
        if (old) copied.current = `${params.again}:${params.keep}`;
      }
      setReady(true);
    }).catch(() => { if (mounted) setError(c.bookingStorageError); });
    return () => { mounted = false; };
  }, [savedKey, checkPending, c.bookingStorageError, params.again, params.keep]);

  // Coming back to the app re-asks the read-only question, so an answer from before a commit is not kept forever.
  useEffect(() => {
    if (!pending) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && !sending.current) void checkPending(pending);
    });
    return () => subscription.remove();
  }, [pending, checkPending]);

  const settings = me!.settings;
  const plus = me?.plan === 'plus';
  // Smart recommended price from the server (SPEC-driver-offers.md); without it (offline), the fixed tariff as before.
  const [priceTick, setPriceTick] = useState(0);
  const requote = () => { setQuotedAt(Date.now()); setPriceTick(n => n + 1); };
  // Each answer is keyed by its inputs: while the latest does not match the form, the price is still being worked out.
  const priceKey = JSON.stringify([service, option, loadingHelp, pickupCity, dropoffCity, pickupPoint, dropoffPoint, scheduledFor, declaredScope, priceTick]);
  const [quoted, setQuoted] = useState<{ key: string; quote: PriceQuote | null } | null>(null);
  useEffect(() => {
    if (!isCustomer || pending || !routeChosen || scopeInvalid) return; // a pending booking keeps its complete terms
    let live = true;
    const timer = setTimeout(() => api<PriceQuote>('/price', { service, option, loadingHelp, pickupCity, dropoffCity,
      ...(pickupPoint && { pickupPoint }), ...(dropoffPoint && { dropoffPoint }), ...(declaredScope && { declaredScope }), ...(scheduledFor !== null && { scheduledFor }) })
      .then(quote => quote, () => null).then(quote => { if (live) setQuoted({ key: priceKey, quote }); }), 300);
    return () => { live = false; clearTimeout(timer); };
  }, [isCustomer, pending, routeChosen, priceKey, service, option, loadingHelp, pickupCity, dropoffCity, pickupPoint, dropoffPoint, scheduledFor, scopeInvalid, declaredScope]);
  const quoting = isCustomer && !pending && routeChosen && !scopeInvalid && quoted?.key !== priceKey; // the Request button waits for it
  const quoteFailed = isCustomer && !pending && routeChosen && quoted?.key === priceKey && quoted.quote === null;
  const smart = quoted?.key === priceKey ? quoted.quote : null;
  const price = pending?.payload.quotedPrice ?? smart?.price ?? quote(settings, { service, pickupCity, dropoffCity, option, loadingHelp, shared: false, plus });
  const reasons = smart && [fill(c.tripSize, { min: `${smart.estimated ? '≈ ' : ''}${smart.minutes}` }) /* the km sits in the route card above */, smart.night && c.nightRate,
    ...smart.slow.map(name => fill(c.slowDelay, { name, m: SLOW_MINUTES })), ...smart.closed.map(name => fill(c.closedDelay, { name, m: CLOSED_MINUTES }))]
    .filter(Boolean).join(' · ');
  const km = distanceKm(pickupPoint ?? city(pickupCity), dropoffPoint ?? city(dropoffCity));
  // A checked code holds for the fare it was checked against; the server re-checks it on booking.
  const applied = pending ? (pending.payload.promoCode ? { code: pending.payload.promoCode, discount: pending.payload.expectedDiscount ?? 0 } : null)
    : promo && promo.price === price ? promo : null;
  const pay = price - (applied?.discount ?? 0);
  async function applyPromo(code: string) {
    if (checking || !code.trim()) return;
    setChecking(true); setPromoError('');
    try {
      const r = await api<{ code: string; discount: number }>('/promos/check', { code, price });
      setPromo({ ...r, price }); setPromoInput(''); haptic.success();
      AccessibilityInfo.announceForAccessibility(fill(c.promoApplied, { code: r.code, d: money(r.discount) }));
    } catch (e) { haptic.error(); setPromo(null); setPromoError(err(e)); } finally { setChecking(false); }
  }

  function switchService(next: Service) {
    haptic.tap();
    setService(next);
    setOption(optionsFor(next)[0]);
    setLoadingHelp(false);
    setError('');
    setInvalid({});
  }

  async function submit() {
    if (!ready || sending.current || (!available && !pending)) return;
    if (!pending && scopeInvalid) { setError(c.freightScopeInvalid); return; }
    if (!pending && !routeChosen) { setPicker(pickupChosen ? 'dropoff' : 'pickup'); return; }
    if (!pending && scheduledFor !== null && scheduledFor < Date.now() + 60 * 60_000) { // the form sat open past the slot
      haptic.error(); setSlot(null); setError(c.err_invalid_schedule); return;
    }
    const problems = {
      pickupNote: pickupNote.trim() ? undefined : c.fieldRequired,
      dropoffNote: dropoffNote.trim() ? undefined : c.fieldRequired,
      detail: service === 'ride' || detail.trim() ? undefined : c.fieldRequired,
      contact: isValidPhone(contact) ? undefined : err('invalid_phone'),
      recipientPhone: service === 'ride' || !recipientPhone.trim() || isValidPhone(recipientPhone) ? undefined : err('invalid_phone'),
    };
    if (Object.values(problems).some(Boolean)) {
      haptic.error();
      setInvalid(problems);
      setError(c.fixMarked);
      // The details sit near the top; the contact field is right above the button.
      if (problems.pickupNote || problems.dropoffNote || problems.detail || problems.recipientPhone) scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setInvalid({});
    sending.current = true;
    setBusy(true);
    setError('');
    let saved = !!pending; // a pending command is already on the device
    try {
      // Retry keeps the stored identity and payload: the server's command idempotency makes a lost answer safe to repeat.
      const command = pending ? { ...pending, attemptedAt: Date.now() }
        : newBooking({ service, pickupCity, dropoffCity, pickupPoint, ...(dropoffPoint && { dropoffPoint }), pickupNote, dropoffNote,
          contact, detail, option, loadingHelp, shared: false, quotedPrice: price,
          ...(declaredScope && { declaredScope }),
          ...(service !== 'ride' && recipientPhone.trim() && { recipientName: recipientName.trim(), recipientPhone: recipientPhone.trim() }), ...(scheduledFor !== null && { scheduledFor }),
          ...(applied && { promoCode: applied.code, expectedDiscount: applied.discount }), ...(smart && { pricing: 'smart' as const }), ...(smart?.quoteId && { quoteId: smart.quoteId }) });
      setOutcome(null); // a new attempt invalidates the answer that arrived before it
      await storage.set(savedKey, JSON.stringify(command), true);
      saved = true;
      latest.current = command;
      setPending(command);
      const order = await api<Order>('/orders', orderRequest(command));
      settled.current = true;
      latest.current = null;
      await storage.set(savedKey, null, true).catch(() => {}); // a retained successful command safely replays
      haptic.success();
      router.replace(`/order/${order.id}`);
    } catch (e) {
      haptic.error();
      // Once the command is persisted, a transport failure is "saved, awaiting connection" —
      // the pending card below is already on screen. A failed write never claims it was saved.
      if (!(e instanceof ApiError)) setError(saved ? c.bookingOfflineSaved : c.bookingStorageError);
      else {
        setError(err(e));
        // A transport/5xx failure may have committed: keep the frozen form and same command for retry.
        // 426 is an outdated app, not a refusal of this booking: keep it to replay after the update.
        // An expired command may still have committed from an earlier, slower attempt: settle it by its receipt, never by clearing.
        if (errorCode(e) === 'booking_command_expired' && latest.current) void checkPending(latest.current);
        else if (e.status && e.status < 500 && ![401, 408, 426, 429].includes(e.status) && errorCode(e) !== 'idempotency_conflict') {
          try { await storage.set(savedKey, null, true); latest.current = null; setPending(null); setOutcome(null); }
          catch { setError(c.bookingStorageError); }
        }
      }
      if (errorCode(e) === 'price_changed') { await refresh(); requote(); } // new tariff or road state: customer confirms again
      if (['quote_expired', 'quote_consumed'].includes(errorCode(e) ?? '')) requote();
      if (['invalid_promo', 'promo_used', 'invite_first_order_only'].includes(errorCode(e) ?? '')) {
        setPromo(null);
        api<Referral>('/me/referral').then(r => setCredits(r.credits)).catch(() => undefined); // a used credit leaves the chip
      }
      if (errorCode(e) === 'promo_changed' && applied) void applyPromo(applied.code); // show the new discount, customer confirms again
    } finally { sending.current = false; setBusy(false); }
  }

  /** Drop a command the server has confirmed absent. Edit keeps the draft; discard leaves the form. */
  async function release(edit: boolean) {
    if (!pending || busy || sending.current || !releasable) return;
    haptic.tap();
    try {
      await storage.set(savedKey, null, true);
      latest.current = null;
      setPending(null); setOutcome(null); setError('');
      if (!edit) router.replace('/');
    } catch { setError(c.bookingStorageError); }
  }

  const located = !!pickupPoint && pickupPoint === gpsPoint;
  // Why Request waits, or what to do first (design §5, §10). Price shows only once it is quoted for this form: never dots or a guess.
  const requestReason = !ready ? c.form_loading : locating ? c.locating : !routeChosen ? c.quote_pick_route : scopeInvalid ? c.freightScopeInvalid : quoting ? c.quote_calculating : quoteFailed ? c.quote_failed
    : !available && !pending ? c.serviceUnavailable : null;
  // The form-wide lock (promo and checks wait on it): the same sentence as the Request button, never a silent grey control.
  const lockedReason = !available ? c.serviceUnavailable : locating ? c.locating : busy || !!pending ? c.wait_busy : c.form_loading;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen scrollRef={scrollRef} footer={pending ? undefined : <>
      <Button title={scheduledFor !== null ? c.scheduleRequest : c.request} trailing={routeChosen && !quoting && !quoteFailed && !scopeInvalid ? money(pay) : undefined}
        onPress={submit} loading={busy} disabled={!ready || locating || quoting || quoteFailed || scopeInvalid || (!available && !pending)} />
      {requestReason && <Reason>{requestReason}</Reason>}
      {quoteFailed && <Button title={c.retry} variant="ghost" onPress={requote} />}
    </>}>
      <Header title={c[service]} back />
      {pending && <Card tone="clay">
        <Txt variant="title">{c.bookingPending}</Txt>
        <Txt variant="caption">{c.bookingRetryHint}</Txt>
        <Txt variant="caption" style={{ marginTop: 4 }}>{resolving ? c.bookingRecoveryChecking : releasable ? c.bookingRecoveryAbsent : c.bookingRecoveryUnknown}</Txt>
        {!!pending.payload.scheduledFor && <Txt variant="label" style={{ marginTop: 4 }}>{fill(c.scheduledFor, { t: time(pending.payload.scheduledFor) })}</Txt>}
        <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <Button title={c.retry} size="sm" variant="soft" onPress={submit} loading={busy} disabled={resolving || locating || !ready} />
          <Button title={c.bookingEdit} size="sm" variant="soft" disabled={!releasable || busy || resolving} onPress={() => { void release(true); }} />
          <Button title={c.bookingDiscard} size="sm" variant="ghost" disabled={!releasable || busy || resolving} onPress={() => { void release(false); }} />
        </Row>
        {!releasable && !resolving && <Reason>{c.bookingRecoveryWait}</Reason>}
      </Card>}
      {!available && !pending && <Card tone="clay">
        <Txt variant="title">{c.serviceUnavailable}</Txt>
        <Button title={c.help} variant="ghost" onPress={() => router.push('/help')} />
      </Card>}
      {!ready && error && <Button title={c.help} variant="ghost" onPress={() => router.push('/help')} />}
      {copiedFrom !== null && !pending && <Txt variant="caption" style={{ marginBottom: 12 }}>{fill(sameFrom ? c.sendAnotherFrom : c.orderAgainFrom, { code: orderCode(copiedFrom) })}</Txt>}

      {/* Service switcher: the route stays, only the details change. */}
      <Row gap={8} style={{ marginBottom: 12 }}>
        {services.filter(s => enabledServices.includes(s)).map(s => {
          const on = s === service;
          return <Press key={s} disabled={busy || !!pending || !ready || locating} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={c[s]} onPress={() => switchService(s)}
            style={[styles.service, { flexDirection: row }, on && styles.serviceOn]}>
            <Ionicons name={serviceMeta[s].icon} size={16} color={on ? palette.lime : palette.secondary} />
            <Text key={language} numberOfLines={1} style={[styles.serviceText, on && { color: palette.onFill }]}>{c[s]}</Text>
          </Press>;
        })}
      </Row>

      <Card style={{ paddingTop: 0, overflow: 'hidden' }}>
        {routeChosen && <View style={{ marginHorizontal: -16, marginBottom: 12 }}>
          <RouteMap height={150} pickup={pickupPoint ?? city(pickupCity)} dropoff={dropoffPoint ?? city(dropoffCity)}
            pickupTitle={city(pickupCity)[language]} dropoffTitle={city(dropoffCity)[language]} road={preview?.line} closed={preview?.closed} />
          <RouteCheckpoints avoids={preview?.avoids ?? []} through={preview?.through ?? []} />
        </View>}
        <View style={rtl ? { paddingLeft: 48 } : { paddingRight: 48 }}>
          <RouteLine from={pickupChosen ? city(pickupCity)[language] : c.chooseCity} to={dropoffChosen ? city(dropoffCity)[language] : c.chooseCity} onFrom={locked ? undefined : () => setPicker('pickup')} onTo={locked ? undefined : () => setPicker('dropoff')} ride={service === 'ride'} />
          <View style={[styles.swap, rtl ? { left: 0 } : { right: 0 }]}>
            <IconButton icon="swap-vertical" label={c.swap} tone="muted" disabled={locked}
              onPress={() => { // the landmark belongs to its place, so it travels with it
                haptic.tap(); setPickupCity(dropoffCity); setDropoffCity(pickupCity); setPickupPoint(dropoffPoint); setDropoffPoint(pickupPoint);
                setPickupChosen(dropoffChosen); setDropoffChosen(pickupChosen);
                setPickupNote(dropoffNote); setDropoffNote(pickupNote); setInvalid({ ...invalid, pickupNote: invalid.dropoffNote, dropoffNote: invalid.pickupNote });
              }} />
          </View>
        </View>
        <Row gap={8} style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hair, justifyContent: 'space-between' }}>
          <Press accessibilityLabel={c.useLocation} onPress={locate} disabled={locating || locked}>
            <Row gap={6} style={styles.chip}>
              <Ionicons name={located ? 'checkmark-circle' : 'navigate'} size={14} color={palette.olive} />
              <Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{locating ? c.locating : located ? c.located : c.useLocation}</Txt>
            </Row>
          </Press>
          {routeChosen && <Txt variant="caption">{pickupCity === dropoffCity ? c.sameCity : `${preview ? preview.km : `≈ ${km}`} ${c.km}`}</Txt>}
        </Row>
        {canPin && <Row gap={8} style={{ marginTop: 8, flexWrap: 'wrap' }}>
          {(['pickup', 'dropoff'] as const).map(which => {
            const set = which === 'pickup' ? pickupPoint : dropoffPoint;
            const label = word(which === 'pickup' ? 'pickupOnMap' : 'dropoffOnMap');
            const openPin = async (w: 'pickup' | 'dropoff') => {
              haptic.tap(); setLocationError('');
              pinRequest.current?.abort();
              const request = new AbortController(); pinRequest.current = request;
              if (w === 'pickup' && !pickupPoint && Platform.OS !== 'web') {
                if (Date.now() - gpsAt.current > 30_000) {
                  setGpsPoint(null);
                  const point = await cachedPickup(() => Location.getLastKnownPositionAsync({ maxAge: 30_000, requiredAccuracy: 100 }), request.signal);
                  if (request.signal.aborted) return;
                  if (point) setGpsPoint(point); // Revalidate cached hints on every opening; only live fixes set gpsAt.
                }
              }
              if (request.signal.aborted) return;
              setPinFor(w);
            };
            return <Press key={which} accessibilityLabel={label} disabled={locked} onPress={() => { void openPin(which); }}>
              <Row gap={6} style={styles.chip}>
                <Ionicons name={set ? 'checkmark-circle' : 'pin-outline'} size={14} color={palette.olive} />
                <Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{label}</Txt>
              </Row>
            </Press>;
          })}
        </Row>}
        {!!locationError && <Txt variant="caption" style={{ marginTop: 8 }}>{locationError}</Txt>}
      </Card>

      {routeChosen && alerts.length > 0 && <View accessibilityLiveRegion="polite"><Card tone="clay">
        <Row gap={8} style={{ marginBottom: 6 }}><Ionicons name="warning-outline" size={18} color={palette.clayInk} /><Txt variant="title" style={{ flex: 1 }}>{c.roadAlert}</Txt></Row>
        {alerts.map(r => <Txt key={r.id} variant="caption">{`${r.name}: ${c[`road_${r.status!}`]}${r.note ? ` · ${r.note}` : ''}`}</Txt>)}
        <Button title={c.roads} variant="ghost" size="sm" icon="trail-sign-outline" onPress={() => router.push('/roads')} />
      </Card></View>}


      <Card>
        <Field label={word('pickupNote')} icon="flag-outline" value={pickupNote} onChangeText={edit('pickupNote', setPickupNote)} placeholder={c.pickupHint} error={invalid.pickupNote} disabled={locked} maxLength={200} />
        {isCustomer && pickupChosen && !locked && <SavePlace city={pickupCity} note={pickupNote} saved={places.saved} onSave={savePlace} />}
        <Field label={word('dropoffNote')} icon="location-outline" value={dropoffNote} onChangeText={edit('dropoffNote', setDropoffNote)} placeholder={c.dropoffHint} error={invalid.dropoffNote} disabled={locked} maxLength={200} />
        {isCustomer && dropoffChosen && !locked && <SavePlace city={dropoffCity} note={dropoffNote} saved={places.saved} onSave={savePlace} />}
        {service !== 'ride' && <>
          <Field label={c.recipientPhone} icon="call-outline" value={recipientPhone} onChangeText={edit('recipientPhone', setRecipientPhone)} placeholder={c.recipientPhoneHint}
            keyboardType="phone-pad" error={invalid.recipientPhone} disabled={locked} maxLength={20} />
          <Field label={c.recipientName} icon="person-outline" value={recipientName} onChangeText={setRecipientName} disabled={locked} maxLength={60} />
        </>}
        <Field label={c[`${service}Detail`]} value={detail} onChangeText={edit('detail', setDetail)} placeholder={c[`${service}Hint`]} multiline error={invalid.detail} disabled={locked} maxLength={500} />
        {service === 'ride'
          ? <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">{c.passengers}</Txt>
            <Stepper label={c.passengers} value={Number(option)} min={1} max={4} onChange={n => setOption(String(n))} disabled={locked} />
          </Row>
          : <>
            <Txt variant="label" style={{ marginBottom: 6 }}>{c.size}</Txt>
            <Choices items={optionsFor(service).map(key => ({ key, label: c[key as 'small'] }))} value={option} onChange={setOption} disabled={locked} />
          </>}
        {service === 'freight' && <>
          <Txt variant="label" style={{ marginVertical: 6 }}>{c.loadingHelp}</Txt>
          <Choices items={[{ key: 'no', label: c.no }, { key: 'yes', label: c.yes }]} value={loadingHelp ? 'yes' : 'no'} onChange={k => setLoadingHelp(k === 'yes')} disabled={locked} />
          {wantsScope && !pending && <FreightScopeForm draft={freight} onChange={setFreight} disabled={locked} />}
        </>}
      </Card>

      <Card>
        <Txt variant="label" style={{ marginBottom: 6 }}>{c.whenTitle}</Txt>
        {wantsScope && !pending && <View style={{ gap: 8, marginBottom: 10 }}>
          <Txt variant="label">{c.freightWindowHours}</Txt>
          <Stepper label={c.freightWindowHours} value={loadingHours} min={1} max={8} onChange={setLoadingHours} disabled={locked} />
          <Txt variant="caption">{fill(c.freightWindow, { from: time(scheduledFor ?? slotBucket.at), to: time((scheduledFor ?? slotBucket.at) + loadingHours * 3_600_000) })}</Txt>
        </View>}
        <Choices items={[{ key: 'now', label: c.now }, { key: 'later', label: c.later }]} value={pending?.payload.scheduledFor ? 'later' : when}
          onChange={setWhen} disabled={locked} />
        {when === 'later' && !pending && chosen !== null && <View style={{ marginTop: 10 }}>
          <SlotPicker slots={slots} value={chosen} onChange={setSlot} />
          <Txt variant="caption">{c.scheduledHint}</Txt>
        </View>}
      </Card>

      {smart && !pending && <Card style={{ paddingVertical: 10 }}>
        <Row gap={12}>
          <View style={styles.cash}><Ionicons name="sparkles-outline" size={18} color={palette.olive} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="micro">{smart.standard ? c.standardParcel : c.recommendedPrice}</Txt>
            <Txt variant="title">{quoting ? c.quote_calculating : money(smart.price)}</Txt>
          </View>
        </Row>
        {smart.standard
          ? <Txt variant="caption" style={{ marginTop: 6 }}>{c.standardParcelHint}</Txt>
          : <>
            {!!reasons && <Txt variant="caption" style={{ marginTop: 6 }}>{reasons}</Txt>}
            <Txt variant="caption" style={{ marginTop: 4 }}>{c.offersHint}</Txt>
          </>}
        {smart.estimated && !quoting && <Txt variant="caption" style={{ marginTop: 6 }}>{c.destinationEstimated}</Txt>}
      </Card>}

      <Card style={{ paddingVertical: 10 }}>
        <Row gap={12}>
          <View style={styles.cash}><Ionicons name="cash-outline" size={18} color={palette.olive} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="micro">{c.payWith}</Txt>
            <Txt variant="title">{c.cash}</Txt>
          </View>
          {plus && <Txt variant="label" style={{ color: palette.olive }}>{c.plusApplied}</Txt>}
        </Row>
        {isCustomer && <View style={styles.promo}>
          {applied ? <Row gap={8}>
            <Ionicons name="pricetag" size={16} color={palette.olive} />
            <View style={{ flex: 1 }}>
              <Txt variant="title">{fill(c.promoApplied, { code: applied.code, d: money(applied.discount) })}</Txt>
              <Txt variant="caption">{`${c.fare} ${money(price)} · ${c.youPayCash} ${money(pay)}`}</Txt>
            </View>
            {!pending && <IconButton icon="close" tone="muted" label={c.promoRemove} disabled={locked} onPress={() => { haptic.tap(); setPromo(null); AccessibilityInfo.announceForAccessibility(fill(c.promoRemoved, { p: money(price) })); }} />}
          </Row>
          : promo && !pending ? <Row gap={8}>
            <Txt variant="caption" style={{ flex: 1 }}>{c.promoRecheck}</Txt>
            <Button title={c.promoApply} size="sm" variant="soft" loading={checking} disabled={locked} reason={lockedReason} label={`${c.promoApply} ${promo.code}`} onPress={() => applyPromo(promo.code)} />
          </Row>
          : !pending && (promoOpen ? <>
            <Field label={c.promoCode} icon="pricetag-outline" value={promoInput} onChangeText={v => { setPromoInput(v); setPromoError(''); }}
              error={promoError} disabled={locked || checking} maxLength={16} returnKeyType="go" onSubmitEditing={() => applyPromo(promoInput)} />
            <Button title={c.promoApply} size="sm" variant="soft" loading={checking} disabled={locked || !promoInput.trim()} reason={promoInput.trim() ? lockedReason : c.promo_need_code} onPress={() => applyPromo(promoInput)} />
          </> : <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
            {/* Every credit the customer holds is offered: the first one alone hid the rest. */}
            {price >= 2 && credits.map(credit => <Press key={credit.code} accessibilityLabel={fill(c.useCredit, { r: money(credit.amount), code: credit.code })} onPress={() => applyPromo(credit.code)} disabled={locked || checking}>
              <Row gap={6} style={styles.chip}><Ionicons name="gift-outline" size={14} color={palette.olive} /><Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{fill(c.useCredit, { r: money(credit.amount), code: credit.code })}</Txt></Row>
            </Press>)}
            <Press accessibilityLabel={c.promoAdd} onPress={() => setPromoOpen(true)} disabled={locked}>
              <Row gap={6} style={styles.chip}><Ionicons name="pricetag-outline" size={14} color={palette.olive} /><Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{c.promoAdd}</Txt></Row>
            </Press>
          </View>)}
          {!promoOpen && !!promoError && <ErrorText>{promoError}</ErrorText>}
        </View>}
      </Card>

      <Card style={{ paddingBottom: 2 }}>{/* Field's own 12px bottom margin completes the 14px card padding */}
        <Field label={c.contact} icon="call-outline" value={contact} onChangeText={edit('contact', setContact)} placeholder={c.phoneHint} keyboardType="phone-pad" autoComplete="tel" error={invalid.contact} disabled={locked} maxLength={32}
          onSubmitEditing={submit} />
      </Card>
      <ErrorText>{error}</ErrorText>
    </Screen>

    {pinFor && <PinSheet title={word(pinFor === 'pickup' ? 'pickupOnMap' : 'dropoffOnMap')}
      start={(pinFor === 'pickup' ? (pickupPoint ?? gpsPoint) : dropoffPoint) ?? city(pinFor === 'pickup' ? pickupCity : dropoffCity)}
      onClose={() => setPinFor(null)} onConfirm={point => {
        const near = servedCity(point);
        if (!near) { setLocationError(c.pinOutsideArea); setPinFor(null); return; }
        haptic.success();
        if (pinFor === 'pickup') {
          if (near !== pickupCity) setPickupNote('');
          setPickupCity(near); setPickupPoint(point); setPickupChosen(true);
        } else {
          if (near !== dropoffCity) setDropoffNote('');
          setDropoffCity(near); setDropoffPoint(point); setDropoffChosen(true);
        }
        if (near !== (pinFor === 'pickup' ? pickupCity : dropoffCity)) setLocationError(fill(c.pinCityChanged, { city: city(near)[language] }));
        setPinFor(null);
      }} />}

    <CityPicker open={picker !== null && !locked} title={service === 'ride' ? (picker === 'pickup' ? c.pickup_ride : c.dropoff_ride) : picker === 'pickup' ? c.pickup : c.dropoff}
      places={places} onForget={id => confirm(c.forgetPlaceConfirm, () => api<Places>(`/me/places/${id}`, undefined, 'DELETE').then(setPlaces)
        .catch(e => { setPicker(null); setError(err(e)); }), c.forgetPlace, c.no)} // the sheet would hide the error
      onPlace={(id, note) => {
        haptic.tap();
        // A saved-place tap is explicit but must not silently drop a confirmed pin in the same city.
        if (picker === 'pickup') { setPickupCity(id); setPickupChosen(true); setPickupPoint(pickupCity === id ? pickupPoint : null); edit('pickupNote', setPickupNote)(note); }
        else { setDropoffCity(id); setDropoffChosen(true); setDropoffPoint(dropoffCity === id ? dropoffPoint : null); edit('dropoffNote', setDropoffNote)(note); }
        setPicker(null);
      }}
      onClose={() => setPicker(null)}
      selectedPlace={picker === 'pickup' ? (pickupChosen ? { city: pickupCity, note: pickupNote, point: pickupPoint } : null) : (dropoffChosen ? { city: dropoffCity, note: dropoffNote, point: dropoffPoint } : null)}
      outside={locationError === c.pinOutsideArea}
      text={{ label: c.searchLabel, empty: c.searchEmpty, offline: c.searchOffline, pinKept: c.searchPinKept, pinCleared: c.searchPinCleared, apply: c.searchApply }}
      near={picker === 'pickup' ? pickupPoint ?? city(pickupCity) : dropoffPoint ?? city(dropoffCity)}
      onConfirm={place => {
        haptic.tap();
        if (picker === 'pickup') { if (place.city !== pickupCity) setPickupNote(''); setPickupCity(place.city); setPickupChosen(true); setPickupPoint(place.point); if (place.note) edit('pickupNote', setPickupNote)(place.note); }
        else { if (place.city !== dropoffCity) setDropoffNote(''); setDropoffCity(place.city); setDropoffChosen(true); setDropoffPoint(place.point); if (place.note) edit('dropoffNote', setDropoffNote)(place.note); }
        setPicker(null);
      }} />
  </KeyboardAvoidingView>;
}

const placeIcons = { home: 'home-outline', work: 'briefcase-outline', other: 'star-outline' } as const;

// "Save to my places" under a landmark field: one tap reveals Home / Work / Other.
function SavePlace({ city: placeCity, note, saved, onSave }: { city: CityId; note: string; saved: SavedPlace[]; onSave: (label: SavedPlace['label'], city: CityId, note: string) => Promise<void> }) {
  const { c, row } = useCopy();
  const [open, setOpen] = useState(false);
  const trimmed = note.trim();
  if (!trimmed || saved.some(p => p.city === placeCity && p.note === trimmed)) return null;
  if (!open) return <Press accessibilityLabel={c.savePlace} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start', marginTop: -6, marginBottom: 8 }}>
    <Row gap={6} style={styles.chip}><Ionicons name="bookmark-outline" size={14} color={palette.olive} /><Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{c.savePlace}</Txt></Row>
  </Press>;
  return <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8, marginTop: -6, marginBottom: 8 }}>
    {(['home', 'work', 'other'] as const).map(label => <Press key={label} accessibilityLabel={`${c.savePlace}: ${c[`place_${label}`]}`}
      onPress={() => { setOpen(false); void onSave(label, placeCity, trimmed); }}>
      <Row gap={6} style={styles.chip}><Ionicons name={placeIcons[label]} size={14} color={palette.olive} /><Txt variant="label" style={{ color: palette.olive, fontSize: 12 }}>{c[`place_${label}`]}</Txt></Row>
    </Press>)}
  </View>;
}

// Bottom sheet with the customer's places and the T16 search panel (Arabic folding, pin-safe proposal).
function CityPicker({ open, title, onClose, places, onPlace, onForget, selectedPlace, outside, text, onConfirm, near }: { open: boolean; title: string; onClose: () => void;
  places: Places; onPlace: (id: CityId, note: string) => void; onForget: (id: number) => void; selectedPlace: PlaceCandidate | null;
  outside: boolean; text: PlaceSearchText; onConfirm: (place: PlaceCandidate) => void; near: Point }) {
  const { c, language } = useCopy();
  const [term, setTerm] = useState('');
  const insets = useSafeAreaInsets();
  // The keyboard never resizes a modal window: lift the sheet above it, leaving the sheet's own bottom inset behind the keyboard.
  return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} onShow={() => setTerm('')}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={-insets.bottom}>
      <Pressable style={styles.shade} onPress={onClose} accessibilityLabel={c.cancel} />
      <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.grip} />
        <Txt variant="h2" style={{ marginBottom: 10 }}>{title}</Txt>
        <ScrollView keyboardShouldPersistTaps="handled">
          {!term && (places.saved.length > 0 || places.recent.length > 0) && <>
            <Txt variant="label" style={{ marginTop: 6 }}>{c.yourPlaces}</Txt>
            {[...places.saved.map(p => ({ ...p, key: `s${p.id}` })), ...places.recent.map((p, i) => ({ ...p, key: `r${i}`, id: 0, label: 'recent' as const }))].map(p => {
              const name = p.label === 'recent' || p.label === 'other' ? p.note : c[`place_${p.label}`];
              return <Row key={p.key} gap={4} style={styles.sheetRow}>
                <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={name === p.note ? `${name}, ${city(p.city)[language]}` : `${name}, ${city(p.city)[language]}, ${p.note}`} onPress={() => onPlace(p.city, p.note)}>
                  <Row gap={12} style={{ minHeight: 56 }}>
                    <View style={styles.pin}><Ionicons name={p.label === 'recent' ? 'time-outline' : placeIcons[p.label]} size={15} color={palette.secondary} /></View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="title" numberOfLines={1}>{name}</Txt>
                      <Txt variant="micro" numberOfLines={1}>{p.label === 'recent' || p.label === 'other' ? city(p.city)[language] : `${city(p.city)[language]} · ${p.note}`}</Txt>
                    </View>
                  </Row>
                </Pressable>
                {p.label !== 'recent' && <IconButton icon="trash-outline" tone="muted" label={`${c.forgetPlace}: ${name}`} onPress={() => onForget(p.id)} />}
              </Row>;
            })}
          </>}
          <PlaceSearch saved={places.saved} selected={selectedPlace} outside={outside} text={text} onConfirm={onConfirm} onQuery={setTerm} near={near} />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  service: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 8 },
  serviceOn: { backgroundColor: palette.forest, borderColor: palette.forest },
  serviceText: { fontSize: 12, fontWeight: '700', color: palette.secondary, flexShrink: 1 },
  swap: { position: 'absolute', top: 20 },
  chip: { backgroundColor: palette.olivePale, borderRadius: 99, paddingHorizontal: 12, minHeight: 44 },
  promo: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hair },
  cash: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.olivePale, alignItems: 'center', justifyContent: 'center' },
  shade: { flex: 1, backgroundColor: '#0E1F1966' },
  sheet: { backgroundColor: palette.paper, maxHeight: '78%', paddingHorizontal: 16, paddingTop: 8, borderTopLeftRadius: 22, borderTopRightRadius: 22, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.line, marginBottom: 12 },
  searchBox: { alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 12, backgroundColor: palette.card, paddingHorizontal: 12, marginBottom: 6 },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15, color: palette.ink },
  sheetRow: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: palette.hair },
  pin: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
});
