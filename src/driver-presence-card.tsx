// Driver presence card (WP07). Presentation only: the parent makes the server calls and passes the state it has confirmed.
// Nothing reads as online until the parent says so. Stale, reconnecting, blocked and pending states never look ready, and
// automatic requests stay "not active" until requestsOn is true (the server reports eligibleForMatching:false today).
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CopyKey } from './copy';
import { Appear, Button, Card, IconName, palette, Row, tones, Txt, useCopy } from './ui';

// The server accepts only consentVersion 1; the consent text in copy.ts is version 1.
export const PRESENCE_CONSENT_VERSION = 1;

export type PresenceState = 'offline' | 'starting' | 'online' | 'stale' | 'reconnecting' | 'busy' | 'unavailable' | 'ineligible' | 'permission_denied';

export type DriverPresenceCardProps = {
  state: PresenceState;
  consentAccepted?: boolean; // consent recorded for PRESENCE_CONSENT_VERSION. When false, going online opens the consent panel first.
  requestsOn?: boolean; // true only when the server reports eligibleForMatching. Until then the card says requests are not active.
  pending?: boolean; // a command is in flight: both controls wait, with a reason under them.
  error?: string | null; // last command failure, already translated by the parent.
  startDisabled?: boolean; // the parent holds going online: job status not loaded yet, or a job in progress.
  startReason?: string; // why startDisabled holds, one sentence under the go-online control.
  onConsentAndEnable: () => void; // the driver's go-online tap (consent recorded), or "Agree and go online". Never called on mount.
  onDisable: () => void; // go offline. Always allowed, even while stale, reconnecting or busy.
  onOpenSettings?: () => void; // permission_denied only: opens the OS settings for location.
};

const VIEW: Record<PresenceState, { icon: IconName; tone: { bg: string; fg: string }; title: CopyKey; body: CopyKey }> = {
  offline: { icon: 'power-outline', tone: tones.muted, title: 'presence_offline_title', body: 'presence_offline_body' },
  starting: { icon: 'sync-outline', tone: tones.blue, title: 'presence_starting_title', body: 'presence_starting_body' },
  online: { icon: 'radio-outline', tone: tones.olive, title: 'presence_online_title', body: 'presence_online_body' },
  stale: { icon: 'time-outline', tone: tones.clay, title: 'presence_stale_title', body: 'presence_stale_body' },
  reconnecting: { icon: 'sync-outline', tone: tones.blue, title: 'presence_reconnecting_title', body: 'presence_reconnecting_body' },
  busy: { icon: 'navigate-outline', tone: tones.blue, title: 'presence_busy_title', body: 'presence_busy_body' },
  unavailable: { icon: 'cloud-offline-outline', tone: tones.muted, title: 'presence_unavailable_title', body: 'presence_unavailable_body' },
  ineligible: { icon: 'shield-outline', tone: tones.error, title: 'presence_ineligible_title', body: 'presence_ineligible_body' },
  permission_denied: { icon: 'location-outline', tone: tones.clay, title: 'presence_permission_title', body: 'presence_permission_body' },
};

// Going online is blocked for these states; the reason sentence under the button says what would unblock it.
const BLOCKED: Partial<Record<PresenceState, CopyKey>> = {
  permission_denied: 'presence_reason_permission', ineligible: 'presence_reason_ineligible', unavailable: 'presence_reason_unavailable',
};

