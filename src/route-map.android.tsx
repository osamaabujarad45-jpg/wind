// Android maps: the baseline APK has no Google Maps key, so it shows public/map.html in a WebView (src/scene-map.tsx). When the
// binary was built with a restricted Google key (extra.googleMaps) and the user selected the Google mode, the native
// Google renderer draws instead. Any failure shows the diagram.
import GoogleRouteMap, { PinMap as GooglePinMap } from './google-map.native';
import { MapProviderBoundary } from './map-provider-boundary';
import type { PinMapProps, RouteMapProps } from './route-preview';
import { BaselinePin, BaselineRoute } from './scene-map';

export type { PinMapProps, RouteMapProps };
export const canPin = true;

export default function RouteMap(props: RouteMapProps) {
  return <MapProviderBoundary platform="android" route={props} google={GoogleRouteMap} baseline={BaselineRoute} />;
}

export function PinMap(props: PinMapProps) {
  return <MapProviderBoundary platform="android" pin={props} google={GooglePinMap} baseline={BaselinePin} />;
}
