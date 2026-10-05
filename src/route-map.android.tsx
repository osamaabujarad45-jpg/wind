// Android map (SPEC-android-map.md): the APK has no Google Maps key, so it shows the same MapLibre + OpenFreeMap map as
// the web app, drawn by public/map.html (served by the Wind API) inside a WebView. Any failure shows the diagram.
import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_URL } from './api';
import RoutePreview, { type PinMapProps, type RouteMapProps } from './route-preview';
import { palette, useCopy } from './ui';

export type { PinMapProps, RouteMapProps };
export const canPin = true;
const PAGE = `${API_URL}/map.html`;
const colors = { forest: palette.forest, olive: palette.olive, clay: palette.clay, blue: palette.blue };

type Message = { type: 'ready' | 'failed' } | { type: 'center'; latitude: number; longitude: number };

/** WebView on public/map.html; calls onFail if the page fails or never says it is ready (offline, blocked, server without the page). */
function MapPage({ config, height, update, onCenter, onFail, label }: {
  config: object; height: number; update?: object; onCenter?: (p: { latitude: number; longitude: number }) => void; onFail: () => void; label?: string;
}) {
  const view = useRef<WebView>(null);
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const failed = useRef(onFail);
  const fail = () => failed.current();
  // The fragment stays on the device (never sent in the request); the page reads it once.
  const [uri] = useState(() => `${PAGE}#${encodeURIComponent(JSON.stringify({ ...config, colors }))}`);
  useEffect(() => {
    if (state !== 'loading') return;
    const timer = setTimeout(() => failed.current(), 15_000);
    return () => clearTimeout(timer);
  }, [state]);
  const json = update ? JSON.stringify(update) : '';
  useEffect(() => {
    if (state === 'ready' && json) view.current?.injectJavaScript(`window.wind&&window.wind(${json});true;`);
  }, [state, json]);
  return <View style={{ height, width: '100%' }} accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}>
    <WebView ref={view} source={{ uri }} style={{ flex: 1, backgroundColor: '#E6ECE3' }} originWhitelist={['*']}
      setSupportMultipleWindows={false} overScrollMode="never"
      // Only our map page loads here; map credits and any other link open in the browser.
      onShouldStartLoadWithRequest={r => {
        if (r.url.split('#')[0] === PAGE) return true;
        if (/^https:\/\//.test(r.url)) void Linking.openURL(r.url);
        return false;
      }}
      onError={fail} onHttpError={fail}
      onMessage={e => {
        let m: Message;
        try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
        if (m.type === 'ready') setState('ready');
        else if (m.type === 'failed') fail();
        else if (m.type === 'center' && Number.isFinite(m.latitude) && Number.isFinite(m.longitude)) onCenter?.({ latitude: m.latitude, longitude: m.longitude });
      }} />
  </View>;
}

// Pickup/dropoff can become exact after the first render (order loads, pins confirmed): rebuild the map then.
export default function RouteMap(props: RouteMapProps) {
  const { pickup: a, dropoff: b } = props;
  return <LiveMap key={`${a.latitude},${a.longitude},${b.latitude},${b.longitude}`} {...props} />;
}

function LiveMap(props: RouteMapProps) {
  const { pickup, dropoff, driver, height = 220 } = props;
  const { c, language } = useCopy();
  const [failed, setFailed] = useState(false);
  const config = { mode: 'route', language, pickup, dropoff, driver: driver ?? null, recenter: c.recenter,
    padding: Math.round(Math.min(56, height / 5)) }; // markers clear of the edges without zooming a short map out
  const update = { driver: driver ? { latitude: driver.latitude, longitude: driver.longitude, heading: driver.heading ?? null, accuracy: driver.accuracy ?? null } : null,
    road: props.road ?? null, approach: props.approach ?? null, closed: props.closed ?? [], focus: props.focus };
  if (failed) return <RoutePreview {...props} />;
  return <MapPage key={language} config={config} height={height} update={update} onFail={() => setFailed(true)}
    label={`${c.routeDiagram}: ${props.pickupTitle} → ${props.dropoffTitle}${driver ? ` · ${props.driverTitle ?? ''}` : ''}`} />;
}

/** Fixed centre pin over a draggable map; reports the centre when the map stops moving. */
export function PinMap({ center, onChange, height = 320 }: PinMapProps) {
  const { language } = useCopy();
  const [failed, setFailed] = useState(false);
  if (failed) return null; // like the web picker: the sheet keeps its confirm button and the starting point
  return <MapPage key={language} config={{ mode: 'pin', language, center }} height={height} onCenter={onChange} onFail={() => setFailed(true)} />;
}
