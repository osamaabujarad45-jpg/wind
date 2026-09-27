import { Platform } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker } from 'react-native-maps';
import RoutePreview, { type RouteMapProps } from './route-preview';

// Google Maps on Android crashes without an API key baked into the build.
const mapsAvailable = Platform.OS !== 'android' || Constants.expoConfig?.extra?.androidMaps === true;

export default function RouteMap(props: RouteMapProps) {
  if (!mapsAvailable) return <RoutePreview {...props} />;
  const { pickup, dropoff, pickupTitle, dropoffTitle, driver, driverTitle } = props;
  const points = [pickup, dropoff, ...(driver ? [driver] : [])];
  const lats = points.map(p => p.latitude), lngs = points.map(p => p.longitude);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.6, 0.05),
    longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.6, 0.05),
  };
  return <MapView style={{ height: 220, width: '100%' }} region={region} scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false}>
    <Marker coordinate={pickup} title={pickupTitle} pinColor="#34765A" />
    <Marker coordinate={dropoff} title={dropoffTitle} pinColor="#CB6845" />
    {driver && <Marker coordinate={driver} title={driverTitle} pinColor="#375C86" />}
  </MapView>;
}
