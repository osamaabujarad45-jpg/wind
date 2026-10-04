import { Linking, Platform } from 'react-native';
import { API_URL } from './api';
import { Button, useCopy } from './ui';

/** Safari provides the system installation action; this button opens the instructions. */
export function InstallLink() {
  const { c } = useCopy();
  if (Platform.OS !== 'web' || (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches) return null;
  return <Button title={c.installIphone} icon="phone-portrait-outline" variant="ghost" size="sm"
    onPress={() => { void Linking.openURL(`${API_URL}/install.html`).catch(() => undefined); }} />;
}
