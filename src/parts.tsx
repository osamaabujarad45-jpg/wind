// Pieces shared by the customer, driver and admin screens.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Linking, Platform, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, PRIVACY_URL, SUPPORT_URL, useApi } from './api';
import { disablePush, enablePush, pushState, pushSupported, type PushState } from './push';
import { city, orderCode, type Order, type Referral, type Service } from './model';
import { useSession } from './session';
import {
  Appear, Avatar, Badge, Button, Card, confirm, ErrorText, Field, fill, Header, haptic, ListGroup, ListRow, palette, Press, Row, Screen, tones, Txt, useCopy, type IconName,
} from './ui';

export const serviceMeta: Record<Service, { icon: IconName; color: string; pale: string }> = {
  parcel: { icon: 'cube-outline', color: palette.olive, pale: palette.olivePale },
  ride: { icon: 'car-outline', color: palette.blue, pale: palette.bluePale },
  freight: { icon: 'bus-outline', color: palette.clay, pale: palette.clayPale },
};

export function useFormat() {
  const { language } = useCopy();
  const locale = language === 'ar' ? 'ar-PS' : 'en-GB';
  return {
    date: (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Hebron' }),
    time: (ms: number) => new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hebron' }),
  };
}

export function ServiceIcon({ service, size = 40 }: { service: Service; size?: number }) {
  const meta = serviceMeta[service];
  return <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: meta.pale, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={meta.icon} size={size * 0.5} color={meta.color} />
  </View>;
}

// Pickup (olive dot) joined to drop-off (clay square): the route spine used on booking, trip and job screens.
export function RouteLine({ from, to, fromNote, toNote, onFrom, onTo }: {
  from: string; to: string; fromNote?: string; toNote?: string; onFrom?: () => void; onTo?: () => void;
}) {
  const { c, row } = useCopy();
  const stop = (label: string, place: string, note: string | undefined, first: boolean, onPress?: () => void) => {
    const body = <View style={[styles.stop, { flexDirection: row }]}>
      <View style={styles.rail}>
        <View style={first ? styles.dot : styles.square} />
        {first && <View style={styles.spine} />}
      </View>
      <View style={{ flex: 1, paddingBottom: first ? 12 : 0 }}>
        <Txt variant="micro">{label}</Txt>
        <Row gap={6}>
          <Txt variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>{place}</Txt>
          {onPress && <Ionicons name="chevron-down" size={15} color={palette.olive} />}
        </Row>
        {!!note && <Txt variant="caption" numberOfLines={2}>{note}</Txt>}
      </View>
    </View>;
    return onPress ? <Press accessibilityLabel={`${label}: ${place}`} onPress={onPress}>{body}</Press> : body;
  };
  return <View>
    {stop(c.pickup, from, fromNote, true, onFrom)}
    {stop(c.dropoff, to, toNote, false, onTo)}
  </View>;
}

export function OrderRow({ order, index = 0 }: { order: Order; index?: number }) {
  const { c, language, money, rtl } = useCopy();
  const { time } = useFormat();
  return <Appear index={index}>
    <Card style={{ padding: 12 }}>
      {/* Announce every fact the row shows; a container label replaces the children for screen readers. */}
      <Press accessibilityLabel={`${orderCode(order.id)}, ${c[order.service]}, ${city(order.pickupCity)[language]} ${rtl ? '←' : '→'} ${city(order.dropoffCity)[language]}, ${money(order.price)}, ${c[order.status]}`} onPress={() => router.push(`/order/${order.id}`)}>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <ServiceIcon service={order.service} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                {city(order.pickupCity)[language]} {rtl ? '←' : '→'} {city(order.dropoffCity)[language]}
              </Txt>
              <Txt variant="title">{money(order.price)}</Txt>
            </Row>
            <Txt variant="caption" numberOfLines={1}>{c[order.service]} · {order.shared ? c.shared : c.private} · {order.scheduledFor && ['searching', 'assigned'].includes(order.status) ? fill(c.scheduledFor, { t: time(order.scheduledFor) }) : time(order.createdAt)}</Txt>
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <Badge label={c[order.status]} status={order.status} />
              <Txt variant="micro">{orderCode(order.id)}</Txt>
            </Row>
          </View>
        </Row>
      </Press>
    </Card>
  </Appear>;
}

// Web Push on/off for this browser (SPEC-web-push.md); the result is announced.
function PushRow() {
  const { c, language } = useCopy();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  if (!state || state === 'unsupported') return null;
  async function toggle() {
    if (busy) return;
    if (state === 'denied') { window.alert(c.pushDeniedHelp); return; } // web only: the browser owns this permission
    setBusy(true);
    try {
      const next = state === 'on' ? (await disablePush(), 'off' as const) : await enablePush(language);
      setState(next);
      haptic.success();
      AccessibilityInfo.announceForAccessibility(next === 'on' ? c.pushEnabled : next === 'off' ? c.pushDisabled : c.pushDeniedHelp);
    } catch { haptic.error(); setState(await pushState().catch(() => 'off' as const)); } finally { setBusy(false); }
  }
  return <ListRow icon="notifications-outline" label={c.pushRow} tone="blue" onPress={toggle}
    value={busy ? '…' : state === 'on' ? c.pushOn : state === 'denied' ? c.pushDenied : c.pushOff} />;
}

// Invite friends (SPEC-referral.md): the code, a share sheet where one exists, progress and ready reward codes.
const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
function InviteCard() {
  const { c, money } = useCopy();
  const { date } = useFormat();
  const { data } = useApi<Referral>('/me/referral');
  if (!data) return null;
  const r = money(data.reward);
  const share = () => Share.share({ message: fill(c.inviteMessage, { code: data.code, r }) }).catch(() => undefined); // dismissed or unsupported
  return <Appear>
    <Card>
      <Row gap={8} style={{ marginBottom: 6 }}>
        <Ionicons name="gift-outline" size={18} color={palette.olive} />
        <Txt variant="title" style={{ flex: 1 }}>{fill(c.inviteTitle, { r })}</Txt>
      </Row>
      <Txt variant="caption">{fill(c.inviteBody, { r })}</Txt>
      <Row gap={10} style={{ marginTop: 10, justifyContent: 'space-between' }}>
        <View accessible accessibilityLabel={`${c.inviteCodeLabel}: ${data.code.split('').join(' ')}`}>
          <Txt variant="micro">{c.inviteCodeLabel}</Txt>
          <Txt variant="h2" selectable style={{ letterSpacing: 2 }}>{data.code}</Txt>
        </View>
        {canShare && <Button title={c.inviteShare} size="sm" icon="share-social-outline" variant="soft" onPress={share} />}
      </Row>
      <Txt variant="caption" style={{ marginTop: 8 }}>{fill(c.inviteStats, { joined: data.joined, earned: data.earned })}</Txt>
      {data.credits.length > 0 && <View style={{ marginTop: 8 }}>
        <Txt variant="label">{c.inviteCredits}</Txt>
        {data.credits.map(cr => <View key={cr.code} accessible accessibilityLabel={fill(c.inviteCredit, { code: cr.code.split('').join(' '), r: money(cr.amount), t: date(cr.expiresAt) })}>
          <Txt selectable>{fill(c.inviteCredit, { code: cr.code, r: money(cr.amount), t: date(cr.expiresAt) })}</Txt></View>)}
      </View>}
    </Card>
  </Appear>;
}

export function PlanCard() {
  const { me, refresh } = useSession();
  const { c, err } = useCopy();
  const { date } = useFormat();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!me || me.user.role === 'admin') return null;
  const s = me.settings;
  const isPlus = me.user.role === 'customer';
  const pitch = isPlus
    ? fill(c.plusPitch, { pct: Math.round(s.plusDiscount * 100), price: s.plusPrice })
    : fill(c.proPitch, { pro: Math.round(s.proCommission * 100), base: Math.round(s.commission * 100), price: s.proPrice });
  const sub = me.subscription;

  async function subscribe() {
    setBusy(true);
    try {
      await api('/subscriptions', {});
      haptic.success();
      await refresh();
    } catch (e) {
      setError(err(e));
    }
    setBusy(false);
  }

  return <Appear>
    <Card tone={sub?.status === 'active' ? 'olive' : 'clay'}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <Row gap={8}>
          <Ionicons name="sparkles" size={18} color={palette.clay} />
          <Txt variant="title">{isPlus ? c.plusTitle : c.proTitle}</Txt>
        </Row>
        {sub && <Badge label={c[sub.status]} tone={sub.status === 'active' ? tones.olive : tones.clay} />}
      </Row>
      <Txt>{sub?.status === 'active' && sub.endsAt ? fill(c.subActive, { date: date(sub.endsAt) }) : sub ? c.subPending : pitch}</Txt>
      {!sub && <View style={{ marginTop: 10, alignSelf: 'flex-start' }}><Button title={c.subscribe} size="sm" icon="sparkles-outline" onPress={subscribe} loading={busy} /></View>}
      <ErrorText>{error}</ErrorText>
    </Card>
  </Appear>;
}

