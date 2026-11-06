// WP06 phone verification and recovery: pure rules shared by the profile card, the recovery form and the tests.
// Truthful states: an accepted provider answer is never "delivered", and a verified proof means phone control only.
// No React, no Expo imports here, so node tests load this file directly.

import { latinDigits } from '../model.ts';

export type Delivery = 'prepared' | 'requested' | 'accepted' | 'failed' | 'unknown' | 'obsolete' | 'suppressed';

export type Capabilities = {
  available: boolean; enabled: boolean; sendAcceptance?: boolean; supportedContext?: string;
  policy?: { codeSeconds: number; maxAttempts: number; resendSeconds: number };
};

// Mirrors server/domain/phone-number.ts: explicit Palestinian mobile forms only. The server decides; this only stops obvious typos.
const PHONE_FORMS = [/^05[69]\d{7}$/, /^5[69]\d{7}$/, /^\+(970|972)5[69]\d{7}$/];

/** Western digits, no spaces, dashes or brackets; `00` becomes `+` as the server reads it. */
export function normalizePhoneInput(raw: string): string {
  const digits = raw.trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[\s().-]/g, '');
  return digits.startsWith('00') ? `+${digits.slice(2)}` : digits;
}

export function phoneInputOk(raw: string): boolean {
  const value = normalizePhoneInput(raw);
  return PHONE_FORMS.some(form => form.test(value));
}

export function codeInput(raw: string, length = 6): string {
  return latinDigits(raw).replace(/\D/g, '').slice(0, length);
}

/** Two gates the server reports: the module exists (SQLite cannot run it) and the provider is switched on. */
export type Gate = 'checking' | 'failed' | 'unavailable' | 'disabled' | 'ready';
export function gateOf(caps: Capabilities | null, failed: boolean): Gate {
  if (failed) return 'failed';
  if (!caps) return 'checking';
  if (!caps.available) return 'unavailable';
  if (!caps.enabled) return 'disabled';
  return 'ready';
}

/** Why a control waits, as a copy key. Each gate has a reason; `ready` has none. */
export const gateReasonKey = (gate: Gate) => `phone_reason_${gate}` as const;

/** One sentence per provider outcome. `accepted` says the provider took it, not that the handset received it. */
export function deliveryKey(state: Delivery | string): `phone_state_${string}` {
  switch (state) {
    case 'accepted': return 'phone_state_accepted';
    case 'failed': return 'phone_state_failed';
    case 'unknown': return 'phone_state_unknown';
    case 'obsolete': return 'phone_state_obsolete';
    case 'suppressed': return 'phone_state_suppressed';
    default: return 'phone_state_recorded'; // prepared, requested: recorded, provider not yet answered
  }
}

export const awaitingProvider = (state: string) => state === 'prepared' || state === 'requested';

/** A code can still prove control: the server refuses proof for failed, obsolete and suppressed challenges. */
export function codeUsable(c: { deliveryState: string; expiresAt: number; attempts: number }, now: number, maxAttempts = 5) {
  return c.expiresAt > now && c.attempts < maxAttempts && !['failed', 'obsolete', 'suppressed'].includes(c.deliveryState);
}

export const secondsUntil = (ms: number, now: number) => Math.max(0, Math.ceil((ms - now) / 1000));

/** m:ss with Western digits, so the countdown reads the same in Arabic and English. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Only these failures leave the server's outcome unknown: the request may have run. Any answer with an error code is final. */
const UNKNOWN_OUTCOMES = new Set(['network', 'aborted', 'server_error', 'session_changed']);
export const outcomeOf = (code: string): 'unknown' | 'definitive' => UNKNOWN_OUTCOMES.has(code) ? 'unknown' : 'definitive';

/** A challenge from the server's own view (newest first), for one purpose. The server owns expiry, attempts and delivery. */
export type ViewChallenge = { id: string; purpose: string; delivery_state: string; expires_at: number; attempts: number; resend_at: number | null;
  effectiveDeliveryState: string };
export function latestChallenge(challenges: ViewChallenge[], purposes: string[]): { id: string; purpose: string; deliveryState: string; expiresAt: number;
  attempts: number; resendAt: number } | null {
  const c = challenges.find(x => purposes.includes(x.purpose));
  return c ? { id: c.id, purpose: c.purpose, deliveryState: c.effectiveDeliveryState || c.delivery_state, expiresAt: c.expires_at,
    attempts: c.attempts, resendAt: c.resend_at ?? 0 } : null;
}

/** Stable keys for the non-secret payload. A replay with the same key may reuse its command ID; anything else gets a new one. */
export const issueKey = (parts: { kind: string; phone: string; purpose: string; revision: number }) =>
  ['issue', parts.kind, parts.phone, parts.purpose, String(parts.revision)].join('|');
