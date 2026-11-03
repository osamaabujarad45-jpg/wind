// public/map.html in a WebView, served by the Wind API (SPEC-android-map.md): the baseline APK has no Google Maps key.
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_URL } from './api';
import { useMapBridge, type MapEvents } from './map-bridge';
import { mapReadyMs } from './runtime-config';
import { palette } from './ui';

const PAGE = `${API_URL}/map.html`;
const colors = { forest: palette.forest, olive: palette.olive, clay: palette.clay, blue: palette.blue };
export const MAP_GROUND = '#EEEFEC';
export type MapPageProps = MapEvents & { config: { mode?: string } & Record<string, unknown>; height?: number; fill?: boolean; update?: object };

/** Calls onFail if the page fails or never says it is ready (offline, blocked, server without the page). */
export function MapPage({ config, height, fill, update, onCenter, onGesture, onMoving, onFail, onReady }: MapPageProps) {
  const view = useRef<WebView>(null);
  // The fragment stays on the device (never sent in the request); the page reads it once.
  const [uri] = useState(() => `${PAGE}#${encodeURIComponent(JSON.stringify({ ...config, colors, readyMs: mapReadyMs() }))}`);
  const { receive, fail } = useMapBridge(update, json => view.current?.injectJavaScript(`window.wind&&window.wind(${json});true;`), { onCenter, onGesture, onMoving, onFail, onReady });
  // Not an accessible group: that would hide the page's own Recenter button. The page labels its map itself.
  return <View style={fill ? StyleSheet.absoluteFill : { height, width: '100%' }}>
    <WebView ref={view} source={{ uri }} style={{ flex: 1, backgroundColor: MAP_GROUND }} originWhitelist={['*']} textZoom={100}
      setSupportMultipleWindows={false} overScrollMode="never" androidLayerType="hardware"
      // Only our map page loads here; map credits and any other link open in the browser.
      onShouldStartLoadWithRequest={r => {
        if (r.url.split('#')[0] === PAGE) return true;
        if (/^https:\/\//.test(r.url)) void Linking.openURL(r.url);
        return false;
      }}
      // Android kills a background WebView's renderer to free memory; the view then stays blank.
      onError={fail} onHttpError={fail} onRenderProcessGone={fail}
      onMessage={e => receive(e.nativeEvent.data)} />
  </View>;
}