export function PasswordCard() {
  const { c, err } = useCopy();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api('/me/password', { current, password: next });
      haptic.success();
      setOpen(false);
      setCurrent('');
      setNext('');
      setMessage(c.passwordChanged);
    } catch (e) {
      haptic.error();
      setError(err(e));
    }
    setBusy(false);
  }

  // A row inside a ListGroup; opens in place into the form.
  if (!open) return <View>
    <ListRow icon="key-outline" label={c.changePassword} tone="muted" onPress={() => { setOpen(true); setMessage(''); }} />
    {!!message && <Txt center variant="caption" style={{ color: palette.olive, fontWeight: '800', paddingBottom: 10 }}>{message}</Txt>}
  </View>;
  return <Appear style={{ padding: 16 }}>
    <Field label={c.currentPassword} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="password" />
    <Field label={c.newPassword} value={next} onChangeText={setNext} placeholder={c.passwordHint} secureTextEntry autoComplete="new-password" />
    <ErrorText>{error}</ErrorText>
    <Row gap={8}>
      <View style={{ flex: 1 }}><Button title={c.save} onPress={save} loading={busy} disabled={!current || next.length < 6} /></View>
      <View style={{ flex: 1 }}><Button title={c.cancel} variant="ghost" onPress={() => setOpen(false)} /></View>
    </Row>
  </Appear>;
}

