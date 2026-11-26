import { useEffect, useRef, type ReactNode } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { effectiveMapProvider, type MapRenderer } from './map-provider';
import { recordMapFailure, retryMapProviders } from './map-failures';
import { useMapMode } from './map-mode';
import RoutePreview, { type PinMapProps, type RouteMapProps } from './route-preview';
import { palette, useCopy } from './ui';

/** One owner for provider attempts. Adapters never retry or revive a failed policy attempt. */
export type MapAttempt = { key: string; renderer: MapRenderer; onFail: () => void; onReady: () => void; current: () => boolean };
export function MapProviderBoundary({ platform, route, pin, render }: {
  platform: string; route?: RouteMapProps; pin?: PinMapProps;
  render: (props: { attempt: MapAttempt; route?: RouteMapProps; pin?: PinMapProps }) => ReactNode;
}) {
  const [mode] = useMapMode();
  const baked = Constants.expoConfig?.extra?.googleMaps;
  const choice = effectiveMapProvider(platform, baked, mode, route?.forceBaseline);
  const attemptKey = `${choice.key}:${choice.generation}:${choice.renderer}`;
  const mounted = useRef(false);
  const callbacks = useRef(pin);
  useEffect(() => { callbacks.current = pin; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (choice.renderer) callbacks.current?.onLoading?.();
    else callbacks.current?.onFail?.();
  }, [attemptKey, choice.renderer]);
  const current = () => {
    const next = effectiveMapProvider(platform, baked, mode, route?.forceBaseline);
    return mounted.current && next.key === choice.key && next.generation === choice.generation && next.renderer === choice.renderer;
  };
  const fail = () => {
    if (!current() || !choice.renderer) return;
    callbacks.current?.onFail?.();
    recordMapFailure(choice.key, choice.renderer, choice.generation);
  };
  // An exhausted map recovers without a tap: the browser coming back online (web) or the app becoming active (native).
  // Leaving the app spends no retry. The listeners exist only while nothing can render, so a live map never hears them.
  const exhausted = !choice.renderer;
  const scope = choice.key;
  useEffect(() => {
    if (!exhausted) return;
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      const online = () => retryMapProviders(scope);
      window.addEventListener('online', online);
      return () => window.removeEventListener('online', online);
    }
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') retryMapProviders(scope); });
    return () => subscription.remove();
  }, [exhausted, scope]);
  const { c } = useCopy();
  const Adapter = render;
  if (choice.renderer) return <Adapter route={route} pin={pin} attempt={{ key: attemptKey, renderer: choice.renderer, onFail: fail,
    onReady: () => { if (current()) callbacks.current?.onReady?.(); }, current }} />;
  // Retry is laid over the preview, not stacked under it: a 150px box cannot overflow, and the button stays centred on the map.
  return <View style={{ height: route?.height ?? pin?.height ?? 220, justifyContent: 'center', backgroundColor: '#E6ECE3' }}>
    {route && <RoutePreview {...route} />}
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable accessibilityRole="button" onPress={() => retryMapProviders(scope)}
        style={{ minHeight: 44, padding: 12, backgroundColor: palette.card, borderRadius: 12 }}>
        <Text>{c.retry}</Text>
      </Pressable>
    </View>
  </View>;
}
