import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { errorCode } from './api-client';
import { recoverDriverAction } from './driver-recovery';
import type { Order } from './model';
export type DriverRecoveryState = { state: 'empty' | 'checking' | 'pending' | 'applied' | 'rejected' | 'conflict' | 'other_order'; error?: string; orderId?: number };

export function useDriverRecovery(order: Order | undefined, actorId: number | undefined, authorized: boolean,
  refresh: () => Promise<unknown>, updated: (order: Order) => void, recovered: () => void) {
  const [state, setState] = useState<DriverRecoveryState>({ state: 'empty' });
  const latest = useRef({ refresh, updated, recovered });
  useEffect(() => { latest.current = { refresh, updated, recovered }; });
  const focus = useRef(0);
  const current = useRef({ order, actorId, authorized });
  useEffect(() => { current.current = { order, actorId, authorized }; });
  const identity = `${order?.id}:${order?.driverId}:${order?.updatedAt}:${order?.recovery?.version}:${order?.recovery?.assignmentEpoch}`;
  const retry = useCallback(async () => {
    const value = current.current, generation = focus.current;
    if (!authorized || !actorId || !value.authorized || value.actorId !== actorId || value.order?.driverId !== actorId || !value.order.recovery) return;
    const valid = () => {
      const latest = current.current;
      return generation === focus.current && latest.authorized && latest.actorId === actorId
        && `${latest.order?.id}:${latest.order?.driverId}:${latest.order?.updatedAt}:${latest.order?.recovery?.version}:${latest.order?.recovery?.assignmentEpoch}` === identity;
    };
    setState({ state: 'checking' });
    try {
      const result = await recoverDriverAction(value.actorId, value.order, undefined, {}, valid);
      if (!valid() || result.state === 'previous') return; // focus recovery requests no new action, so nothing ran before it
      setState({ state: result.state, ...('error' in result ? { error: result.error } : {}), ...('orderId' in result ? { orderId: result.orderId } : {}) });
      if (result.state === 'applied' || result.state === 'rejected' || result.state === 'conflict') {
        latest.current.recovered();
        if ('order' in result && result.order) latest.current.updated(result.order);
        else await latest.current.refresh();
      }
    } catch (error) { if (valid()) setState({ state: 'pending', error: errorCode(error) }); }
  }, [identity, actorId, authorized]);
  useFocusEffect(useCallback(() => {
    focus.current++;
    if (authorized) void retry();
    return () => { focus.current++; };
  }, [authorized, retry]));
  return { ...state, retry };
}