export function DriverPresenceCard({ state, consentAccepted = false, requestsOn = false, pending = false, error, startDisabled = false, startReason,
  onConsentAndEnable, onDisable, onOpenSettings }: DriverPresenceCardProps) {
  const { c, align } = useCopy();
  const [consenting, setConsenting] = useState(false);
  const view = VIEW[state];
  const waiting = pending || state === 'starting';
  const blocker = BLOCKED[state];
  const showConnect = state === 'offline' || !!blocker;
  const showDisconnect = state === 'online' || state === 'stale' || state === 'reconnecting' || state === 'busy' || state === 'starting';
  const connectHeld = waiting || !!blocker || startDisabled;
  const connectReason = waiting ? c.presence_reason_pending : blocker ? c[blocker] : startDisabled ? startReason : undefined;
  const disconnectReason = waiting ? c.presence_reason_pending : undefined;

  const buttons = <View style={styles.actions}>
    {state === 'permission_denied' && onOpenSettings && <Button title={c.presence_open_settings} icon="settings-outline" variant="outline" onPress={onOpenSettings} />}
    {showConnect && <Button title={c.presence_go_online} icon="radio-outline" disabled={connectHeld} reason={connectReason}
      onPress={() => consentAccepted ? onConsentAndEnable() : setConsenting(true)} />}
    {showDisconnect && <Button title={c.presence_go_offline} icon="power-outline" variant="outline" disabled={waiting} reason={disconnectReason} onPress={onDisable} />}
  </View>;

  return <Card style={{ backgroundColor: view.tone.bg }}>
    {/* Polite: announces the state change once it is confirmed, never per tick. */}
    <View accessibilityLiveRegion="polite">
      <Row gap={10}>
        <View style={[styles.icon, { backgroundColor: palette.card }]}>
          <Ionicons name={view.icon} size={18} color={view.tone.fg} />
        </View>
        <View style={styles.text}>
          <Txt variant="title">{c[view.title]}</Txt>
          <Txt variant="body" style={styles.gap}>{c[view.body]}</Txt>
          {state === 'online' && <Txt variant="caption" style={styles.gap}>{requestsOn ? c.presence_requests_on : c.presence_requests_off}</Txt>}
        </View>
      </Row>
    </View>
    {!!error && <Text accessibilityRole="alert" style={[styles.error, { textAlign: align }]}>{error}</Text>}

    {consenting && state === 'offline' ? <Appear style={styles.consent}>
      <Txt variant="h2">{c.presence_consent_title}</Txt>
      <Txt variant="label" style={styles.gap}>{c.presence_consent_before_h}</Txt>
      <Txt variant="body">{c.presence_consent_before_body}</Txt>
      <Txt variant="label" style={styles.gap}>{c.presence_consent_job_h}</Txt>
      <Txt variant="body">{c.presence_consent_job_body}</Txt>
      <Txt variant="label" style={styles.gap}>{c.presence_consent_permission_h}</Txt>
      <Txt variant="body">{c.presence_consent_foreground}</Txt>
      <Txt variant="label" style={styles.gap}>{c.presence_consent_background_h}</Txt>
      <Txt variant="body">{c.presence_consent_background}</Txt>
      <View style={styles.actions}>
        <Button title={c.presence_consent_agree} icon="checkmark-circle-outline" disabled={startDisabled || waiting} reason={startDisabled ? startReason : undefined}
          onPress={() => { setConsenting(false); onConsentAndEnable(); }} />
        <Button title={c.presence_consent_not_now} variant="outline" onPress={() => setConsenting(false)} />
      </View>
    </Appear> : buttons}
  </Card>;
}

// Optional and tapped on its own: never requested from going online, mount or an effect. Denial, or a provider that is off,
// is a safe result that keeps foreground sharing. A granted permission still promises no background callbacks.
export function BackgroundLocationAction({ onRequest }: { onRequest: () => Promise<boolean> }) {
  const { c, align } = useCopy();
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<'granted' | 'not_on' | null>(null);
  async function ask() {
    setAsking(true);
    try { setResult(await onRequest() ? 'granted' : 'not_on'); }
    catch { setResult('not_on'); }
    finally { setAsking(false); }
  }
  return <Card>
    <Txt variant="title">{c.presence_bg_title}</Txt>
    <Txt variant="body" style={styles.gap}>{c.presence_bg_body}</Txt>
    {Platform.OS === 'android' && <Txt variant="caption" style={styles.gap}>{c.presence_bg_android}</Txt>}
    <View style={styles.actions}>
      <Button title={c.presence_bg_action} icon="location-outline" variant="outline" loading={asking} onPress={() => { void ask(); }} />
    </View>
    {/* Polite: the answer is announced once the OS decision is known. */}
    {result && <View accessibilityLiveRegion="polite"><Text style={[styles.result, { textAlign: align }]}>{result === 'granted' ? c.presence_bg_granted : c.presence_bg_not_on}</Text></View>}
  </Card>;
}

const styles = StyleSheet.create({
  result: { marginTop: 10, fontSize: 13, fontWeight: '700', color: palette.ink },
  icon:{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  gap: { marginTop: 4 },
  actions: { gap: 8, marginTop: 12 },
  consent: { gap: 4, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  error: { color: palette.error, backgroundColor: palette.errorPale, padding: 10, borderRadius: 12, fontSize: 13, fontWeight: '700', marginTop: 10, overflow: 'hidden' },
});
