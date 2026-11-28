// The switcher's entry points and row states (FLOWS-2026-11-26 §2.2). Everything here renders only when the server sends
// account profiles, so a single-profile build looks as before.
import { router } from 'expo-router';
import { View } from 'react-native';
import type { Copy } from './copy';
import type { CaptainProfileState, ProfilePreview } from './model';
import { useSession } from './session';
import { useTheme } from './theme-context';
import { fill, IconButton, useCopy } from './ui';

/** Updates waiting in a profile other than the one in use; the server counts only things the person can act on. */
export function useProfileUpdates() {
  return useSession().me?.accountProfile?.updates?.count ?? 0;
}

export const openProfiles = () => router.push('/profiles');

/** What a screen reader hears on any switcher entry point: what it opens, and whether something waits. */
export function profilesLabel(c: Copy, updates: number) {
  return updates ? `${c.profiles}, ${fill(c.profileUpdatesWaiting, { n: updates })}` : c.profiles;
}

export function ProfileDot() {
  const { palette } = useTheme();
  return <View pointerEvents="none" importantForAccessibility="no-hide-descendants"
    style={{ position: 'absolute', top: -2, end: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: palette.warn, borderWidth: 2, borderColor: palette.card }} />;
}

/** The shortcut on a captain's map and on the shop's orders header. */
export function ProfileButton() {
  const { me } = useSession();
  const { c } = useCopy();
  const updates = useProfileUpdates();
  if (!me?.accountProfile) return null;
  return <View>
    <IconButton icon="person-circle-outline" label={profilesLabel(c, updates)} onPress={openProfiles} />
    {updates > 0 && <ProfileDot />}
  </View>;
}

/** Nothing for an approved captain: Online or Offline is known only for the session working in Captain mode. */
export function captainStateLabel(c: Copy, state: CaptainProfileState) {
  return state === 'approved' ? undefined : c[`profileState_${state}`];
}

/** Nothing for an approved shop: "Active" read as taking orders even while the owner had paused new ones. */
export function shopStateLabel(c: Copy, state: NonNullable<ProfilePreview['shop']>['state']) {
  return state === 'active' ? undefined : state === 'paused' ? c.profileState_paused : c.profileState_under_review;
}
