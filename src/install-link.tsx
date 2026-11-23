import { Linking, Platform } from 'react-native';
import { API_URL } from './api';
import { Button, useCopy } from './ui';

/** The web app's way to the real install: the APK on Android, Safari's Add to Home Screen on iPhone, the download page elsewhere.
 *  Hidden inside the native app and inside an installed Home Screen app. iPadOS reports as a Mac with touch. */
export function InstallLink() {
  const { c } = useCopy();
  if (Platform.OS !== 'web') return null;
  const agent = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches) return null;
  const android = /Android/i.test(agent);
  return <Button title={ios ? c.installIphone : android ? c.installAndroid : c.getTheApp} icon={android ? 'logo-android' : 'phone-portrait-outline'}
    variant={android ? 'soft' : 'ghost'} size="sm"
    onPress={() => { void Linking.openURL(`${API_URL}/install.html${android ? '#android' : ios ? '#iphone' : ''}`).catch(() => undefined); }} />;
}
