import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { api, errorCode } from './api';
import { activeStatuses, type Order } from './model';
import { useSession } from './session';

type Tracking = 'idle' | 'off' | 'starting' | 'sharing';
type Work = { order: Order | null; known: boolean; error?: string; tracking: Tracking; reload: () => Promise<void>; update: (order: Order | null) => void;
  permission: ReturnType<typeof Location.useForegroundPermissions>[0]; requestPermission: ReturnType<typeof Location.useForegroundPermissions>[1]; prepareTracking: () => Promise<boolean> };
const Context = createContext<Work | null>(null);

// One assignment source for offer availability and foreground tracking, including the order screen.
export function DriverWorkProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const actor = me?.user.role === 'driver' && me.user.status === 'active' ? me.user.id : null;
  const [lifecycle, setLifecycle] = useState({ active: AppState.currentState === 'active', revision: 0 });
  const foreground = lifecycle.active;
  const [result, setResult] = useState<{ actor: number; revision: number; order: Order | null; error?: string }>();
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
  // then lets Android offer its high-accuracy location dialog when services are off.
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
        order: orders.find(order => order.driverId === actor && activeStatuses.includes(order.status)) ?? null });
    }, error => {
      if (generation.current === current) setResult(previous => ({ actor, revision: lifecycle.revision,
        order: previous?.actor === actor ? previous.order : null, error: errorCode(error) }));
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

  const update = (order: Order | null) => {
    if (actor === null || order && order.driverId !== actor) return;
    generation.current++; // acknowledged mutations win over an earlier poll
    setResult({ actor, revision: lifecycle.revision, order: order && activeStatuses.includes(order.status) ? order : null });
  };
  const own = result?.actor === actor && result.revision === lifecycle.revision ? result : undefined;
  const order = own?.order ?? null;
  const servicesEnabled = servicesResult?.actor === actor && servicesResult.revision === lifecycle.revision && servicesResult.enabled;

  // Foreground only. Start a fresh high-accuracy fix as soon as a driver accepts, then keep the customer
  // updated from a subscription. The status reaches "sharing" only after the API accepts a coordinate.
  useEffect(() => {
    const orderId = order?.id;
    if (actor === null || orderId === undefined) return;
    if (!foreground || !permission?.granted || !servicesEnabled) return;
    let subscription: Location.LocationSubscription | undefined;
    let stopped = false;
    let publishing = false;
    const setState = (value: Exclude<Tracking, 'idle'>) => {
      if (!stopped) setTrackingResult({ actor, orderId, value });
    };
    const publish = async ({ latitude, longitude, heading, accuracy }: Location.LocationObjectCoords) => {
      if (stopped || publishing) return;
      publishing = true;
      try {
        // Heading/accuracy only draw the marker; drop values the API would refuse rather than lose the fix.
        await api('/location', { latitude, longitude,
          ...(heading != null && heading >= 0 && heading <= 360 && { heading }),
          ...(accuracy != null && accuracy >= 0 && accuracy <= 5000 && { accuracy }) });
        setState('sharing');
      } catch {
        setState('starting');
        void reload();
      } finally { publishing = false; }
    };
    const options = { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 30, mayShowUserSettingsDialog: true };
    setState('starting');
    // A one-off reading avoids making the customer wait for the first movement event.
    void Location.getCurrentPositionAsync(options).then(position => publish(position.coords)).catch(() => setState('starting'));
    void Location.watchPositionAsync(options, position => { void publish(position.coords); }, () => setState('off'))
      .then(sub => { if (stopped) sub.remove(); else subscription = sub; })
      .catch(() => setState('off'));
    return () => { stopped = true; subscription?.remove(); };
  }, [actor, foreground, order?.id, permission?.granted, reload, servicesEnabled]);

  const savedTracking = trackingResult?.actor === actor && trackingResult.orderId === order?.id ? trackingResult.value : undefined;
  const tracking: Tracking = !order ? 'idle' : !foreground || !permission?.granted || !servicesEnabled ? 'off' : savedTracking ?? 'starting';

  return <Context.Provider value={{ order, known: !!own && !own.error, error: own?.error, tracking, reload, update, permission, requestPermission, prepareTracking }}>{children}</Context.Provider>;
}

export function useDriverWork() {
  const work = useContext(Context);
  if (!work) throw new Error('DriverWorkProvider is missing');
  return work;
}
