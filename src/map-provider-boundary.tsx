import { useEffect, useRef, type ComponentType } from 'react';
import { Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { effectiveMapProvider } from './map-provider';
import { recordMapFailure, retryMapProviders } from './map-failures';
import { currentMapMode, useMapMode } from './map-mode';
import RoutePreview, { type PinMapProps, type RouteMapProps } from './route-preview';
import { palette, useCopy } from './ui';

/** One owner for provider attempts: each attempt mounts the Google or the platform's baseline map fresh, and
 * renderers never retry or revive a failed policy attempt. Pass route or pin; google/baseline draw that kind. */
export function MapProviderBoundary({ platform, route, pin, google: Google, baseline: Baseline }: {
  platform: string; route?: RouteMapProps; pin?: PinMapProps;
  google: ComponentType<RouteMapProps> | ComponentType<PinMapProps>; baseline: ComponentType<RouteMapProps> | ComponentType<PinMapProps>;
}) {
  const [mode] = useMapMode();
  const baked = Constants.expoConfig?.extra?.googleMaps;
  const forceBaseline = route?.forceBaseline ?? pin?.forceBaseline;
  const choice = effectiveMapProvider(platform, baked, mode, forceBaseline);
  const attemptKey = `${choice.key}:${choice.generation}:${choice.renderer}`;
  const mounted = useRef(false);
  const callbacks = useRef(pin);
  useEffect(() => { callbacks.current = pin; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Every attempt starts unready (loading is not a failure: no error text); only an exhausted policy fails the pin.
  useEffect(() => {
    if (choice.renderer) callbacks.current?.onLoading?.();
    else callbacks.current?.onFail?.();
  }, [attemptKey, choice.renderer]);
  // Called from renderer events only, never during render: reads the live mode so a retired attempt cannot match.
  const current = () => {
    const next = effectiveMapProvider(platform, baked, currentMapMode(), forceBaseline);
    return mounted.current && next.key === choice.key && next.generation === choice.generation && next.renderer === choice.renderer;
  };
  // The recorded failure re-renders into the next attempt; the effect above fails the pin only once none is left.
  const fail = () => { if (current() && choice.renderer) recordMapFailure(choice.key, choice.renderer, choice.generation); };
  const { c } = useCopy();
  if (choice.renderer) {
    const Map = (choice.renderer === 'google' ? Google : Baseline) as ComponentType<RouteMapProps & PinMapProps>;
    if (route) return <Map key={`${route.pickup.latitude},${route.pickup.longitude},${route.dropoff.latitude},${route.dropoff.longitude}:${attemptKey}`}
      {...route as RouteMapProps & PinMapProps} onFail={fail} />;
    if (pin) return <Map key={attemptKey} {...pin as RouteMapProps & PinMapProps} onFail={fail}
      onReady={() => { if (current()) callbacks.current?.onReady?.(); }}
      onChange={point => { if (current()) callbacks.current?.onChange(point); }} />;
  }
  return <View style={{ height: route?.height ?? pin?.height ?? 220, justifyContent: 'center', backgroundColor: '#E6ECE3' }}>
    {route && <RoutePreview {...route} />}
    <Pressable accessibilityRole="button" onPress={() => retryMapProviders(choice.key)}
      style={{ minHeight: 44, padding: 12, alignSelf: 'center', backgroundColor: palette.card, borderRadius: 12 }}>
      <Text>{c.retry}</Text>
    </Pressable>
  </View>;
}
