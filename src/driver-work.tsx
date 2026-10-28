import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { api, apiSessionRevision, errorCode } from './api';
import { activeStatuses, type Order } from './model';
import { useSession } from './session';
import { activeGpsTestEnabled, backgroundLocationState, startBackgroundLocation, stopBackgroundLocation } from './background-location';
import { MIN_GAP, locationCadence, movingHeading } from './location-delivery';
import { deliverPresenceFix, startPresence, stopPresence, subscribePresence, subscribePresenceError, suspendPresence } from './driver-presence-runtime';
import type { PresenceState } from './driver-presence';
import { requestBackgroundTracking } from './background-permission';
import { createPresenceStartGuard } from './presence-start-guard';
import { createLocationWebClock } from './location-web-clock';
import { boundedPermission } from './location-permission-timeout';

type Tracking = 'idle' | 'off' | 'starting' | 'sharing';
type Work = { order: Order | null; orders: Order[]; known: boolean; error?: string; tracking: Tracking; reload: () => Promise<void>; update: (order: Order) => void;
  permission: ReturnType<typeof Location.useForegroundPermissions>[0]; requestPermission: ReturnType<typeof Location.useForegroundPermissions>[1]; prepareTracking: () => Promise<boolean>;
  presenceState: PresenceState | 'permission_denied'; presencePending:boolean; presenceError?:string; presenceConsentAccepted:boolean;
  enablePresence:()=>Promise<void>; disablePresence:()=>Promise<void>; backgroundGranted: boolean | null; requestBackgroundTracking:()=>Promise<boolean> };
const Context = createContext<Work | null>(null);

