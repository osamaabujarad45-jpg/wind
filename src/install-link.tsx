import { Linking, Platform } from 'react-native';
import { API_URL } from './api';
import { Button, useCopy } from './ui';

/** Safari provides the system installation action; this button opens the instructions. */
export function InstallLink() {
  const { c } = useCopy();
  // iPhone-only steps: Android and desktop browsers never see them (A53 loop 19; design review D-36). iPadOS reports as a Mac with touch.
  if (Platform.OS !== 'web') return null;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!ios || (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches) return null;
  return <Button title={c.installIphone} icon="phone-portrait-outline" variant="ghost" size="sm"
    onPress={() => { void Linking.openURL(`${API_URL}/install.html`).catch(() => undefined); }} />;
}
