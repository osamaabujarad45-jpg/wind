import { useLayoutEffect, useState } from 'react';

/**
 * Wall-clock milliseconds, refreshed every second while `active` and not at all otherwise.
 * The first refresh runs in a layout effect, so React re-renders with the real time before the frame is painted.
 * `current` is false only on that unpainted render, and after turning off: a value left over from an idle stretch
 * is never shown as a countdown or used to enable an action.
 */
export function useSecondTick(active: boolean) {
  const [clock, setClock] = useState(() => ({ now: Date.now(), live: false }));
  useLayoutEffect(() => {
    if (!active) return;
    const tick = () => setClock({ now: Date.now(), live: true });
    tick();
    const timer = setInterval(tick, 1000);
    // Marking the clock stale here, not on the next activation, is what keeps a later re-activation from trusting it.
    return () => { clearInterval(timer); setClock(previous => ({ ...previous, live: false })); };
  }, [active]);
  return { now: clock.now, current: active && clock.live };
}
