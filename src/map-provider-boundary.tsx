import { useEffect, useRef, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const mounted = useRef(true); // child effects run before this component's own, so start mounted
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
      onGesture={() => { if (current()) callbacks.current?.onGesture?.(); }}
      onMoving={() => { if (current()) callbacks.current?.onMoving?.(); }}
      onChange={point => { if (current()) callbacks.current?.onChange(point); }} />;
  }
  const props = route ?? pin;
  return <View style={[props?.fill ? StyleSheet.absoluteFill : { height: props?.height ?? 220, width: '100%' }, { backgroundColor: '#E6ECE3' }]}>
    {route && <RoutePreview {...route} />}
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable accessibilityRole="button" onPress={() => retryMapProviders(choice.key)}
        style={{ minHeight: 48, minWidth: 48, padding: 12, backgroundColor: palette.card, borderRadius: 12, transform: [
          { translateX: ((props?.insets?.left ?? 0) - (props?.insets?.right ?? 0)) / 2 },
          { translateY: ((props?.insets?.top ?? 0) - (props?.insets?.bottom ?? 0)) / 2 },
        ] }}>
        <Text>{c.retry}</Text>
      </Pressable>
    </View>
  </View>;
}
