// Android map (SPEC-android-map.md): the APK has no Google Maps key, so it shows the same MapLibre + OpenFreeMap map as
// the web app, drawn by public/map.html (served by the Wind API) inside a WebView. Any failure shows the diagram.
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
function MapPage({ config, height, update, onCenter, onFail, onReady, label }: {
  config: object; height: number; update?: object; onCenter?: (p: { latitude: number; longitude: number }) => void; onFail: () => void; onReady?: () => void; label?: string;
}) {
  const view = useRef<WebView>(null);
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const failed = useRef(onFail);
  const fail = () => failed.current();
  // The fragment stays on the device (never sent in the request); the page reads it once.
  const [uri] = useState(() => `${PAGE}#${encodeURIComponent(JSON.stringify({ ...config, colors }))}`);
  useEffect(() => {
    if (state !== 'loading') return;
    const timer = setTimeout(() => failed.current(), 25_000); // after the page's own 20 s deadline, like web
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
      // Android kills a background WebView's renderer to free memory; the view then stays blank.
      onError={fail} onHttpError={fail} onRenderProcessGone={fail}
      onMessage={e => {
        let m: Message;
        try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
        if (m.type === 'ready') { setState('ready'); onReady?.(); }
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
  const [attempt, setAttempt] = useState(0);
  const config = { mode: 'route', language, pickup, dropoff, driver: driver ?? null, recenter: c.recenter,
    padding: Math.round(Math.min(56, height / 5)) }; // markers clear of the edges without zooming a short map out
  const update = { driver: driver ? { latitude: driver.latitude, longitude: driver.longitude, heading: driver.heading ?? null, accuracy: driver.accuracy ?? null } : null,
    road: props.road ?? null, approach: props.approach ?? null, closed: props.closed ?? [], focus: props.focus, stale: !!props.stale };
  if (failed) return <View>
    <RoutePreview {...props} />
    <View style={[StyleSheet.absoluteFill, styles.cover]}><Retry onPress={() => { setFailed(false); setAttempt(n => n + 1); }} /></View>
  </View>;
  return <MapPage key={`${language}:${attempt}`} config={config} height={height} update={update} onFail={() => setFailed(true)}
    label={`${c.routeDiagram}: ${props.pickupTitle} → ${props.dropoffTitle}${driver ? ` · ${props.driverTitle ?? ''}` : ''}`} />;
}

/** Fixed centre pin over a draggable map; reports the centre when the map stops moving. */
export function PinMap({ center, onChange, onFail, onReady, height = 320 }: PinMapProps) {
  const { language } = useCopy();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The sheet offers no pin to confirm until the map says it is ready again.
  if (failed) return <View style={{ height, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6ECE3' }}>
    <Retry onPress={() => { setFailed(false); setAttempt(n => n + 1); }} />
  </View>;
  return <MapPage key={`${language}:${attempt}`} config={{ mode: 'pin', language, center }} height={height} onCenter={onChange}
    onReady={onReady} onFail={() => { setFailed(true); onFail?.(); }} />;
}

function Retry({ onPress }: { onPress: () => void }) {
  const { c } = useCopy();
  return <Pressable onPress={onPress} accessibilityRole="button" style={styles.retry}><Text>{c.retry}</Text></Pressable>;
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: palette.card, borderRadius: 12 },
});
