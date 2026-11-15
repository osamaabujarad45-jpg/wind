// Shared by route and pin maps. Failed scripts must be removed so Retry can actually fetch again.
import { effectiveRuntime } from './runtime-config.ts';
let pending: Promise<any> | null = null;

export function loadGoogleMaps(key: string): Promise<any> {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    document.getElementById('wind-google-maps')?.remove();
    const tag = Object.assign(document.createElement('script'), {
      id: 'wind-google-maps', async: true,
      src: `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=windGoogleMapsReady&loading=async`,
    });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete window.windGoogleMapsReady;
      if (error) { tag.remove(); pending = null; reject(error); }
      else resolve(window.google!.maps);
    };
    const timer = setTimeout(() => finish(new Error('google maps timeout')), effectiveRuntime().values.mapReadyTimeoutMs);
    window.windGoogleMapsReady = () => finish(window.google?.maps?.Map ? undefined : new Error('google maps did not initialize'));
    tag.onerror = () => finish(new Error('google maps failed to load'));
    document.head.appendChild(tag);
  });
  return pending;
}

declare global {
  interface Window { windGoogleMapsReady?: () => void }
}
