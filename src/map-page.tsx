// public/map.html in a same-origin iframe: the web app draws exactly the page the Android app does.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMapBridge, type MapEvents } from './map-bridge';
import { mapReadyMs } from './runtime-config';
import { palette } from './ui';

const colors = { forest: palette.forest, olive: palette.olive, clay: palette.clay, blue: palette.blue };
export const MAP_GROUND = '#EEEFEC';
export type MapPageProps = MapEvents & { config: { mode?: string } & Record<string, unknown>; height?: number; fill?: boolean; update?: object };

export function MapPage({ config, height, fill, update, onCenter, onGesture, onMoving, onFail, onReady }: MapPageProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() => `/map.html#${encodeURIComponent(JSON.stringify({ ...config, colors, readyMs: mapReadyMs() }))}`);
  const { receive, fail } = useMapBridge(update, json => {
    (frame.current?.contentWindow as (Window & { wind?: (update: unknown) => void }) | null)?.wind?.(JSON.parse(json));
  }, { onCenter, onGesture, onMoving, onFail, onReady });
  const handle = useRef(receive);
  useEffect(() => { handle.current = receive; });
  useEffect(() => {
    const listener = (event: MessageEvent) => { if (event.source === frame.current?.contentWindow) handle.current(event.data); };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  return <View style={fill ? StyleSheet.absoluteFill : { height, width: '100%' }}>
    <iframe ref={frame} src={src} title="map" onError={fail} style={{ border: 0, width: '100%', height: '100%', display: 'block', background: MAP_GROUND }} />
  </View>;
}
