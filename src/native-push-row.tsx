// Notifications on this phone (Account). The web row (PushRow) covers browsers; on Android and iOS the system owns the
// permission, so this row shows it and gives the one way back from Blocked: the app's system settings (Haiku polish H1).
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Linking, Platform } from 'react-native';
import { nativePushState, registerNativePush } from './native-push';
import { ListRow, Txt, useCopy } from './ui';

type State = Awaited<ReturnType<typeof nativePushState>>;

export function NativePushRow() {
  const { c, language } = useCopy();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const read = useCallback(() => { void nativePushState().then(setState); }, []);
  // Back from the system settings, the row reads the new answer.
  useEffect(() => {
    read();
    const sub = AppState.addEventListener('change', next => { if (next === 'active') read(); });
    return () => sub.remove();
  }, [read]);
  if (Platform.OS === 'web' || !state || state === 'unsupported') return null;
  async function press() {
    if (busy) return;
    // On, or blocked: only the system settings change it. Off: ask now, the person's own tap.
    if (state !== 'off') { void Linking.openSettings().catch(() => undefined); return; }
    setBusy(true);
    try {
      await registerNativePush(language, 'tap');
      const next = await nativePushState();
      setState(next);
      // Off after a dismissed dialog is not Blocked: only a blocked state points to the settings (Haiku polish r3 R3-1).
      AccessibilityInfo.announceForAccessibility(next === 'on' ? c.pushEnabled : next === 'denied' ? c.pushDeniedHelpNative : c.pushDisabled);
    } finally { setBusy(false); }
  }
  return <>
    <ListRow icon="notifications-outline" label={c.pushRow} tone="blue" onPress={() => { void press(); }}
      value={busy ? '…' : state === 'on' ? c.pushOn : state === 'denied' ? c.pushDenied : c.pushOff} />
    {state === 'denied' && <Txt variant="caption" style={{ paddingHorizontal: 16, paddingBottom: 10 }}>{c.pushDeniedHelpNative}</Txt>}
  </>;
}
