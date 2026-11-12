import { deadlineMilliseconds } from '../api-clock';
// Route, service details, payment and one confirm action; uncertain submissions keep their identity.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, BackHandler, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { api, ApiError, apiSessionRevision, errorCode, storage, useApi } from '../api';
import { againForm, orderRequest, pendingKey, pendingOutcome, pendingReleasable, pendingSettlesAt, pickupForm, newBooking, readBooking, scheduleSlots, type PendingBooking, type PendingOutcome } from '../booking';
import { pickupErrorKey } from '../customer-location';
import { HERE_PICKUP_MS, pickupLocation, rememberedHere, rememberHere } from '../pickup-location';
import { city, CLOSED_MINUTES, isCity, isValidPhone, optionsFor, orderCode, quote, roadAlerts, services, servedCity, SLOW_MINUTES, smartPrice, type CityId, type Order, type Places, type Point, type PriceQuote, type Referral, type Road, type SavedPlace, type Service } from '../model';
import { roadPath } from '../map-math';
import { canShowOnRenderer, routeProvider } from '../map-provider';
import { MapSheet, SIDE_SHEET, useSideSheet } from '../map-sheet';
import { RouteLine, ServiceIcon, SlotPicker, useFormat } from '../parts';
import { SceneMap } from '../scene-map';
import { TripSearch, type TripField, type TripPlace } from '../trip-search';
import { RouteCheckpoints, type RoadRoute } from '../road';
import { useSession } from '../session';
import { emptyFreightDraft, freightDraftFromScope, freightScope } from '../freight-scope';
import { FreightScopeForm } from '../freight-details';
import { Button, Card, Choices, confirm, ErrorText, fill, Field, haptic, IconButton, palette, Press, Reason, Row, shadow, sheetShadow, Stepper, Txt, useCopy } from '../ui';

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
  const pickupNow = useRef({ city: pickupCity, chosen: pickupChosen }); // read when a slow GPS fix lands, not at the tap
  useEffect(() => { pickupNow.current = { city: pickupCity, chosen: pickupChosen }; }, [pickupCity, pickupChosen]);
  const [dropoffPoint, setDropoffPoint] = useState<Point | null>(null);
  // One map from search to request: `search` covers it, `pin` moves it under a fixed pin, `trip` draws the route.
  const [step, setStep] = useState<'search' | 'pin' | 'trip'>(isCity(params.from) && isCity(params.to) ? 'trip' : 'search');
  const [field, setField] = useState<TripField>('dropoff');
  const [pinFor, setPinFor] = useState<TripField>('dropoff');
  const [pinCenter, setPinCenter] = useState<Point | null>(null); // where the camera is sent; a drag moves pinPoint only
  const [pinPoint, setPinPoint] = useState<Point | null>(null);
  const [pinMoving, setPinMoving] = useState(false);
  const [pinLabel, setPinLabel] = useState<{ name: string; detail: string } | null>(null);
  const [pinNote, setPinNote] = useState(''); // a saved landmark keeps its words while its spot is confirmed
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [here, setHere] = useState<(Point & { accuracy?: number | null }) | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPeek, setSheetPeek] = useState(0);
  const [topBar, setTopBar] = useState(0);
  const [pinPanel, setPinPanel] = useState(0);
  const pickupTouched = useRef(isCity(params.from) || !!params.again); // the customer chose: GPS must not move it
  const [locating, setLocating] = useState(false);
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
  const fixMarked = useRef(false); // the banner is the fix-marked one, whatever the language
  const [swapNotice, setSwapNotice] = useState('');
  const [locationError, setLocationError] = useState('');
  useEffect(() => { if (locationError && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(locationError); }, [locationError]);
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
  const [copyFailed, setCopyFailed] = useState(false);
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
  const scheduledFor = pending ? pending.payload.scheduledFor ?? null : when === 'later' ? chosen : null;
  const wantsScope = service === 'freight' && me?.capabilities?.declaredScope === true;
  // An immediate load's window starts when its quote does: every re-quote (expiry, price change, retry) restarts it,
  // so the declared start is at most one quote lifetime old, not a half-hour bucket.
  const [quotedAt, setQuotedAt] = useState(() => Date.now());
  const windowStart = scheduledFor ?? Math.max(slotBucket.at, quotedAt); // shown and declared alike
  const declaredScope = useMemo(() => pending?.payload.declaredScope ?? (wantsScope ? freightScope(freight, windowStart, loadingHours) : undefined),
    [pending?.payload.declaredScope, wantsScope, freight, windowStart, loadingHours]);
  const scopeInvalid = wantsScope && declaredScope === null;
  const sending = useRef(false);
  const savedKey = pendingKey(me!.user.id);
  const releasable = pendingReleasable(outcome);
  const enabledServices = me?.capabilities?.enabledServices ?? ['parcel'];
  const available = enabledServices.includes(service);
  const locked = busy || !!pending || !ready || locating || !available;
  const [storageAttempt, setStorageAttempt] = useState(0); // a failed read of the saved booking fails closed, and can be asked again
  const retryStorage = () => { setReady(false); setCopyFailed(false); setError(''); setStorageAttempt(attempt => attempt + 1); };
  const [refreshingAvailability, setRefreshingAvailability] = useState(false);
  async function retryAvailability() {
    if (refreshingAvailability || busy || sending.current || pending) return;
    setRefreshingAvailability(true); setError('');
    try { await refresh(true); if (alive.current) requote(); }
    catch (e) { if (alive.current) setError(err(e)); }
    finally { if (alive.current) setRefreshingAvailability(false); }
  }
  // Per-field problems, shown under each field; cleared as soon as that field is edited.
  const [invalid, setInvalid] = useState<Partial<Record<'pickupNote' | 'dropoffNote' | 'detail' | 'contact' | 'recipientPhone', string>>>({});
  const scrollRef = useRef<ScrollView>(null);
  const [promo, setPromo] = useState<{ code: string; discount: number; price: number } | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [checking, setChecking] = useState(false);
  const [credits, setCredits] = useState<Referral['credits']>([]);
  const edit = (key: keyof typeof invalid, set: (v: string) => void) => (v: string) => {
    set(v);
    if (!invalid[key]) return;
    const next = { ...invalid, [key]: undefined };
    setInvalid(next);
    if (fixMarked.current && !Object.values(next).some(Boolean)) { fixMarked.current = false; setError(''); } // the header banner goes with the last marked field (A53, 8 Nov)
  };
  // Saved and recent places: landmarks are the address here, so reuse them instead of retyping.
  const isCustomer = me?.user.role === 'customer';
  const [places, setPlaces] = useState<Places>({ saved: [], recent: [] });
  useEffect(() => { if (isCustomer) api<Places>('/me/places').then(setPlaces).catch(() => undefined); }, [isCustomer]);
  useEffect(() => { if (isCustomer) api<Referral>('/me/referral').then(r => setCredits(r.credits)).catch(() => undefined); }, [isCustomer]);
  const [roads, setRoads] = useState<Road[]>([]);
  useEffect(() => { api<Road[]>('/roads').then(setRoads).catch(() => undefined); }, []);
  const alerts = roadAlerts(roads, pickupCity, dropoffCity);
  // The booking map is the baseline renderer, so its line is the free OSRM route; the provenance guard stays.
  // Money never reads it: fares, feasibility and the servedCity bound stay on the server's /price and /orders policy.
  const previewFrom = pickupPoint ?? city(pickupCity), previewTo = dropoffPoint ?? city(dropoffCity);
  const osrmPreview = useApi<RoadRoute>(routeChosen ? roadPath(previewFrom, previewTo, 5) : null);
  const preview = osrmPreview.data && canShowOnRenderer(routeProvider(osrmPreview.data.provider), 'maplibre') ? osrmPreview.data : undefined;
  const savePlace = (label: SavedPlace['label'], placeCity: CityId, note: string) => api<Places>('/me/places', { label, city: placeCity, note: note.trim() })
    .then(next => { setPlaces(next); haptic.success(); AccessibilityInfo.announceForAccessibility(c.placeSaved); }).catch(e => setError(err(e)));

  const describe = (point: Point) => api<{ name: string; detail: string }>(`/places/reverse?at=${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}&lang=${language}`);
  // Where the customer is becomes the pickup until they choose another, like every ride app. A note they typed stays.
  const adoptFix = (fix: { city: CityId; point: Point; accuracy: number }) => {
    setPickupCity(fix.city); setPickupChosen(true); setPickupPoint(fix.point); setGpsPoint(fix.point);
    setPickupNote(note => pickupNow.current.chosen && fix.city !== pickupNow.current.city ? '' : note);
    // The driver always gets words with the pin: the street or place if we know it, else the town.
    const town = city(fix.city)[language];
    void describe(fix.point).then(label => setPickupNote(note => note || label.name || town)).catch(() => setPickupNote(note => note || town));
  };
  async function locate() {
    locationRequest.current?.abort();
    const request = new AbortController();
    locationRequest.current = request;
    setLocating(true);
    setLocationError('');
    try {
      // Permission setup shares the timeout: dismissing/backgrounding a native
      // prompt must not leave the booking form locked indefinitely.
      const result = await pickupLocation(request.signal);
      if (request.signal.aborted) return;
      setHere({ ...result.point, accuracy: result.accuracy }); void rememberHere(result.point);
      if (step === 'pin') { setPinCenter(result.point); setPinPoint(result.point); setPinMoving(false); } // a place the customer still has to confirm; on a destination pin it says nothing about the pickup
      if (step !== 'pin' || pinFor === 'pickup') { pickupTouched.current = true; setPickupNote(''); adoptFix(result); }
      if (step === 'search') { setField('dropoff'); if (dropoffChosen) setStep('trip'); }
    } catch (e) {
      if (!request.signal.aborted) setLocationError(c[pickupErrorKey(e)]);
    } finally { if (!request.signal.aborted) setLocating(false); }
  }
  // Opening the screen reuses consent already given, silently; only the customer's own tap may raise the system prompt.
  const quietFix = (fix: { city: CityId; point: Point; accuracy: number }) => {
    setPickupNote('');
    adoptFix(fix);
    if (step === 'search' && dropoffChosen) { setField('dropoff'); setStep('trip'); } // they were asked for a pickup and now have one
  };
  const firstFix = useRef(quietFix);
  useEffect(() => { firstFix.current = quietFix; });
  useEffect(() => {
    const request = new AbortController();
    void rememberedHere().then(known => {
      if (!known || request.signal.aborted) return;
      const point = { latitude: known.latitude, longitude: known.longitude };
      setHere(current => current ?? point);
      // A position from a minute ago beats asking where they are; the fresh fix below replaces it.
      const served = servedCity(point);
      if (served && !pickupTouched.current && Date.now() - known.at <= HERE_PICKUP_MS) firstFix.current({ city: served, point, accuracy: 0 });
    });
    pickupLocation(request.signal, false).then(fix => {
      if (request.signal.aborted) return;
      setHere({ ...fix.point, accuracy: fix.accuracy }); void rememberHere(fix.point);
      if (!pickupTouched.current) firstFix.current(fix);
    }).catch(() => undefined);
    return () => request.abort();
  }, []);

  const applyPlace = (which: TripField, place: TripPlace) => {
    locationRequest.current?.abort(); setLocating(false);
    if (which === 'pickup') pickupTouched.current = true;
    if (!place.point) { // a town or a saved landmark: confirm the spot on the map, keeping its words
      setPinFor(which); setPinNote(place.note); setPinCenter(city(place.city)); setPinPoint(city(place.city)); setPinLabel(null); setStep('pin');
      return;
    }
    if (which === 'pickup') {
      setPickupCity(place.city); setPickupPoint(place.point); setPickupChosen(true); edit('pickupNote', setPickupNote)(place.note);
      if (dropoffChosen) setStep('trip'); else { setField('dropoff'); setStep('search'); }
    } else {
      setDropoffCity(place.city); setDropoffPoint(place.point); setDropoffChosen(true); edit('dropoffNote', setDropoffNote)(place.note);
      if (pickupChosen) setStep('trip'); else { setField('pickup'); setStep('search'); }
    }
  };
  const openPin = (which: TripField) => {
    locationRequest.current?.abort(); setLocating(false);
    if (which === 'pickup') pickupTouched.current = true;
    const chosen = which === 'pickup' ? (pickupChosen ? pickupPoint : null) : (dropoffChosen ? dropoffPoint : null);
    const start = chosen ?? here ?? (which === 'dropoff' && pickupChosen ? previewFrom : city(which === 'pickup' ? pickupCity : dropoffCity));
    const at = { latitude: start.latitude, longitude: start.longitude };
    setPinFor(which); setPinNote(''); setPinCenter(at); setPinPoint(at); setPinLabel(null); setLocationError(''); setStep('pin');
  };
  const pinServed = pinPoint ? servedCity(pinPoint) : null;
  useEffect(() => {
    if (step !== 'pin' || !pinPoint || pinMoving) return;
    let live = true;
    const timer = setTimeout(() => {
      describe(pinPoint).then(label => { if (live) setPinLabel(label); }).catch(() => { if (live) setPinLabel(null); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- describe only closes over the language, which re-renders this anyway
  }, [step, pinPoint, pinMoving, language]);
  function confirmPinSpot() {
    if (locating || !mapReady || !pinPoint || !pinServed || pinMoving) return;
    haptic.success();
    const note = pinNote || pinLabel?.name || city(pinServed)[language];
    setPinNote('');
    applyPlace(pinFor, { city: pinServed, point: pinPoint, note });
  }
  useEffect(() => {
    const leave = () => {
      if (step === 'pin') { setStep(routeChosen ? 'trip' : 'search'); return true; }
      if (step === 'search' && routeChosen) { setStep('trip'); return true; }
      if (step === 'trip' && sheetOpen) { setSheetOpen(false); return true; }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', leave);
    return () => subscription.remove();
  }, [step, routeChosen, sheetOpen]);

  // Read-only reconciliation uses the exact command receipt, never mutable order details.
  const checkPending = useCallback(async (command: PendingBooking) => {
    const revision = apiSessionRevision();
    const current = () => alive.current && revision === apiSessionRevision();
    if (!current() || reading.current || settled.current) return;
    reading.current = true;
    setResolving(true);
    try {
      const answer = pendingOutcome(await api<{ orderId: number | null }>(`/orders/commands/${encodeURIComponent(command.requestId)}`), command);
      const held = latest.current;
      // Only apply an answer about the attempt this screen still holds: a late reply must not act for another account.
      if (!current() || settled.current || held?.requestId !== command.requestId || held?.attemptedAt !== command.attemptedAt) return;
      setOutcome(answer);
      if (answer.state === 'present') {
        settled.current = true;
        await storage.set(savedKey, null, true).catch(() => {}); // a retained successful command safely re-finds this order
        if (!current()) return;
        latest.current = null;
        setPending(null);
        router.replace(`/order/${answer.orderId}`);
      }
    } catch {
      if (current() && !settled.current) setOutcome({ state: 'unknown' }); // a failed check never unlocks editing
    } finally {
      reading.current = false;
      if (alive.current) setResolving(false); // a same-account revision bump must not leave the form locked
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
      setCopyFailed(false);
      if (existing) {
        const p = existing.payload;
        latest.current = existing;
        setPending(existing); setService(p.service); setPickupCity(p.pickupCity); setDropoffCity(p.dropoffCity);
        setPickupChosen(true); setDropoffChosen(true); setStep('trip'); pickupTouched.current = true;
        setPickupPoint(p.pickupPoint); setDropoffPoint(p.dropoffPoint ?? null); setPickupNote(p.pickupNote); setDropoffNote(p.dropoffNote);
        setContact(p.contact); setDetail(p.detail); setOption(p.option); setLoadingHelp(p.loadingHelp);
        if (p.declaredScope) {
          setFreight(freightDraftFromScope(p.declaredScope));
          setLoadingHours((p.declaredScope.loadingBefore - p.declaredScope.loadingAfter) / 3_600_000);
        }
        setRecipientName(p.recipientName ?? ''); setRecipientPhone(p.recipientPhone ?? '');
        setWhen(p.scheduledFor ? 'later' : 'now'); setSlot(p.scheduledFor ?? null); // a retried booking keeps its time
        void checkPending(existing);
      } else if (params.again && copied.current !== `${params.again}:${params.keep}`) {
        // Order again (SPEC-order-again.md): an in-flight pending booking above always wins over the old order.
        // Missing, foreign or offline: an empty form, and it says so rather than look like the old route was copied.
        const old = await api<Order>(`/orders/${encodeURIComponent(params.again)}`).catch(() => { if (mounted) { setCopyFailed(true); setError(c.orderAgainFailed); } return null; });
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
          setPickupChosen(true); setDropoffChosen(true); setStep('trip');
        }
        if (old) copied.current = `${params.again}:${params.keep}`;
      }
      setReady(true);
    }).catch(() => { if (mounted) setError(c.bookingStorageError); });
    return () => { mounted = false; };
  }, [savedKey, checkPending, c.bookingStorageError, c.orderAgainFailed, params.again, params.keep, storageAttempt]);

  // An unknown answer becomes a real absence at the command's deadline: check again then, so Edit and Discard unlock by themselves.
  const settlesAt = pending && outcome?.state === 'unknown' ? pendingSettlesAt(pending) : null;
  // A check that fails at the deadline (offline) keeps trying every 15 s until the answer is no longer unknown.
  useEffect(() => {
    if (!pending || settlesAt === null) return;
    let again: ReturnType<typeof setInterval> | undefined;
    const timer = setTimeout(() => {
      void checkPending(pending);
      again = setInterval(() => { void checkPending(pending); }, 15_000);
    }, Math.max(0, settlesAt - Date.now()) + 1_000);
    return () => { clearTimeout(timer); clearInterval(again); };
  }, [pending, settlesAt, checkPending]);

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
  const [quoted, setQuoted] = useState<{ key: string; quote: PriceQuote | null; error?: unknown } | null>(null);
  useEffect(() => {
    if (!isCustomer || pending || !routeChosen || scopeInvalid) return; // a pending booking keeps its complete terms
    let live = true;
    const timer = setTimeout(() => api<PriceQuote>('/price', { service, option, loadingHelp, pickupCity, dropoffCity,
      ...(pickupPoint && { pickupPoint }), ...(dropoffPoint && { dropoffPoint }), ...(declaredScope && { declaredScope }), ...(scheduledFor !== null && { scheduledFor }) })
      .then(quote => { if (live) setQuoted({ key: priceKey, quote }); }, error => { if (live) setQuoted({ key: priceKey, quote: null, error }); }), 300);
    return () => { live = false; clearTimeout(timer); };
  }, [isCustomer, pending, routeChosen, priceKey, service, option, loadingHelp, pickupCity, dropoffCity, pickupPoint, dropoffPoint, scheduledFor, scopeInvalid, declaredScope]);
  const quoting = isCustomer && !pending && routeChosen && !scopeInvalid && quoted?.key !== priceKey; // the Request button waits for it
  const quoteFailed = isCustomer && !pending && routeChosen && quoted?.key === priceKey && quoted.quote === null;
  const smart = quoted?.key === priceKey ? quoted.quote : null;
  const [, expireQuoteEta] = useState(0);
  useEffect(() => {
    const eta = smart?.eta;
    if (!eta) return;
    const remaining = deadlineMilliseconds(eta.validity.expiresAt, eta);
    if (!remaining) return;
    const timer = setTimeout(() => expireQuoteEta(value => value + 1), remaining + 1);
    return () => clearTimeout(timer);
  }, [smart?.eta]);
  const quoteMinutes = !smart ? null : smart.eta
    ? deadlineMilliseconds(smart.eta.validity.expiresAt, smart.eta) > 0 ? `${Math.ceil(smart.eta.minSeconds / 60)}–${Math.ceil(smart.eta.maxSeconds / 60)}` : null
    : smart.minutes;

  const price = pending?.payload.quotedPrice ?? smart?.price ?? quote(settings, { service, pickupCity, dropoffCity, option, loadingHelp, shared: false, plus });
  const reasons = smart && [quoteMinutes !== null && fill(c.tripSize, { min: `${smart.estimated ? '≈ ' : ''}${quoteMinutes}` }) /* the km sits in the route card above */, smart.night && c.nightRate,
    ...smart.slow.map(name => fill(c.slowDelay, { name, m: SLOW_MINUTES })), ...smart.closed.map(name => fill(c.closedDelay, { name, m: CLOSED_MINUTES }))]
    .filter(Boolean).join(' · ');
  // A checked code holds for the fare it was checked against; the server re-checks it on booking.
  const applied = pending ? (pending.payload.promoCode ? { code: pending.payload.promoCode, discount: pending.payload.expectedDiscount ?? 0 } : null)
    : promo && promo.price === price ? promo : null;
  const pay = price - (applied?.discount ?? 0);
  const submitBlocked = !ready || locating || (!!pending && resolving) || (!pending && (quoting || quoteFailed || checking || !available));
  const promoBlocked = locked || !routeChosen || scopeInvalid || quoting || quoteFailed;
  async function applyPromo(code: string) {
    const revision = apiSessionRevision();
    const current = () => alive.current && revision === apiSessionRevision();
    if (!current() || promoBlocked || checking || !code.trim()) return;
    setChecking(true); setPromoError('');
    try {
      const r = await api<{ code: string; discount: number }>('/promos/check', { code, price });
      if (!current()) return;
      setPromo({ ...r, price }); setPromoInput(''); haptic.success();
      AccessibilityInfo.announceForAccessibility(fill(c.promoApplied, { code: r.code, d: money(r.discount) }));
    } catch (e) { if (current()) { haptic.error(); setPromo(null); setPromoError(err(e)); } } finally { if (alive.current) setChecking(false); }
  }

  function switchService(next: Service) {
    haptic.tap();
    setService(next);
    setOption(optionsFor(next)[0]);
    setLoadingHelp(false);
    setError('');
    setSwapNotice('');
    setInvalid({});
  }

  async function submit() {
    if (!alive.current || submitBlocked || sending.current) return;
    const revision = apiSessionRevision();
    const current = () => alive.current && revision === apiSessionRevision();
    if (!pending && scopeInvalid) { setError(c.freightScopeInvalid); return; }
    if (!pending && !routeChosen) { setField(pickupChosen ? 'dropoff' : 'pickup'); setStep('search'); return; }
    if (!pending && scheduledFor !== null && scheduledFor < Date.now() + 60 * 60_000) { // the form sat open past the slot
      const at = Date.now();
      haptic.error(); setSlot(null); setSlotBucket({ bucket: Math.floor(at / (30 * 60_000)), at });
      setError(c.err_invalid_schedule); setSheetOpen(true); return;
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
      if (error === c.fixMarked && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(c.fixMarked); // the same text again changes nothing for ErrorText to announce
      setError(c.fixMarked); fixMarked.current = true;
      setSheetOpen(true);
      // The details sit near the top; the contact field is right above the button.
      if (problems.pickupNote || problems.dropoffNote || problems.detail || problems.recipientPhone) scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setInvalid({});
    sending.current = true;
    setBusy(true);
    setError(''); fixMarked.current = false; // any later error is not the fix-marked banner
    const retrying = !!pending;
    let saved = retrying; // a pending command is already on the device
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
      if (!current()) return; // the saved command remains with its original account, never POSTed as the next one
      latest.current = command;
      setPending(command);
      const order = await api<Order>('/orders', orderRequest(command));
      if (!current()) return;
      settled.current = true;
      latest.current = null;
      await storage.set(savedKey, null, true).catch(() => {}); // a retained successful command safely replays
      if (!current()) return;
      haptic.success();
      router.replace(`/order/${order.id}`);
    } catch (e) {
      if (!current()) return;
      haptic.error();
      setSheetOpen(true);
      // Once the command is persisted, a transport failure is "saved, awaiting connection" —
      // the pending card below is already on screen. A failed write never claims it was saved.
      // A lost connection is ApiError('network'); a plain Error is a failed storage write.
      if (!(e instanceof ApiError) || errorCode(e) === 'network') {
        setError(saved ? c.bookingOfflineSaved : c.bookingStorageError);
        if (saved && latest.current) void checkPending(latest.current); // an unknown answer arms the deadline re-check
      } else {
        setError(err(e));
        if (e.status && e.status < 500 && ![401, 408, 426, 429].includes(e.status) && errorCode(e) !== 'idempotency_conflict'
          && !retrying && errorCode(e) !== 'booking_command_expired') {
          try { await storage.set(savedKey, null, true); if (!current()) return; latest.current = null; setPending(null); setOutcome(null); }
          catch { if (current()) setError(c.bookingStorageError); }
        // Anything else may have committed (a retry refusal says nothing about an earlier POST): only the receipt and deadline settle it.
        } else if (latest.current) void checkPending(latest.current);
      }
      if (!retrying && errorCode(e) === 'price_changed') { await refresh(); if (!current()) return; requote(); } // new tariff or road state: customer confirms again
      if (!current()) return;
      if (!retrying && ['quote_expired', 'quote_consumed', 'itinerary_changed', 'quote_not_found'].includes(errorCode(e) ?? '')) requote();
      if (!retrying && ['invalid_promo', 'promo_used', 'invite_first_order_only'].includes(errorCode(e) ?? '')) {
        setPromo(null);
        api<Referral>('/me/referral').then(r => { if (current()) setCredits(r.credits); }).catch(() => undefined); // a used credit leaves the chip
      }
      if (!retrying && errorCode(e) === 'promo_changed' && applied) void applyPromo(applied.code); // show the new discount, customer confirms again
    } finally { sending.current = false; if (alive.current) setBusy(false); } // busy flags clear while mounted; only data writes are revision-gated
  }

  /** Drop a command the server has confirmed absent. Edit keeps the draft; discard leaves the form. */
  async function release(edit: boolean) {
    const revision = apiSessionRevision();
    const current = () => alive.current && revision === apiSessionRevision();
    if (!current() || !pending || busy || sending.current || !releasable) return;
    haptic.tap();
    try {
      await storage.set(savedKey, null, true);
      if (!current()) return;
      latest.current = null;
      setPending(null); setOutcome(null); setError('');
      if (!edit) router.replace('/');
    } catch { if (current()) setError(c.bookingStorageError); }
  }

  const located = !!pickupPoint && pickupPoint === gpsPoint;
  // Why Request waits, or what to do first (design §5, §10). Price shows only once it is quoted for this form: never dots or a guess.
  const requestReason = !ready ? c.form_loading : locating ? c.locating : !routeChosen ? c.quote_pick_route : scopeInvalid ? c.freightScopeInvalid : quoting ? c.quote_calculating : quoteFailed ? (quoted?.error instanceof ApiError && quoted.error.status !== undefined && quoted.error.status >= 400 && quoted.error.status < 500 && ![401, 408, 429].includes(quoted.error.status) ? err(quoted.error) : c.quote_failed)
    : checking ? c.promo_checking : !available && !pending ? c.serviceUnavailable : null;
  // The form-wide lock (promo and checks wait on it): the same sentence as the Request button, never a silent grey control.
  const lockedReason = !available ? c.serviceUnavailable : locating ? c.locating : busy || !!pending ? c.wait_busy : c.form_loading;
  const promoReason = promoBlocked ? requestReason ?? lockedReason : undefined;
  const pickupTitle = !pickupChosen ? '' : located ? c.pickupHere : pickupNote.trim() || city(pickupCity)[language];
  const dropoffTitle = !dropoffChosen ? '' : dropoffNote.trim() || city(dropoffCity)[language];
  const estimate = (s: Service) => s === service ? (smart && !quoting ? smart.price : null)
    : preview ? smartPrice(settings, { service: s, option: optionsFor(s)[0], km: preview.km, minutes: preview.minutes, delayMinutes: 0, at: slotBucket.at, plus }) : null;
  const minutes = quoteMinutes ?? preview?.minutes ?? null;
  const swapStops = () => { // the landmark belongs to its place, so it travels with it
    haptic.tap(); setPickupCity(dropoffCity); setDropoffCity(pickupCity); setPickupPoint(dropoffPoint); setDropoffPoint(pickupPoint);
    setPickupChosen(dropoffChosen); setDropoffChosen(pickupChosen); pickupTouched.current = true;
    setPickupNote(dropoffNote); setDropoffNote(pickupNote); setInvalid({ ...invalid, pickupNote: invalid.dropoffNote, dropoffNote: invalid.pickupNote });
    setSwapNotice(fill(c.swapDone, { from: dropoffTitle, to: pickupTitle }));
  };
  const edit_ = (which: TripField) => { if (locked) return; haptic.tap(); setSwapNotice(''); setField(which); setStep('search'); };
  const camera = step === 'pin' ? pinCenter ?? previewFrom : here ?? previewFrom;
  const side = useSideSheet();
  return <View style={{ flex: 1, backgroundColor: palette.paper }}>
    <View style={StyleSheet.absoluteFill} accessibilityElementsHidden={step === 'search'} importantForAccessibility={step === 'search' ? 'no-hide-descendants' : 'auto'} aria-hidden={step === 'search'}>
    <SceneMap fill mode={step === 'pin' ? 'pin' : step === 'trip' && routeChosen ? 'route' : 'browse'} center={{ latitude: camera.latitude, longitude: camera.longitude }} zoom={15}
      pickup={routeChosen ? previewFrom : null} dropoff={routeChosen ? previewTo : null} road={preview?.line} closed={preview?.closed} user={here}
      insets={step === 'pin' ? { bottom: pinPanel } : { top: topBar, bottom: sheetPeek, ...(side && (rtl ? { left: SIDE_SHEET } : { right: SIDE_SHEET })) }} padding={40}
      labels={step === 'trip' && routeChosen ? { pickup: pickupTitle, dropoff: dropoffTitle } : null}
      eta={step === 'trip' && routeChosen && minutes !== null ? fill(c.minutesShort, { m: minutes }) : null}
      label={step === 'pin' ? `${pinFor === 'pickup' ? c.setPickupTitle : c.setDropoffTitle}. ${c.pinHint}` : routeChosen ? `${c.routeOnMap}: ${pickupTitle} → ${dropoffTitle}` : c.pinHint}
      onMoving={() => { setPinMoving(true); setPinLabel(null); }} onGesture={() => { locationRequest.current?.abort(); if (pinFor === 'pickup') pickupTouched.current = true; setLocating(false); setPinMoving(true); setPinLabel(null); setLocationError(''); }}
      onCenter={point => { setPinPoint(point); setPinMoving(false); }}
      onReady={() => { setMapReady(true); setMapFailed(false); }} onFail={() => { setMapReady(false); setMapFailed(true); }} />
    </View>

    {step === 'trip' && <SafeAreaView edges={['top']} pointerEvents="box-none" style={[styles.topBar, side && (rtl ? { left: SIDE_SHEET, right: 0 } : { right: SIDE_SHEET })]} onLayout={e => setTopBar(Math.ceil(e.nativeEvent.layout.height))}>
      <View style={[styles.topCard, shadow, { flexDirection: row }]}>
        <IconButton icon={rtl ? 'arrow-forward' : 'arrow-back'} label={c.back} tone="muted" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
        <View style={{ flex: 1 }}>
          <RouteLine from={pickupTitle || c.whereFrom} to={dropoffTitle || c.whereTo} onFrom={locked ? undefined : () => edit_('pickup')} onTo={locked ? undefined : () => edit_('dropoff')} ride={service === 'ride'} />
        </View>
        <IconButton icon="swap-vertical" label={c.swap} tone="muted" disabled={locked} onPress={swapStops} />
      </View>
    </SafeAreaView>}

    {step === 'pin' && <>
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.pinTop}>
        <View style={{ flexDirection: row }}><IconButton icon={rtl ? 'arrow-forward' : 'arrow-back'} label={c.back} onPress={() => setStep(routeChosen ? 'trip' : 'search')} /></View>
      </SafeAreaView>
      <View style={[styles.locate, rtl ? { left: 16 } : { right: 16 }, { bottom: pinPanel + 14 }]}>
        <IconButton icon={locating ? 'hourglass-outline' : 'locate'} label={c.useLocation} disabled={locating} onPress={() => { void locate(); }} />
      </View>
      <SafeAreaView edges={['bottom']} style={styles.pinPanel} onLayout={e => setPinPanel(Math.ceil(e.nativeEvent.layout.height))}>
        <Txt variant="micro">{pinFor === 'pickup' ? c.setPickupTitle : c.setDropoffTitle}</Txt>
        <View accessibilityLiveRegion="polite" style={{ minHeight: 50, justifyContent: 'center', marginBottom: 8 }}>
          {pinMoving ? <ActivityIndicator color={palette.olive} style={{ alignSelf: rtl ? 'flex-end' : 'flex-start' }} />
            : !pinServed ? <Txt variant="title">{c.pinOutsideArea}</Txt>
            : <>
              <Txt variant="h2" numberOfLines={1}>{pinNote || pinLabel?.name || city(pinServed)[language]}</Txt>
              {!!(pinLabel?.detail || pinNote) && <Txt variant="caption" numberOfLines={1}>{pinNote ? pinLabel?.name : pinLabel?.detail}</Txt>}
            </>}
        </View>
        {!!locationError && <Txt variant="caption" style={{ marginBottom: 8 }}>{locationError}</Txt>}
        {Platform.OS !== 'web' && [c.locationPermissionBlocked, c.locationInaccurate, c.locationServicesDisabled].includes(locationError) &&
          <Button title={c.presence_open_settings} variant="ghost" onPress={() => { void (Platform.OS === 'android' && locationError === c.locationServicesDisabled ? Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS') : Linking.openSettings()).catch(() => setLocationError(c.locationSettingsFailed)); }} />}
        {mapFailed ? <Txt variant="caption" style={{ marginBottom: 8 }}>{c.pinUnavailable}</Txt>
          : <Button title={pinFor === 'pickup' ? c.confirmPickupSpot : c.confirmDropoffSpot} disabled={locating || !mapReady || pinMoving || !pinServed} reason={!mapReady ? c.pin_wait : undefined} onPress={confirmPinSpot} />}
        <Button title={c.searchLabel} variant="ghost" onPress={() => { locationRequest.current?.abort(); setLocating(false); setField(pinFor); setStep('search'); }} />
      </SafeAreaView>
    </>}

    {step === 'trip' && <MapSheet open={sheetOpen} onOpenChange={setSheetOpen} onPeek={setSheetPeek} scrollRef={scrollRef}
      header={<View style={{ paddingBottom: 8 }}>
        {!!swapNotice && <View accessibilityLiveRegion="polite" style={{ marginBottom: 8 }}><Txt variant="caption">{swapNotice}</Txt></View>}
        {pending && <Card tone="clay">
          <Txt variant="title">{c.bookingPending}</Txt>
          <Txt variant="caption">{c.bookingRetryHint}</Txt>
          <View accessibilityLiveRegion="polite"><Txt variant="caption" style={{ marginTop: 4 }}>{resolving ? c.bookingRecoveryChecking : releasable ? c.bookingRecoveryAbsent : settlesAt !== null ? fill(c.bookingRecoveryUntil, { t: time(settlesAt) }) : c.bookingRecoveryUnknown}</Txt></View>
          {!!pending.payload.scheduledFor && <Txt variant="label" style={{ marginTop: 4 }}>{fill(c.scheduledFor, { t: time(pending.payload.scheduledFor) })}</Txt>}
          <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <Button title={c.retry} size="sm" variant="soft" onPress={submit} loading={busy} disabled={submitBlocked} />
            <Button title={c.bookingEdit} size="sm" variant="soft" disabled={!releasable || busy || resolving} onPress={() => { void release(true); }} />
            <Button title={c.bookingDiscard} size="sm" variant="ghost" disabled={!releasable || busy || resolving} onPress={() => { void release(false); }} />
          </Row>
          {!releasable && !resolving && <Reason>{c.bookingRecoveryWait}</Reason>}
        </Card>}
        {/* In the header, not after the last field: a refused retry or offline save must read beside its card (review 8 Nov). */}
        <ErrorText>{error}</ErrorText>
        {!available && !pending && <Card tone="clay">
          <Txt variant="title">{c.serviceUnavailable}</Txt>
          <Button title={c.retry} variant="soft" loading={refreshingAvailability} onPress={retryAvailability} />
          <Button title={c.help} variant="ghost" onPress={() => router.push('/help')} />
        </Card>}
        {copyFailed && !pending && <Button title={c.retry} variant="soft" onPress={retryStorage} />}
        {!ready && error && <Button title={c.retry} variant="soft" onPress={retryStorage} />}
        {!ready && error && <Button title={c.help} variant="ghost" onPress={() => router.push('/help')} />}
        {copiedFrom !== null && !pending && <Txt variant="caption" style={{ marginBottom: 12 }}>{fill(sameFrom ? c.sendAnotherFrom : c.orderAgainFrom, { code: orderCode(copiedFrom) })}</Txt>}

        {services.filter(s => enabledServices.includes(s)).map(s => {
          const on = s === service, value = estimate(s), approx = on || s === 'parcel' ? '' : '≈ '; // TalkBack hears the estimate mark too
          return <Press key={s} disabled={busy || !!pending || !ready || locating} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={value !== null ? `${c[s]}, ${approx}${money(value)}` : c[s]} onPress={() => switchService(s)}
            style={[styles.service, { flexDirection: row }, on && styles.serviceOn]}>
            <ServiceIcon service={s} size={36} />
            <View style={{ flex: 1 }}>
              <Txt variant="title" numberOfLines={1}>{c[s]}</Txt>
              {on && minutes !== null && <Txt variant="micro" numberOfLines={1}>{`${smart?.estimated ? '≈ ' : ''}${fill(c.minutesShort, { m: minutes })}${preview ? ` · ${preview.km} ${c.km}` : ''}`}</Txt>}
            </View>
            {on && quoting ? <ActivityIndicator size="small" color={palette.olive} /> : value !== null && <Txt variant="title">{`${approx}${money(value)}`}</Txt>}
          </Press>;
        })}
        {scheduledFor !== null && <Press accessibilityLabel={`${c.whenTitle}: ${time(scheduledFor)}`} onPress={() => setSheetOpen(true)}>
          <Row gap={8} style={{ minHeight: 48 }}>
            <Ionicons name="calendar-outline" size={16} color={palette.olive} />
            <Txt variant="label" style={{ flex: 1 }}>{fill(c.scheduledFor, { t: time(scheduledFor) })}</Txt>
          </Row>
        </Press>}
      </View>}
      footer={pending ? undefined : <>
        <Button title={scheduledFor !== null ? c.scheduleRequest : c.request} trailing={routeChosen && !quoting && !quoteFailed && !scopeInvalid ? money(pay) : undefined}
          onPress={submit} loading={busy} disabled={submitBlocked || scopeInvalid} />
        {requestReason && <Reason>{requestReason}</Reason>}
        {quoteFailed && <Button title={c.retry} variant="ghost" onPress={requote} />}
      </>}>
      <RouteCheckpoints avoids={preview?.avoids ?? []} through={preview?.through ?? []} />
      {!!locationError && <Txt variant="caption" style={{ marginBottom: 8 }}>{locationError}</Txt>}
      {routeChosen && alerts.length > 0 && <View accessibilityLiveRegion="polite"><Card tone="clay">
        <Row gap={8} style={{ marginBottom: 6 }}><Ionicons name="warning-outline" size={18} color={palette.clayInk} /><Txt variant="title" style={{ flex: 1 }}>{c.roadAlert}</Txt></Row>
        {alerts.map(r => <Txt key={r.id} variant="caption">{`${r.name}: ${c[`road_${r.status!}`]}${r.note ? ` · ${r.note}` : ''}`}</Txt>)}
        <Button title={c.roads} variant="ghost" size="sm" icon="trail-sign-outline" onPress={() => router.push('/roads')} />
      </Card></View>}


      <Card>
        {/* What it is comes first: it is the one thing a map cannot fill in. */}
        <Field label={c[`${service}Detail`]} value={detail} onChangeText={edit('detail', setDetail)} placeholder={c[`${service}Hint`]} multiline error={invalid.detail} disabled={locked} maxLength={500} />
        <Field label={word('pickupNote')} icon="flag-outline" value={pickupNote} onChangeText={edit('pickupNote', setPickupNote)} placeholder={c.pickupHint} error={invalid.pickupNote} disabled={locked} maxLength={200} />
        {isCustomer && pickupChosen && !locked && <SavePlace city={pickupCity} note={pickupNote} saved={places.saved} onSave={savePlace} />}
        <Field label={word('dropoffNote')} icon="location-outline" value={dropoffNote} onChangeText={edit('dropoffNote', setDropoffNote)} placeholder={c.dropoffHint} error={invalid.dropoffNote} disabled={locked} maxLength={200} />
        {isCustomer && dropoffChosen && !locked && <SavePlace city={dropoffCity} note={dropoffNote} saved={places.saved} onSave={savePlace} />}
        {service !== 'ride' && <>
          <Field label={c.recipientPhone} icon="call-outline" value={recipientPhone} onChangeText={edit('recipientPhone', setRecipientPhone)} placeholder={c.recipientPhoneHint}
            keyboardType="phone-pad" error={invalid.recipientPhone} disabled={locked} maxLength={20} />
          <Field label={c.recipientName} icon="person-outline" value={recipientName} onChangeText={setRecipientName} disabled={locked} maxLength={60} />
        </>}
        {service === 'ride'
          ? <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">{c.passengers}</Txt>
            <Stepper label={c.passengers} value={Number(option)} min={1} max={4} onChange={n => setOption(String(n))} disabled={locked} />
          </Row>
          : <>
            <Txt variant="label" style={{ marginBottom: 6 }}>{c.size}</Txt>
            <Choices label={c.size} items={optionsFor(service).map(key => ({ key, label: c[key as 'small'] }))} value={option} onChange={setOption} disabled={locked} />
          </>}
        {service === 'freight' && <>
          <Txt variant="label" style={{ marginVertical: 6 }}>{c.loadingHelp}</Txt>
          <Choices label={c.loadingHelp} items={[{ key: 'no', label: c.no }, { key: 'yes', label: c.yes }]} value={loadingHelp ? 'yes' : 'no'} onChange={k => setLoadingHelp(k === 'yes')} disabled={locked} />
          {wantsScope && !pending && <FreightScopeForm draft={freight} onChange={setFreight} disabled={locked} invalid={scopeInvalid} />}
        </>}
      </Card>

      <Card>
        <Txt variant="label" style={{ marginBottom: 6 }}>{c.whenTitle}</Txt>
        {wantsScope && !pending && <View style={{ gap: 8, marginBottom: 10 }}>
          <Txt variant="label">{c.freightWindowHours}</Txt>
          <Stepper label={c.freightWindowHours} value={loadingHours} min={1} max={8} onChange={setLoadingHours} disabled={locked} />
          <Txt variant="caption">{fill(c.freightWindow, { from: time(windowStart), to: time(windowStart + loadingHours * 3_600_000) })}</Txt>
        </View>}
        <Choices label={c.whenTitle} items={[{ key: 'now', label: c.now }, { key: 'later', label: c.later }]} value={pending ? pending.payload.scheduledFor ? 'later' : 'now' : when}
          onChange={setWhen} disabled={locked} />
        {when === 'later' && !pending && chosen !== null && <View style={{ marginTop: 10 }}>
          <SlotPicker slots={slots} value={chosen} onChange={setSlot} />
          <Txt variant="caption">{c.scheduledHint}</Txt>
        </View>}
      </Card>

      {!pending && routeChosen && !scopeInvalid && <Card style={{ paddingVertical: 10, minHeight: 112 }}>
        <Row gap={12}>
          <View style={styles.cash}><Ionicons name="sparkles-outline" size={18} color={palette.olive} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="micro">{smart?.standard ? c.standardParcel : c.recommendedPrice}</Txt>
            <Txt variant="title">{quoting ? c.quote_calculating : quoteFailed ? '—' : smart ? money(smart.price) : c.quote_calculating}</Txt>
          </View>
        </Row>
        {smart?.standard
          ? <Txt variant="caption" style={{ marginTop: 6 }}>{c.standardParcelHint}</Txt>
          : <>
            {!!reasons && <Txt variant="caption" style={{ marginTop: 6 }}>{reasons}</Txt>}
            {!quoteFailed && <Txt variant="caption" style={{ marginTop: 4 }}>{c.offersHint}</Txt>}
          </>}
        {smart?.estimated && !quoting && <Txt variant="caption" style={{ marginTop: 6 }}>{c.destinationEstimated}</Txt>}
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
            <Button title={c.promoApply} size="sm" variant="soft" loading={checking} disabled={promoBlocked} reason={promoReason} label={`${c.promoApply} ${promo.code}`} onPress={() => applyPromo(promo.code)} />
          </Row>
          : !pending && (promoOpen ? <>
            <Field label={c.promoCode} icon="pricetag-outline" value={promoInput} onChangeText={v => { setPromoInput(v); setPromoError(''); }}
              error={promoError} disabled={promoBlocked || checking} maxLength={16} returnKeyType="go" onSubmitEditing={() => applyPromo(promoInput)} />
            <Button title={c.promoApply} size="sm" variant="soft" loading={checking} disabled={promoBlocked || !promoInput.trim()} reason={promoInput.trim() ? promoReason : c.promo_need_code} onPress={() => applyPromo(promoInput)} />
          </> : <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
            {/* Every credit the customer holds is offered: the first one alone hid the rest. */}
            {price >= 2 && credits.map(credit => <Press key={credit.code} accessibilityLabel={fill(c.useCredit, { r: money(credit.amount), code: credit.code })} onPress={() => applyPromo(credit.code)} disabled={promoBlocked || checking}>
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
    </MapSheet>}

    {step === 'search' && <TripSearch field={field} onField={setField} pickupText={pickupTitle} dropoffText={dropoffTitle} near={pickupChosen ? previewFrom : here} places={places}
      locating={locating} locationError={locationError} notice={error} onRetry={(!ready && error) || copyFailed ? retryStorage : undefined} onPick={applyPlace} onMap={openPin} onLocate={() => { void locate(); }}
      onForget={id => confirm(c.forgetPlaceConfirm, () => api<Places>(`/me/places/${id}`, undefined, 'DELETE').then(setPlaces).catch(e => setError(err(e))), c.forgetPlace, c.no)}
      onClose={() => { if (routeChosen) setStep('trip'); else if (router.canGoBack()) router.back(); else router.replace('/'); }} />}
  </View>;
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

const styles = StyleSheet.create({
  service: { alignItems: 'center', gap: 12, minHeight: 58, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6, borderWidth: 2, borderColor: 'transparent' },
  serviceOn: { backgroundColor: palette.card, borderColor: palette.forest },
  chip: { backgroundColor: palette.olivePale, borderRadius: 99, paddingHorizontal: 12, minHeight: 48 },
  promo: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hair },
  cash: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.olivePale, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  topCard: { alignItems: 'center', gap: 8, backgroundColor: palette.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8 },
  pinTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 8 },
  locate: { position: 'absolute' },
  pinPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: palette.paper, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    ...sheetShadow },
});
