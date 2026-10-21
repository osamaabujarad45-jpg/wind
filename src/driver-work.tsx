import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { api, errorCode } from './api';
import { activeStatuses, type Order } from './model';
import { useSession } from './session';
import { backgroundLocationState, startBackgroundLocation, stopBackgroundLocation } from './background-location';
import { MIN_GAP, movingHeading } from './location-delivery';

type Tracking = 'idle' | 'off' | 'starting' | 'sharing';
type Work = { order: Order | null; orders: Order[]; known: boolean; error?: string; tracking: Tracking; reload: () => Promise<void>; update: (order: Order) => void;
  permission: ReturnType<typeof Location.useForegroundPermissions>[0]; requestPermission: ReturnType<typeof Location.useForegroundPermissions>[1]; prepareTracking: () => Promise<boolean> };
const Context = createContext<Work | null>(null);

// One assignment source for offer availability and foreground tracking, including the order screen.
export function DriverWorkProvider({ children }: { children: ReactNode }) {
  const { me, ready } = useSession();
  const actor = me?.user.role === 'driver' && me.user.status === 'active' ? me.user.id : null;
  const [lifecycle, setLifecycle] = useState({ active: AppState.currentState === 'active', revision: 0 });
  const foreground = lifecycle.active;
  // Every active order: one ride or freight load, or many parcels (SPEC-parcel-standard.md).
  const [result, setResult] = useState<{ actor: number; revision: number; orders: Order[]; error?: string }>();
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const pending = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const [, askPermission, getPermission] = Location.useForegroundPermissions({ get: false });
  const permissionGeneration = useRef(0);
  const invalidatePermission = useCallback(() => { permissionGeneration.current++; }, []);
  const [permissionResult, setPermissionResult] = useState<{ actor: number; revision: number;
    value: NonNullable<Work['permission']> }>();
  const permission = permissionResult?.actor === actor && permissionResult.revision === lifecycle.revision ? permissionResult.value : null;
  const servicesGeneration = useRef(0);
  const [servicesResult, setServicesResult] = useState<{ actor: number; revision: number; enabled: boolean }>();
  const [trackingResult, setTrackingResult] = useState<{ actor: number; orderId: number; value: Exclude<Tracking, 'idle'> }>();

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setLifecycle(previous => ({ active: state === 'active', revision: previous.revision + 1 })));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const current = ++permissionGeneration.current;
    if (actor !== null && foreground) getPermission().then(value => {
      if (permissionGeneration.current === current) setPermissionResult({ actor, revision: lifecycle.revision, value });
    }).catch(() => {}); // unknown permission keeps GPS off until the next foreground check or explicit request
    return invalidatePermission;
  }, [actor, foreground, lifecycle.revision, getPermission, invalidatePermission]);

  const requestPermission = useCallback(async () => {
    const current = ++permissionGeneration.current;
    const value = await askPermission();
    if (permissionGeneration.current === current && actor !== null && foreground)
      setPermissionResult({ actor, revision: lifecycle.revision, value });
    return value;
  }, [actor, foreground, lifecycle.revision, askPermission]);

  const refreshServices = useCallback(async () => {
    const current = ++servicesGeneration.current;
    if (actor === null || !foreground) return false;
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (servicesGeneration.current === current) setServicesResult({ actor, revision: lifecycle.revision, enabled });
      return enabled;
    } catch {
      if (servicesGeneration.current === current) setServicesResult({ actor, revision: lifecycle.revision, enabled: false });
      return false;
    }
  }, [actor, foreground, lifecycle.revision]);

  useEffect(() => {
    if (permission?.granted) void Promise.resolve().then(refreshServices);
  }, [permission?.granted, refreshServices]);

  // Called only from an explicit driver action. It requests foreground permission at the point it is needed,
  // then lets Android offer its high-accuracy location dialog when services are off. No "all the time"
  // permission: the native tracker is a foreground service started while the app is open, which Android
  // and iOS let keep reading location after the phone locks.
  const prepareTracking = useCallback(async () => {
    if (actor === null || !foreground) return false;
    const value = permission?.granted ? permission : await requestPermission();
    if (!value.granted) return false;
    let enabled = await refreshServices();
    if (!enabled && Platform.OS === 'android') {
      try { await Location.enableNetworkProviderAsync(); }
      catch { return false; }
      enabled = await refreshServices();
    }
    return enabled;
  }, [actor, foreground, permission, refreshServices, requestPermission]);

  const reload = useCallback((): Promise<void> => {
    if (actor === null || !foreground) return Promise.resolve();
    const current = generation.current;
    if (pending.current?.generation === current) return pending.current.promise;
    const promise = api<Order[]>('/orders').then(orders => {
      if (generation.current === current) setResult({ actor, revision: lifecycle.revision,
        orders: orders.filter(order => order.driverId === actor && activeStatuses.includes(order.status)) });
    }, error => {
      if (generation.current === current) setResult(previous => ({ actor, revision: lifecycle.revision,
        orders: previous?.actor === actor ? previous.orders : [], error: errorCode(error) }));
    }).finally(() => { if (pending.current?.generation === current) pending.current = null; });
    pending.current = { generation: current, promise };
    return promise;
  }, [actor, foreground, lifecycle.revision]);

  useEffect(() => {
    invalidate();
    reload();
    const timer = actor !== null && foreground ? setInterval(reload, 10_000) : undefined;
    return () => { invalidate(); if (timer) clearInterval(timer); };
  }, [actor, foreground, reload, invalidate]);

  const update = (order: Order) => {
    if (actor === null || order.driverId !== actor) return;
    generation.current++; // acknowledged mutations win over an earlier poll
    setResult(previous => {
      const others = (previous?.actor === actor && previous.revision === lifecycle.revision ? previous.orders : []).filter(o => o.id !== order.id);
      return { actor, revision: lifecycle.revision, orders: activeStatuses.includes(order.status) ? [order, ...others] : others };
    });
  };
  const own = result?.actor === actor && result.revision === lifecycle.revision ? result : undefined;
  const orders = own?.orders ?? [];
  const order = orders[0] ?? null; // one location stream serves every order the driver carries
  const servicesEnabled = servicesResult?.actor === actor && servicesResult.revision === lifecycle.revision && servicesResult.enabled;

  // Web, foreground only. The browser's own watch, not Expo's: Expo 57 on web drops errors and high accuracy,
  // clears the wrong watch ID and serves a cached first fix of any age. "sharing" only after the API accepts a fix.
  useEffect(() => {
    const orderId = order?.id;
    if (Platform.OS !== 'web' || actor === null || orderId === undefined) return;
    if (!foreground || !permission?.granted || !servicesEnabled) return;
    const geolocation = navigator.geolocation;
    let stopped = false;
    let publishing = false;
    let queued: GeolocationPosition | null = null;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let lastFixAt = 0;
    let lastPublishedAt = 0, lastTriedAt = 0;
    const setState = (value: Exclude<Tracking, 'idle'>) => {
      if (!stopped) setTrackingResult({ actor, orderId, value });
    };
    // The newest fix waiting for the request in flight or the 2 s gap; sent as soon as either clears.
    const later = () => { if (!wait && queued && !stopped) wait = setTimeout(flush, Math.max(0, MIN_GAP - (Date.now() - lastTriedAt))); };
    const flush = () => { wait = undefined; const next = queued; queued = null; if (next) void publish(next); };
    const publish = async (position: GeolocationPosition) => {
      const { timestamp, coords: { latitude, longitude, accuracy } } = position, heading = movingHeading(position.coords.heading, position.coords.speed, position.coords.accuracy);
      // A late or replayed fix must not move the driver backward.
      if (stopped || timestamp <= lastFixAt || !Number.isFinite(timestamp) || Date.now() - timestamp > 60_000 || timestamp > Date.now() + 5_000) return;
      // Browsers fire watch callbacks as often as they like; at most one upload per 2 s keeps under the API limit.
      if (publishing || Date.now() - lastTriedAt < MIN_GAP) {
        if (!queued || timestamp > queued.timestamp) queued = position;
        if (!publishing) later();
        return;
      }
      publishing = true; lastTriedAt = Date.now();
      try {
        // Heading/accuracy only draw the marker; drop values the API would refuse rather than lose the fix.
        const receipt = await api<{ accepted?: boolean }>('/location', { latitude, longitude, age: Math.max(0, Date.now() - timestamp),
          ...(heading != null && { heading }),
          ...(accuracy != null && accuracy >= 0 && accuracy <= 5000 && { accuracy }) });
        if (receipt.accepted !== false) {
          lastFixAt = timestamp;
          lastPublishedAt = Date.now();
          setState('sharing');
        }
      } catch {
        setState('starting');
        void reload();
      } finally {
        publishing = false;
        later();
      }
    };
    // Timeouts and lost signal keep the last state; the heartbeat retries. Only a denial turns sharing off.
    const fail = (error: GeolocationPositionError) => { if (error.code === 1) setState('off'); };
    const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 };
    setState('starting');
    const watch = geolocation.watchPosition(position => { void publish(position); }, fail, options);
    // Watches can stay silent at a stop. Obtain a new fix rather than re-stamping an old one.
    const heartbeat = setInterval(() => {
      if (Date.now() - lastPublishedAt >= 25_000) geolocation.getCurrentPosition(position => { void publish(position); }, fail, options);
    }, 30_000);
    return () => { stopped = true; clearInterval(heartbeat); clearTimeout(wait); geolocation.clearWatch(watch); };
  }, [actor, foreground, order?.id, permission?.granted, reload, servicesEnabled]);

  // Reconcile only in the foreground. AppState changes must not tear down the native service.
  const nativeOrderId = result?.actor === actor ? result.orders[0]?.id : undefined;
  useEffect(() => {
    if (Platform.OS === 'web' || !ready || !foreground) return;
    if (actor === null || (result?.actor === actor && !nativeOrderId)) {
      void stopBackgroundLocation().catch(() => {});
      return;
    }
    if (nativeOrderId === undefined || permission === null) return;
    if (!permission.granted) {
      void stopBackgroundLocation().catch(() => {});
      return;
    }
    if (!servicesEnabled) return;
    let cancelled = false;
    const status = () => backgroundLocationState().then(value => {
      if (!cancelled) setTrackingResult({ actor, orderId: nativeOrderId, value });
    }).catch(() => {});
    void startBackgroundLocation(actor, nativeOrderId).then(status).catch(() => {
      if (!cancelled) setTrackingResult({ actor, orderId: nativeOrderId, value: 'off' });
    });
    const timer = setInterval(status, 3_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [actor, ready, foreground, nativeOrderId, result?.actor, permission, servicesEnabled]);

  const savedTracking = trackingResult?.actor === actor && trackingResult.orderId === order?.id ? trackingResult.value : undefined;
  const tracking: Tracking = !order ? 'idle' : !foreground || !permission?.granted || !servicesEnabled ? 'off' : savedTracking ?? 'starting';

  return <Context.Provider value={{ order, orders, known: !!own && !own.error, error: own?.error, tracking, reload, update, permission, requestPermission, prepareTracking }}>{children}</Context.Provider>;
}

export function useDriverWork() {
  const work = useContext(Context);
  if (!work) throw new Error('DriverWorkProvider is missing');
  return work;
}
