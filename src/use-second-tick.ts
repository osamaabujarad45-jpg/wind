import { useEffect, useState } from 'react';

/**
 * Wall-clock milliseconds, refreshed every second while `active` and not at all otherwise.
 * `current` is false until the first tick after turning on (one macrotask), so a value left over from an idle
 * stretch is never shown as a countdown or used to enable an action.
 */
export function useSecondTick(active: boolean) {
  const [clock, setClock] = useState(() => ({ now: Date.now(), live: false }));
  useEffect(() => {
    if (!active) return;
    const tick = () => setClock({ now: Date.now(), live: true });
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(initial); clearInterval(timer); setClock(previous => ({ ...previous, live: false })); };
  }, [active]);
  return { now: clock.now, current: active && clock.live };
}
