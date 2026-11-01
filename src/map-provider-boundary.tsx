import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { effectiveMapProvider, type MapRenderer } from './map-provider';
import { recordMapFailure, retryMapProviders } from './map-failures';
import { useMapMode } from './map-mode';
import RoutePreview, { type PinMapProps, type RouteMapProps } from './route-preview';
import { palette, useCopy } from './ui';

/** One owner for provider attempts. Adapters never retry or revive a failed policy attempt. */
export function MapProviderBoundary({ platform, route, pin, render }: {
  platform: string; route?: RouteMapProps; pin?: PinMapProps;
  render: (attempt: { key: string; renderer: MapRenderer; onFail: () => void; onReady: () => void; current: () => boolean }) => ReactNode;
}) {
  const [mode] = useMapMode();
  const baked = Constants.expoConfig?.extra?.googleMaps;
  const choice = effectiveMapProvider(platform, baked, mode, route?.forceBaseline);
  const attemptKey = `${choice.key}:${choice.generation}:${choice.renderer}`;
  const callbacks = useRef(pin);
  useEffect(() => { callbacks.current = pin; });
  // A new attempt starts unready: the pin cannot be confirmed until this renderer reports its own readiness.
  useEffect(() => { callbacks.current?.onFail?.(); }, [attemptKey]);
  // Called from adapter events only, never during render. A retired attempt no longer matches the live
  // policy, and recordMapFailure ignores its generation too.
  const current = () => {
    const next = effectiveMapProvider(platform, baked, mode, route?.forceBaseline);
    return next.key === choice.key && next.generation === choice.generation && next.renderer === choice.renderer;
  };
  const fail = () => {
    if (!current() || !choice.renderer) return;
    pin?.onFail?.();
    recordMapFailure(choice.key, choice.renderer, choice.generation);
  };
  const { c } = useCopy();
  if (choice.renderer) return render({ key: attemptKey, renderer: choice.renderer, onFail: fail,
    onReady: () => { if (current()) pin?.onReady?.(); }, current });
  return <View style={{ height: route?.height ?? pin?.height ?? 220, justifyContent: 'center', backgroundColor: '#E6ECE3' }}>
    {route && <RoutePreview {...route} />}
    <Pressable accessibilityRole="button" onPress={() => retryMapProviders(choice.key)}
      style={{ minHeight: 44, padding: 12, alignSelf: 'center', backgroundColor: palette.card, borderRadius: 12 }}>
      <Text>{c.retry}</Text>
    </Pressable>
  </View>;
}