// Support and privacy policy: needed by both app stores and reachable before sign-in.
export function HelpLinks({ help = true }: { help?: boolean }) {
  const { c } = useCopy();
  return <Row gap={16} style={{ justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
    {help && <Press accessibilityRole="link" accessibilityLabel={c.help} onPress={() => router.push('/help')}>
      <Txt variant="caption" style={styles.link}>{c.help}</Txt>
    </Press>}
    {SUPPORT_URL && <Press accessibilityRole="link" accessibilityLabel={c.support} onPress={() => Linking.openURL(SUPPORT_URL!)}>
      <Txt variant="caption" style={styles.link}>{c.support}</Txt>
    </Press>}
    <Press accessibilityRole="link" accessibilityLabel={c.privacy} onPress={() => Linking.openURL(PRIVACY_URL)}>
      <Txt variant="caption" style={styles.link}>{c.privacy}</Txt>
    </Press>
  </Row>;
}

export function AccountScreen() {
  const { me, signOut, forget, language, setLanguage } = useSession();
  const { c, err } = useCopy();
  const [deleteError, setDeleteError] = useState('');
  if (!me) return null;
  const { user } = me;

  async function deleteAccount() {
    setDeleteError('');
    try {
      await api('/me/delete', {});
      await forget();
    } catch (e) {
      haptic.error();
      setDeleteError(err(e));
    }
  }
  return <Screen>
    <Header title={c.account} />
    <Appear>
      <Card>
        <Press accessibilityLabel={c.editProfile} onPress={() => router.push('/profile')}>
          <Row gap={12}>
            <Avatar name={user.name} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="h2" numberOfLines={1}>{user.name}</Txt>
              <Txt variant="caption">{user.phone}</Txt>
              <Row gap={6} style={{ marginTop: 4 }}>
                <Badge label={c[user.role]} tone={tones.blue} />
                {user.vehicle && <Badge label={c[user.vehicle]} tone={tones.muted} />}
                {user.rating != null && <Badge label={`★ ${user.rating}`} tone={tones.clay} />}
              </Row>
            </View>
            <Ionicons name="create-outline" size={19} color={palette.olive} />
          </Row>
        </Press>
      </Card>
    </Appear>
    <PlanCard />
    {user.role === 'customer' && <InviteCard />}
    <ListGroup>
      <ListRow icon="language-outline" label={c.languageTitle} value={c.language} tone="clay" onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')} />
      <PasswordCard />
      {pushSupported() && <PushRow />}
    </ListGroup>
    <ListGroup>
      <ListRow icon="trail-sign-outline" label={c.roads} tone="clay" onPress={() => router.push('/roads')} />
      <ListRow icon="help-buoy-outline" label={c.help} onPress={() => router.push('/help')} />
      {SUPPORT_URL && <ListRow icon="chatbubble-ellipses-outline" label={c.support} tone="blue" onPress={() => Linking.openURL(SUPPORT_URL!)} />}
      <ListRow icon="shield-checkmark-outline" label={c.privacy} tone="muted" onPress={() => Linking.openURL(PRIVACY_URL)} />
    </ListGroup>
    <ErrorText>{deleteError}</ErrorText>
    <ListGroup>
      <ListRow icon="log-out-outline" label={c.logout} danger onPress={() => confirm(c.logoutConfirm, signOut, c.logout, c.no)} />
      <ListRow icon="trash-outline" label={c.deleteAccount} tone="muted" onPress={() => confirm(c.deleteConfirm, deleteAccount, c.deleteAccount, c.no)} />
    </ListGroup>
  </Screen>;
}

const styles = StyleSheet.create({
  link: { color: palette.olive, fontWeight: '800', textDecorationLine: 'underline', paddingVertical: 8 },
  stop: { alignItems: 'stretch', gap: 10 },
  rail: { width: 12, alignItems: 'center', paddingTop: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.olive },
  square: { width: 10, height: 10, borderRadius: 2, backgroundColor: palette.clay },
  spine: { flex: 1, width: 2, borderRadius: 1, backgroundColor: palette.line, marginTop: 4 },
});
