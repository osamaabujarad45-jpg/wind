import { useEffect, useState } from 'react';

/** Wall-clock milliseconds, refreshed every second while `active`. It refreshes once as soon as it turns on, so an older value never lingers. */
export function useSecondTick(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [active]);
  return now;
}
