/** Opt-in presentation contracts. Existing lifecycle, pricing and dispatch authorities remain unchanged. */
export type JourneyEta = { schemaVersion: 1; rawSeconds: number | null; minSeconds: number; maxSeconds: number;
  accuracy: 'unknown' | 'low' | 'medium' | 'high'; basis: 'heuristic' | 'quote_band' | 'straight_line';
  serverTime: number; validity: { issuedAt: number; expiresAt: number; expiresInSeconds: number } };
export type FareAmounts = { grossMinor: number; discountMinor: number; dueMinor: number };
export type FareChange = { schemaVersion: 1; changeId: string; occurredAt: number; currency: 'ILS';
  reason: 'destination_changed'; before: FareAmounts; after: FareAmounts };
export type Journey = { schemaVersion: 1; serverTime: number;
  offer?: { offerId: string; issuedAt: number; expiresAt: number; acceptWindowSeconds: number; eta?: JourneyEta };
  boarding?: { policy: 'all_trips' | 'not_required' | 'unknown'; reason: 'provider_setting'; required: boolean;
    locked: boolean; shouldShow: boolean; isVerified: boolean | null; pinIssuedAt: number | null; pinRevision: number; pin?: string };
  waiting?: { waitingEndsAt: number | null; state: 'not_arrived' | 'waiting' | 'elapsed' | 'ended' };
  lastFareChange?: FareChange };
export type OfferFailure = { schemaVersion: 1; verb: 'accept' | 'decline'; code: string;
  category: 'invalid' | 'authentication' | 'unavailable' | 'conflict' | 'transient';
  recovery: 'review' | 'sign_in' | 'stop' | 'refresh' | 'reconcile' };
