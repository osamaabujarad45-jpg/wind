// The app's side of public/map.html, shared by the Android/iOS WebView and the web iframe (src/map-page*.tsx).
import { useEffect, useRef, useState } from 'react';
import type { Point } from './model';
import { mapReadyMs } from './runtime-config';

export type MapMessage = { type: 'ready' | 'failed' | 'drawing' | 'gesture' | 'moving' } | { type: 'center'; latitude: number; longitude: number };
export type MapEvents = {
  onCenter?: (point: Point) => void; onGesture?: () => void; onMoving?: () => void; onFail: () => void; onReady?: () => void;
};

/** Sends `update` across the bridge when it changes and reads what the page says. A user's own map movement is never
 * echoed back as a camera command, and the page's old viewport is ignored while a fresh centre is crossing the bridge. */
export function useMapBridge(update: object | undefined, inject: (json: string) => void, events: MapEvents) {
  const reported = useRef<Point | null>(null);
  const expectedCenter = useRef<Point | null>(null);
  const armed = useRef(''), sent = useRef(''), centerSent = useRef(''); // the last centre that set the guard / the last update that crossed / the last centre that crossed
  const modeSent = useRef<string | undefined>(undefined);
  const [state, setState] = useState<'loading' | 'drawing' | 'ready'>('loading');
  const failed = useRef(events.onFail);
  const terminal = useRef(false);
  useEffect(() => { failed.current = events.onFail; });
  useEffect(() => { terminal.current = false; return () => { terminal.current = true; }; }, []);
  const fail = () => { if (!terminal.current) { terminal.current = true; failed.current(); } };
  const send = useRef(inject);
  useEffect(() => { send.current = inject; });
  useEffect(() => {
    // Parsing the style alone does not prove that map tiles can be drawn.
    if (state === 'ready') return;
    const timer = setTimeout(() => { if (!terminal.current) { terminal.current = true; failed.current(); } }, mapReadyMs() + 5_000); // after the page's own deadline
    return () => clearTimeout(timer);
  }, [state]);
  const json = update ? JSON.stringify(update) : '';
  useEffect(() => {
    // The page can take updates as soon as its style is parsed; the tiles may still be loading.
    if (!json) return;
    const { center, ...rest } = JSON.parse(json) as { center?: Point; mode?: string };
    // Only a new centre re-arms the guard: another field changing, or drawing→ready, must not undo a gesture that already took over.
    const centerKey = center ? JSON.stringify(center) : '';
    if (center && armed.current !== centerKey) {
      armed.current = centerKey;
      expectedCenter.current = center; // the centre the bridge must report; a gesture invalidates it
    }
    if (state === 'loading' || sent.current === json) return;
    sent.current = json;
    // A gesture report is already on screen, and a centre already sent must not pull the camera back when another field
    // changes: only a centre that is new, and not the one the map just reported, crosses as a camera command. Entering a
    // mode always carries it: the page goes back to the last centre it was told, which may be older than the camera.
    const entered = rest.mode !== modeSent.current;
    modeSent.current = rest.mode;
    const echo = !center || (!entered && (centerSent.current === centerKey || (reported.current?.latitude === center.latitude && reported.current.longitude === center.longitude)));
    if (center) centerSent.current = centerKey;
    if (echo && !Object.keys(rest).length) return;
    send.current(echo ? JSON.stringify(rest) : json);
  }, [state, json]);
  const receive = (data: unknown) => {
    if (terminal.current) return;
    let m: MapMessage;
    try { m = JSON.parse(String(data)); } catch { return; }
    if (m.type === 'ready') { setState('ready'); events.onReady?.(); }
    else if (m.type === 'failed') fail();
    // The style is parsed and the map is drawing: the tiles may still be coming, but the map works.
    else if (m.type === 'drawing') setState('drawing');
    else if (m.type === 'gesture') { expectedCenter.current = null; events.onGesture?.(); }
    else if (m.type === 'moving') events.onMoving?.();
    else if (m.type === 'center' && Number.isFinite(m.latitude) && Number.isFinite(m.longitude)) {
      const expected = expectedCenter.current;
      // Ignore the old viewport while a fresh fix is still crossing the bridge.
      if (expected && Math.abs(expected.latitude - m.latitude) + Math.abs(expected.longitude - m.longitude) > 0.000001) return;
      reported.current = { latitude: m.latitude, longitude: m.longitude };
      events.onCenter?.(reported.current);
    }
  };
  return { state, receive, fail };
}
