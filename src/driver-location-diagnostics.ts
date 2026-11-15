import type { TrackingReceipt } from './location-delivery';

export type DriverLocationDiagnostics = {
  lastAcceptedFixAt: number | null;
  lastServerAcknowledgementAt: number | null;
  requested: boolean | null;
  registration: 'registered' | 'unregistered' | 'unknown' | 'not_applicable';
  foregroundService: 'unknown' | 'not_applicable';
  nextRetry: 'fresh_fix' | 'none' | 'unknown';
};

// Select metadata explicitly: support views must never receive coordinates, credentials or assignment IDs.
export function driverLocationDiagnostics(receipt: TrackingReceipt | null, requested: boolean | null, registered: boolean | null,
  platform: string): DriverLocationDiagnostics {
  const timestamp = (value?: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  return {
    lastAcceptedFixAt: timestamp(receipt?.fixAt),
    // Old receipts only record request-start time; it cannot stand in for the response time.
    lastServerAcknowledgementAt: timestamp(receipt?.acknowledgedAt),
    requested,
    registration: platform === 'web' ? 'not_applicable' : registered === null ? 'unknown' : registered ? 'registered' : 'unregistered',
    // Expo reports task registration, not whether Android's OS foreground service is alive.
    foregroundService: platform === 'android' ? 'unknown' : 'not_applicable',
    // A native retry is only promised when the task is known to be registered; an unreadable status cannot promise one.
    nextRetry: requested === false ? 'none' : requested === null || (platform !== 'web' && registered !== true) ? 'unknown' : 'fresh_fix',
  };
}

/** Field-by-field equality, so the three-second status poll can keep the previous object and skip a re-render. */
export const sameDiagnostics = (a: DriverLocationDiagnostics | undefined, b: DriverLocationDiagnostics) =>
  !!a && (Object.keys(b) as (keyof DriverLocationDiagnostics)[]).every(key => a[key] === b[key]);
