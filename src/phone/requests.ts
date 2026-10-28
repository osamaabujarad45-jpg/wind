// The eight WP06 phone routes (server/domain/phone-identity.ts, registerPhoneRoutes). Body builders send exactly the fields
// each route accepts: the server rejects any extra key with invalid_input, so nothing optional is sent as `undefined`.
import type { Capabilities, Delivery, ViewChallenge } from './flow.ts';

export type Call = <T>(path: string, body?: object) => Promise<T>;

export type SelfView = {
  identityRevision: number; legacyPhone: string;
  profile: { verification_state: string; display_phone: string } | null;
  mappings: { canonical_group: string; routing_e164: string; state: string; version: number; country_context: string }[];
  challenges: ViewChallenge[]; capabilities: Capabilities;
};
export type Issued = { challengeId: string; state: string; expiresAt: number; resendAfterSeconds: number; deliveryState?: Delivery; accountStateConcealed?: boolean };
export type Proved = { ok: true; phoneVerified?: boolean; sessionsRevoked?: boolean };

export function phoneRequests(call: Call) {
  return {
    capabilities: () => call<Capabilities>('/phone/capabilities'),
    self: () => call<SelfView>('/me/phone'),
    issueSelf: (body: ReturnType<typeof issueBody>) => call<Issued>('/me/phone/challenges', body),
    proveSelf: (body: ReturnType<typeof proveBody>) => call<Proved>('/me/phone/verify', body),
    issueRecovery: (body: ReturnType<typeof recoveryIssueBody>) => call<Issued>('/auth/phone/recovery/challenges', body),
    proveRecovery: (body: ReturnType<typeof recoveryProveBody>) => call<Proved>('/auth/phone/recovery/verify', body),
  };
}

export function issueBody(p: { commandId: string; deviceId: string; phone: string; purpose: 'verify' | 'change'; expectedRevision: number; currentPassword?: string }) {
  return {
    commandId: p.commandId, deviceId: p.deviceId, phone: p.phone, countryContext: 'PS' as const, purpose: p.purpose, expectedRevision: p.expectedRevision,
    ...(p.purpose === 'change' && { currentPassword: p.currentPassword ?? '' }),
  };
}

export function proveBody(p: { commandId: string; deviceId: string; challengeId: string; purpose: 'verify' | 'change'; code: string }) {
  return { commandId: p.commandId, deviceId: p.deviceId, challengeId: p.challengeId, purpose: p.purpose, code: p.code };
}

export function recoveryIssueBody(p: { commandId: string; deviceId: string; phone: string }) {
  return { commandId: p.commandId, deviceId: p.deviceId, phone: p.phone, countryContext: 'PS' as const };
}

export function recoveryProveBody(p: { commandId: string; deviceId: string; challengeId: string; code: string; password: string }) {
  return { commandId: p.commandId, deviceId: p.deviceId, challengeId: p.challengeId, purpose: 'recovery' as const, code: p.code, password: p.password };
}
