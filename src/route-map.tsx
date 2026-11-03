// Web maps (browser and iPhone home-screen app): public/map.html in an iframe (src/scene-map.tsx), the same page the
// Android app draws. A Google-keyed build (extra.googleMaps.web) that the user opted into draws with google-map.web.tsx instead.
import GoogleRouteMap, { PinMap as GooglePinMap } from './google-map.web';
import { MapProviderBoundary } from './map-provider-boundary';
import type { PinMapProps, RouteMapProps } from './route-preview';
import { BaselinePin, BaselineRoute } from './scene-map';

export type { PinMapProps, RouteMapProps };
export const canPin = true;

export default function RouteMap(props: RouteMapProps) {
  return <MapProviderBoundary platform="web" route={props} google={GoogleRouteMap} baseline={BaselineRoute} />;
}

export function PinMap(props: PinMapProps) {
  return <MapProviderBoundary platform="web" pin={props} google={GooglePinMap} baseline={BaselinePin} />;
}
