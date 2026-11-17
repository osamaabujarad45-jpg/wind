export const PUSH_KINDS: readonly string[] = ['assigned', 'at_pickup', 'in_transit', 'completed', 'returned', 'message', 'job', 'released', 'cancelled', 'offer',
  'offer_accepted', 'on_hold', 'returning', 'decided', 'approved', 'support', 'cash', 'attention', 'safety', 'plan',
  'destination_request', 'destination_accepted', 'destination_declined'];
export const URGENT_KINDS: readonly string[] = ['job', 'message', 'offer', 'offer_accepted', 'on_hold', 'returning', 'decided', 'attention', 'safety',
  'destination_request', 'destination_accepted', 'destination_declined'];
export type NotificationKind = typeof PUSH_KINDS[number];
export type NotificationChannelDefinition = {
  id: string; kind: NotificationKind; version: number; name: string; sound: string; urgent: boolean;
};

/** A changed definition must bump its version: Android creates a new channel instead of retaining old user settings. */
export function versionedNotificationChannel(kind: string, version: number): NotificationChannelDefinition {
  if (!PUSH_KINDS.includes(kind as NotificationKind)) throw new Error('unknown_notification_kind');
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('invalid_notification_channel_version');
  const known = kind as NotificationKind;
  return { id: `wind.${known}.v${version}`, kind: known, version,
    name: `Wind ${known.replaceAll('_', ' ')}`, sound: 'default', urgent: URGENT_KINDS.includes(known as typeof URGENT_KINDS[number]) };
}

export const notificationChannelFor = (kind: string) => versionedNotificationChannel(kind, 1);
export const notificationChannels = () => PUSH_KINDS.map(kind => notificationChannelFor(kind));