// One assignment source for offer availability and foreground tracking, including the order screen.
export function DriverWorkProvider({ children }: { children: ReactNode }) {
  const { me, ready } = useSession();
  const actor = me?.user.role === 'driver' && me.user.status === 'active' ? me.user.id : null;
  const actorRef = useRef(actor);
  useLayoutEffect(() => { actorRef.current = actor; }, [actor]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [lifecycle, setLifecycle] = useState({ active: AppState.currentState === 'active', revision: 0 });
  const lifecycleRef=useRef(lifecycle);
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
  const [presenceResult,setPresenceResult]=useState<{actor:number|null;revision:number;state:PresenceState|'permission_denied'}>();
  const [bgResult, setBgResult] = useState<{ actor: number | null; granted: boolean } | null>(null);
  const [presenceError,setPresenceError]=useState<string>();
  const [presencePending,setPresencePending]=useState(false);
  const [presenceConsentAccepted,setPresenceConsentAccepted]=useState(false);
  const presenceGeneration=useRef(0),presenceRunning=useRef(false);
  const [presenceStartGuard]=useState(createPresenceStartGuard);

  useEffect(()=>{
    const generationRef=presenceGeneration,current=++generationRef.current;presenceRunning.current=false;suspendPresence();
    void Promise.resolve().then(()=>{if(generationRef.current===current){setPresenceConsentAccepted(false);setPresenceError(undefined);setPresencePending(false);}});
    const unsubscribe=subscribePresence(state=>setPresenceResult(previous=>{
      const revision=lifecycleRef.current.revision;
      return previous?.actor===actor&&previous.state===state&&previous.revision===revision?previous:{actor,revision,state};
    }));
    const unsubscribeError=subscribePresenceError(error=>setPresenceError(error??undefined));
    return ()=>{generationRef.current++;unsubscribe();unsubscribeError();suspendPresence();};
  },[actor]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      const next={active:state==='active',revision:lifecycleRef.current.revision+1};lifecycleRef.current=next;setLifecycle(next);
      presenceStartGuard.invalidate();
      if(!next.active)void stopPresence().catch(()=>{});
    });
    return () => sub.remove();
  }, [presenceStartGuard]);

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
  // Background permission is a separate, optional action and does not guarantee delivery.
  const prepareTracking = useCallback(async () => {
    if (actor === null || !foreground) return false;
    const session = apiSessionRevision(), revision = lifecycleRef.current.revision;
    const current = () => mounted.current && actorRef.current === actor && lifecycleRef.current.active
      && lifecycleRef.current.revision === revision && apiSessionRevision() === session;
    const value = permission?.granted ? permission : Platform.OS === 'web'
      ? await boundedPermission(requestPermission) : await requestPermission();
    if (!current() || !value?.granted) return false;
    let enabled = await refreshServices();
    if (!current()) return false;
    if (!enabled && Platform.OS === 'android') {
      try { await Location.enableNetworkProviderAsync(); }
      catch { return false; }
      if (!current()) return false;
      enabled = await refreshServices();
    }
    return current() && enabled;
  }, [actor, foreground, permission, refreshServices, requestPermission]);
  // The caller must show its own explanation before invoking this optional OS prompt.
  const requestBackgroundPermission=useCallback(async()=>{
    if(Platform.OS==='web'||actor===null||!foreground)return false;
    return requestBackgroundTracking({foreground:prepareTracking,current:Location.getBackgroundPermissionsAsync,
      request:Location.requestBackgroundPermissionsAsync,provider:Location.getProviderStatusAsync});
  },[actor,foreground,prepareTracking]);

  const reload = useCallback((): Promise<void> => {
    if (actor === null || !foreground) return Promise.resolve();
    const current = generation.current;
    if (pending.current?.generation === current) return pending.current.promise;
    const promise = api<Order[]>('/orders').then(orders => {
      if (generation.current === current) {
        const active=orders.filter(order => order.driverId === actor && activeStatuses.includes(order.status));
        if(active.length)presenceStartGuard.invalidate();
        setResult({ actor, revision: lifecycle.revision, orders:active });
      }
    }, error => {
      if (generation.current === current) {presenceStartGuard.invalidate();setResult(previous => ({ actor, revision: lifecycle.revision,
        orders: previous?.actor === actor ? previous.orders : [], error: errorCode(error) }));}
    }).finally(() => { if (pending.current?.generation === current) pending.current = null; });
    pending.current = { generation: current, promise };
    return promise;
  }, [actor, foreground, lifecycle.revision, presenceStartGuard]);

  useEffect(() => {
    invalidate();
    reload();
    const timer = actor !== null && foreground ? setInterval(reload, 10_000) : undefined;
    return () => { invalidate(); if (timer) clearInterval(timer); };
  }, [actor, foreground, reload, invalidate]);

  const update = (order: Order) => {
    if (actor === null || order.driverId !== actor) return;
    if(activeStatuses.includes(order.status))presenceStartGuard.invalidate();
    generation.current++; // acknowledged mutations win over an earlier poll
    setResult(previous => {
      const others = (previous?.actor === actor && previous.revision === lifecycle.revision ? previous.orders : []).filter(o => o.id !== order.id);
      return { actor, revision: lifecycle.revision, orders: activeStatuses.includes(order.status) ? [order, ...others] : others };
    });
  };
  const own = result?.actor === actor && result.revision === lifecycle.revision ? result : undefined;
  const orders = own?.orders ?? [];
  const order = orders[0] ?? null; // one location stream serves every order the driver carries
  const activeOrderId=order?.id;
  const presenceOrdersKnown=!!own && !own.error;
  const servicesEnabled = servicesResult?.actor === actor && servicesResult.revision === lifecycle.revision && servicesResult.enabled;
  const presenceState=presenceResult?.actor!==actor?'offline':presenceResult.revision!==lifecycle.revision && ['stale','online','reconnecting'].includes(presenceResult.state)
    ?'reconnecting':presenceResult.state;
  const enablePresence=useCallback(async()=>{
    if(actor===null || !foreground || activeOrderId!==undefined || !presenceOrdersKnown || presenceRunning.current)return;
    const current=presenceGeneration.current,ticket=presenceStartGuard.snapshot();presenceRunning.current=true;setPresencePending(true);setPresenceError(undefined);
    try {
      if(!await prepareTracking()) {if(current===presenceGeneration.current)setPresenceResult({actor,revision:lifecycleRef.current.revision,state:'permission_denied'});return;}
      if(current!==presenceGeneration.current || !presenceStartGuard.allows(ticket,{foreground:lifecycleRef.current.active,known:presenceOrdersKnown,hasOrder:activeOrderId!==undefined}))return;
      if(await startPresence(true) && current===presenceGeneration.current)setPresenceConsentAccepted(true);
    } catch(error) {if(current===presenceGeneration.current)setPresenceError(errorCode(error));}
    finally {if(current===presenceGeneration.current){presenceRunning.current=false;setPresencePending(false);}}
  },[actor,foreground,activeOrderId,presenceOrdersKnown,prepareTracking,presenceStartGuard]);
  const disablePresence=useCallback(async()=>{
    presenceStartGuard.invalidate();
    const current=presenceGeneration.current;presenceRunning.current=true;setPresencePending(true);setPresenceError(undefined);
    try {await stopPresence();}catch(error){if(current===presenceGeneration.current)setPresenceError(errorCode(error));}
    finally {if(current===presenceGeneration.current){presenceRunning.current=false;setPresencePending(false);}}
  },[presenceStartGuard]);

  // Active-job tracking has its own purpose and transport; stop preassignment collection immediately.
  useEffect(()=>{if((activeOrderId!==undefined || !presenceOrdersKnown) && ['starting','stale','online','reconnecting'].includes(presenceState))void stopPresence().catch(()=>{});},[activeOrderId,presenceOrdersKnown,presenceState]);
  useEffect(()=>{
    if(actor===null||!foreground||!permission || !['stale','online','reconnecting'].includes(presenceState))return;
    const state=!permission.granted?'permission_denied':servicesResult?.actor===actor && servicesResult.revision===lifecycle.revision && !servicesResult.enabled?'unavailable':undefined;
    if(state){const current=presenceGeneration.current;void stopPresence().catch(()=>{});void Promise.resolve().then(()=>{if(current===presenceGeneration.current)setPresenceResult({actor,revision:lifecycleRef.current.revision,state});});}
  },[actor,foreground,permission,presenceState,servicesResult,lifecycle.revision]);

  // Presence uses its own consented, foreground-only watch. It never writes to the active-job channel.
  useEffect(()=>{
    if(actor===null||!foreground||!presenceOrdersKnown||activeOrderId!==undefined||!permission?.granted||!servicesEnabled || !['stale','online','reconnecting'].includes(presenceState))return;
    let stopped=false,refreshing=false,lastObservedAt=0;
    const publish=(fix:Location.LocationObject)=>{if(stopped)return;lastObservedAt=Date.now();void deliverPresenceFix(fix).catch(()=>{});};
    if(Platform.OS==='web') {
      const geo=navigator.geolocation,options={enableHighAccuracy:true,maximumAge:0,timeout:20000};
      const receive=(position:GeolocationPosition)=>publish({timestamp:position.timestamp,coords:{latitude:position.coords.latitude,longitude:position.coords.longitude,
        accuracy:position.coords.accuracy,altitude:position.coords.altitude,altitudeAccuracy:position.coords.altitudeAccuracy,heading:position.coords.heading,speed:position.coords.speed}});
      const fail=(error:GeolocationPositionError)=>{if(error.code===1&&!stopped){void stopPresence().catch(()=>{});setPresenceResult({actor,revision:lifecycleRef.current.revision,state:'permission_denied'});}};
      const watch=geo.watchPosition(receive,fail,options);
      const timer=setInterval(()=>{if(!stopped&&Date.now()-lastObservedAt>=15000)geo.getCurrentPosition(receive,fail,options);},15000);
      return ()=>{stopped=true;clearInterval(timer);geo.clearWatch(watch);};
    }
    let subscription:Location.LocationSubscription|undefined;
    void Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:5000,distanceInterval:0},publish).then(value=>{
      if(stopped)value.remove();else subscription=value;
    }).catch(()=>{if(!stopped){void stopPresence().catch(()=>{});setPresenceResult({actor,revision:lifecycleRef.current.revision,state:'unavailable'});}});
    const timer=setInterval(()=>{
      if(stopped||refreshing||Date.now()-lastObservedAt<15000)return;
      refreshing=true;void Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}).then(publish,()=>{}).finally(()=>{refreshing=false;});
    },15000);
    return ()=>{stopped=true;clearInterval(timer);subscription?.remove();};
  },[actor,foreground,presenceOrdersKnown,activeOrderId,permission,servicesEnabled,presenceState]);

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
    const clock = createLocationWebClock();
    const monotonic = () => globalThis.performance?.now?.() ?? Date.now();
    const setState = (value: Exclude<Tracking, 'idle'>) => {
      if (!stopped) setTrackingResult({ actor, orderId, value });
    };
    // Keep only the latest fresh callback while a request or cadence window is active.
    const later = () => { if (!wait && queued && !stopped) wait = setTimeout(flush, Math.max(0, Math.max(MIN_GAP, locationCadence(queued.coords.speed,queued.coords.accuracy)) - clock.sinceAttempt(monotonic()))); };
    const flush = () => { wait = undefined; const next = queued; queued = null; if (next) void publish(next); };
    const publish = async (position: GeolocationPosition) => {
      const { timestamp, coords: { latitude, longitude, accuracy } } = position, heading = movingHeading(position.coords.heading, position.coords.speed, position.coords.accuracy);
      if (clock.observe(Date.now())) queued = null;
      // A late or replayed fix must not move the driver backward.
      if (stopped || !clock.isNew(timestamp) || !Number.isFinite(timestamp) || Date.now() - timestamp > 30_000 || timestamp > Date.now() + 5_000) return;
      if (publishing || clock.sinceAttempt(monotonic()) < Math.max(MIN_GAP, locationCadence(position.coords.speed,accuracy))) {
        if (!queued || timestamp > queued.timestamp) queued = position;
        if (!publishing) later();
        return;
      }
      publishing = true; clock.attempted(monotonic());
      try {
        // Heading/accuracy only draw the marker; drop values the API would refuse rather than lose the fix.
        const receipt = await api<{ accepted?: boolean }>('/location', { latitude, longitude, age: Math.max(0, Date.now() - timestamp),
          ...(heading != null && { heading }),
          ...(accuracy != null && accuracy >= 0 && accuracy <= 5000 && { accuracy }) });
        const receivedAt = Date.now();
        if (clock.observe(receivedAt)) queued = null;
        if (!stopped && receipt.accepted !== false && timestamp <= receivedAt + 5_000 && receivedAt - timestamp <= 30_000) {
          clock.accepted(timestamp, monotonic());
          setState('sharing');
        }
      } catch {
        queued = null; // do not replay a location after a network failure
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
      if (clock.sincePublished(monotonic()) >= 15_000) geolocation.getCurrentPosition(position => { void publish(position); }, fail, options);
    }, 15_000);
    return () => { stopped = true; clearInterval(heartbeat); clearTimeout(wait); geolocation.clearWatch(watch); };
  }, [actor, foreground, order?.id, permission?.granted, reload, servicesEnabled]);

  // Reconcile only in the foreground. AppState changes must not tear down the native service.
  const nativeOrderId = result?.actor === actor ? result.orders[0]?.id : undefined;
  const nativeOrdersKnown = !activeGpsTestEnabled || (!!own && !own.error);
  const activeOrderKey = activeGpsTestEnabled ? orders.map(value => value.id).sort((a,b) => a-b).join(',') : '';
  useEffect(() => {
    if (Platform.OS === 'web' || !ready || !foreground) return;
    if (activeGpsTestEnabled && !nativeOrdersKnown) {
      void stopBackgroundLocation().catch(() => {});
      return;
    }
    if (actor === null || (result?.actor === actor && !nativeOrderId)) {
      void stopBackgroundLocation().catch(() => {});
      return;
    }
    if (nativeOrderId === undefined || permission === null) return;
    if (!permission.granted) {
      void stopBackgroundLocation().catch(() => {});
      return;
    }
    if (!servicesEnabled) { void stopBackgroundLocation().catch(() => {}); return; }
    let cancelled = false;
    const status = () => backgroundLocationState().then(value => {
      if (!cancelled) setTrackingResult({ actor, orderId: nativeOrderId, value });
    }).catch(() => {});
    if (activeGpsTestEnabled) void stopBackgroundLocation().catch(() => {});
    void Location.getBackgroundPermissionsAsync().then(p => { if (!cancelled) setBgResult({ actor, granted: p.granted }); }).catch(() => {});
    void startBackgroundLocation(actor, nativeOrderId, activeGpsTestEnabled ? activeOrderKey.split(',').map(Number) : undefined,
      () => !cancelled && lifecycleRef.current.active && lifecycleRef.current.revision === lifecycle.revision).then(status).catch(() => {
      if (!cancelled) setTrackingResult({ actor, orderId: nativeOrderId, value: 'off' });
    });
    const timer = setInterval(status, 3_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [actor, ready, foreground, nativeOrderId, result?.actor, permission, servicesEnabled, activeOrderKey, nativeOrdersKnown, lifecycle.revision]);

  const savedTracking = trackingResult?.actor === actor && trackingResult.orderId === order?.id ? trackingResult.value : undefined;
  const tracking: Tracking = !order ? 'idle' : !foreground || !permission?.granted || !servicesEnabled ? 'off' : savedTracking ?? 'starting';

  return <Context.Provider value={{ order, orders, known: !!own && !own.error, error: own?.error, tracking, reload, update, permission, requestPermission, prepareTracking,
    presenceState,presencePending,presenceError,presenceConsentAccepted,enablePresence,disablePresence,requestBackgroundTracking:requestBackgroundPermission, backgroundGranted: bgResult?.actor === actor ? bgResult.granted : null }}>{children}</Context.Provider>;
}

export function useDriverWork() {
  const work = useContext(Context);
  if (!work) throw new Error('DriverWorkProvider is missing');
  return work;
}
