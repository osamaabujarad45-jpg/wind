import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { api, errorCode } from './api';
import { activeStatuses, type Order } from './model';
import { useSession } from './session';
import { backgroundLocationState, startBackgroundLocation, stopBackgroundLocation } from './background-location';

type Tracking = 'idle' | 'off' | 'starting' | 'sharing';
type Work = { order: Order | null; orders: Order[]; known: boolean; error?: string; tracking: Tracking; reload: () => Promise<void>; update: (order: Order) => void;
  permission: ReturnType<typeof Location.useForegroundPermissions>[0]; requestPermission: ReturnType<typeof Location.useForegroundPermissions>[1]; prepareTracking: () => Promise<boolean> };
const Context = createContext<Work | null>(null);

// One assignment source for offer availability and foreground tracking, including the order screen.
export function DriverWorkProvider({ children }: { children: ReactNode }) {
  const { me, ready, language } = useSession();
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
  const [backgroundGranted, setBackgroundGranted] = useState(false);

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

  useEffect(() => {
    if (Platform.OS === 'web' || !foreground || actor === null) return;
    let cancelled = false;
    void Location.getBackgroundPermissionsAsync().then(value => { if (!cancelled) setBackgroundGranted(value.granted); });
    return () => { cancelled = true; };
  }, [actor, foreground, lifecycle.revision]);

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
    if (!enabled || Platform.OS === 'web') return enabled;
    if (!(await Location.getBackgroundPermissionsAsync()).granted) {
      const proceed = await new Promise<boolean>(resolve => Alert.alert(
        language === 'ar' ? 'مشاركة الموقع أثناء التوصيل' : 'Location during delivery',
        language === 'ar' ? 'يلزم إذن الموقع طوال الوقت لمتابعة التوصيل عند قفل الهاتف أو فتح تطبيق آخر. تتوقف المشاركة بانتهاء الطلبات أو تسجيل الخروج.' : 'Allow location all the time to keep tracking when the phone locks or another app opens. Sharing stops when deliveries end or you sign out.',
        [{ text: language === 'ar' ? 'إلغاء' : 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: language === 'ar' ? 'متابعة' : 'Continue', onPress: () => resolve(true) }],
        { cancelable: true, onDismiss: () => resolve(false) }));
      if (!proceed) return false;
      const background = await Location.requestBackgroundPermissionsAsync();
      setBackgroundGranted(background.granted);
      return background.granted;
    }
    setBackgroundGranted(true);
    return true;
  }, [actor, foreground, permission, refreshServices, requestPermission, language]);

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

  // Foreground only. Start a fresh high-accuracy fix as soon as a driver accepts, then keep the customer
  // updated from a subscription. The status reaches "sharing" only after the API accepts a coordinate.
  useEffect(() => {
    const orderId = order?.id;
    if (Platform.OS !== 'web' || actor === null || orderId === undefined) return;
    if (!foreground || !permission?.granted || !servicesEnabled) return;
    let subscription: Location.LocationSubscription | undefined;
    let stopped = false;
    let publishing = false;
    let locating = false;
    let lastPublishedAt = 0;
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
        lastPublishedAt = Date.now();
        setState('sharing');
      } catch {
        setState('starting');
        void reload();
      } finally { publishing = false; }
    };
    const options = { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 30, mayShowUserSettingsDialog: true };
    setState('starting');
    const readPosition = () => {
      if (stopped || locating) return;
      locating = true;
      void Location.getCurrentPositionAsync(options).then(position => publish(position.coords))
        .catch(() => setState('starting')).finally(() => { locating = false; });
    };
    readPosition();
    // Movement subscriptions can stay silent at a stop. Obtain a new fix rather than re-stamping an old one.
    const heartbeat = setInterval(() => { if (Date.now() - lastPublishedAt >= 25_000) readPosition(); }, 30_000);
    void Location.watchPositionAsync(options, position => { void publish(position.coords); }, () => setState('off'))
      .then(sub => { if (stopped) sub.remove(); else subscription = sub; })
      .catch(() => setState('off'));
    return () => { stopped = true; clearInterval(heartbeat); subscription?.remove(); };
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
    if (!permission.granted || !backgroundGranted) {
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
  }, [actor, ready, foreground, nativeOrderId, result?.actor, permission, backgroundGranted, servicesEnabled]);

  const savedTracking = trackingResult?.actor === actor && trackingResult.orderId === order?.id ? trackingResult.value : undefined;
  const tracking: Tracking = !order ? 'idle' : !foreground || !permission?.granted || !servicesEnabled ||
    (Platform.OS !== 'web' && !backgroundGranted) ? 'off' : savedTracking ?? 'starting';

  return <Context.Provider value={{ order, orders, known: !!own && !own.error, error: own?.error, tracking, reload, update, permission, requestPermission, prepareTracking }}>{children}</Context.Provider>;
}

export function useDriverWork() {
  const work = useContext(Context);
  if (!work) throw new Error('DriverWorkProvider is missing');
  return work;
}
