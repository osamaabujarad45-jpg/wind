// Whether this device registered for native push (native-push.ts sets it). local-alert.ts stays quiet once the server's push
// carries the alerts. No imports on purpose: native-push.ts is loaded by node tests that stub each of its imports by name.
// Keyed by the API session that registered: a sign-out, a server-ended session or another account changes the session, so a
// mute from the old session never carries over (Haiku review of the push delivery gate). null = the server is not delivering push for us.
let registeredSession: number | null = null;
export const nativePushRegistered = (session: number) => registeredSession === session;
export function setNativePushRegistered(session: number | null) { registeredSession = session; }
