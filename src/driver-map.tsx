// The map behind the driver's jobs. Offline, GPS stays off (the presence card promises it): the map opens where the driver last
// was and shows no position. Online or on a job the driver is already sharing, so the dot and pickup distances may use a fix.
import { useEffect, useRef, useState } from 'react';
import { cities, type Point } from './model';
import { pickupLocation, rememberedHere, rememberHere } from './pickup-location';
import { SceneMap } from './scene-map';
import { SIDE_SHEET, useSideSheet } from './map-sheet';
import { useCopy } from './ui';

export function DriverMap({ active, bottom, label, onHere }: { active: boolean; bottom: number; label: string; onHere: (point: Point | null) => void }) {
  const side = useSideSheet();
  const { rtl } = useCopy();
  const [center, setCenter] = useState<Point | null>(null);
  const [dot, setDot] = useState<Point | null>(null);
  const report = useRef(onHere);
  useEffect(() => { report.current = onHere; });
  useEffect(() => {
    const request = new AbortController();
    void rememberedHere().then(known => { if (known && !request.signal.aborted) setCenter(current => current ?? { latitude: known.latitude, longitude: known.longitude }); });
    const read = () => pickupLocation(request.signal, false).then(fix => {
      if (request.signal.aborted) return;
      setCenter(fix.point); setDot(fix.point); report.current(fix.point); void rememberHere(fix.point);
    }).catch(() => undefined);
    if (active) void read();
    const timer = active ? setInterval(() => { void read(); }, 45_000) : undefined;
    return () => { request.abort(); clearInterval(timer); setDot(null); report.current(null); };
  }, [active]);
  const at = center ?? cities[0];
  return <SceneMap fill mode="browse" center={{ latitude: at.latitude, longitude: at.longitude }} zoom={center ? 15 : 9} user={dot} insets={{ top: 60, bottom, ...(side && (rtl ? { left: SIDE_SHEET } : { right: SIDE_SHEET })) }} label={label} />;
}
