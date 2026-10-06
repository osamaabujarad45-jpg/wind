import { Linking, Platform } from 'react-native';
import { API_URL } from './api';
import { Button, useCopy } from './ui';

/** Safari provides the system installation action; this button opens the instructions. */
export function InstallLink() {
  const { c } = useCopy();
  // iPhone-only steps: Android browsers never see them (found on the A53, loop 19).
  if (Platform.OS !== 'web' || /Android/i.test(navigator.userAgent) || (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches) return null;
  return <Button title={c.installIphone} icon="phone-portrait-outline" variant="ghost" size="sm"
    onPress={() => { void Linking.openURL(`${API_URL}/install.html`).catch(() => undefined); }} />;
}
