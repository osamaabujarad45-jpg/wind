// Whether this device registered for native push (native-push.ts sets it). local-alert.ts stays quiet once the server's push
// carries the alerts. No imports on purpose: native-push.ts is loaded by node tests that stub each of its imports by name.
let registered = false;
export const nativePushRegistered = () => registered;
export function setNativePushRegistered(value: boolean) { registered = value; }
