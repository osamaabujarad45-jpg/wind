import { Platform } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker } from 'react-native-maps';
import RoutePreview from './RoutePreview';

type Props = {
  pickup: { latitude: number; longitude: number };
  dropoff: { latitude: number; longitude: number };
  pickupTitle: string;
  dropoffTitle: string;
  sameCity: boolean;
};

// Google Maps on Android crashes without an API key baked into the build.
const mapsAvailable = Platform.OS !== 'android' || Constants.expoConfig?.extra?.androidMaps === true;

export default function RouteMap(props: Props) {
  if (!mapsAvailable) return <RoutePreview {...props} />;
  const { pickup, dropoff, pickupTitle, dropoffTitle, sameCity } = props;
  const center = {
    latitude: (pickup.latitude + dropoff.latitude) / 2,
    longitude: (pickup.longitude + dropoff.longitude) / 2,
    latitudeDelta: Math.max(Math.abs(pickup.latitude - dropoff.latitude) * 2.2, 0.12),
    longitudeDelta: Math.max(Math.abs(pickup.longitude - dropoff.longitude) * 2.2, 0.12),
  };
  return <MapView style={{ height: 200, width: '100%' }} initialRegion={center} scrollEnabled={false} zoomEnabled={false}>
    <Marker coordinate={pickup} title={pickupTitle} pinColor="#34765A" />
    {!sameCity && <Marker coordinate={dropoff} title={dropoffTitle} pinColor="#CB6845" />}
  </MapView>;
}
