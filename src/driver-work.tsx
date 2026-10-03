import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { api, errorCode } from './api';
import { activeStatuses, type Order } from './model';
import { useSession } from './session';

type Work = { order: Order | null; known: boolean; error?: string; reload: () => Promise<void>; update: (order: Order | null) => void;
  permission: ReturnType<typeof Location.useForegroundPermissions>[0]; requestPermission: ReturnType<typeof Location.useForegroundPermissions>[1] };
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
  const permission = permissionResult?.actor === actor && permissionResult.revision === lifecycle.revision ? permissionResult.value : null;
  const tracking = !!order && !own?.error && foreground && !!permission?.granted;

  // Foreground only. Never read or publish GPS for an idle or signed-out driver.
  useEffect(() => {
    if (!tracking) return;
    let subscription: Location.LocationSubscription | undefined;
    let stopped = false;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 30 },
      ({ coords }) => {
        if (!stopped) api('/location', { latitude: coords.latitude, longitude: coords.longitude }).catch(() => { reload(); });
      }).then(sub => { if (stopped) sub.remove(); else subscription = sub; }).catch(() => {});
    return () => { stopped = true; subscription?.remove(); };
  }, [tracking, order?.id, reload]);

  return <Context.Provider value={{ order, known: !!own && !own.error, error: own?.error, reload, update, permission, requestPermission }}>{children}</Context.Provider>;
}

export function useDriverWork() {
  const work = useContext(Context);
  if (!work) throw new Error('DriverWorkProvider is missing');
  return work;
}
