import { Linking } from 'react-native';

/** External handoff is not successful until the platform resolves it; callers own the localized error presentation. */
export async function openExternal(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
