// Pieces shared by the customer, driver and admin screens.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Platform, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, apiSessionRevision, errorCode, PRIVACY_URL, SUPPORT_URL, useApi } from './api';
import { disablePush, enablePush, pushState, pushSupported, refreshPush, type PushState } from './push';
import { city, HISTORY_PAGE, isOpen, keepOlder, orderCode, withOlder, type Order, type Referral, type Service } from './model';
import { dayKey, HEBRON } from './booking';
import { kmLabel } from './map-math';
import { useSession } from './session';
import { entraConfigured, prepareEntraRequest, signInWithEntra, type EntraRequest } from './entra-auth';
import { statusText } from './copy';
import {
  Appear, Avatar, Badge, Button, Card, confirm, ErrorText, Field, FilterChips, fill, Header, haptic, iconSize, ListGroup, ListRow, palette, Press, Row, Screen, tones, Txt, useCopy, type IconName,
} from './ui';

export const serviceMeta: Record<Service, { icon: IconName; color: string; pale: string }> = {
  parcel: { icon: 'cube-outline', color: palette.olive, pale: palette.olivePale },
  ride: { icon: 'car-outline', color: palette.blue, pale: palette.bluePale },
  freight: { icon: 'bus-outline', color: palette.clay, pale: palette.clayPale },
};

export { statusText };

export function useFormat() {
  const { language } = useCopy();
  const locale = language === 'ar' ? 'ar-PS-u-nu-latn' : 'en-GB'; // Latin digits, like prices and order codes
  const time = (ms: number) => new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hebron' });
  return {
    date: (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Hebron' }),
    time,
    // chat bubbles: today's messages carry the time alone, older ones the date too
    stamp: (ms: number) => dayKey(ms) === dayKey(Date.now()) ? timeLabel(ms, language) : time(ms),
  };
}

const fmt = (language: 'ar' | 'en') => language === 'ar' ? 'ar-PS-u-nu-latn' : 'en-GB';
function dayLabel(ms: number, language: 'ar' | 'en', c: { today: string; tomorrow: string }) {
  const key = dayKey(ms);
  return key === dayKey(Date.now()) ? c.today : key === dayKey(Date.now() + 86_400_000) ? c.tomorrow
    : new Date(ms).toLocaleDateString(fmt(language), { weekday: 'short', day: 'numeric', timeZone: HEBRON });
}
const timeLabel = (ms: number, language: 'ar' | 'en') => new Date(ms).toLocaleTimeString(fmt(language), { hour: 'numeric', minute: '2-digit', timeZone: HEBRON });

// Day chips over that day's slots (scheduleSlots); picking a day picks its first slot. Booking and a parcel's reschedule share it.
export function SlotPicker({ slots, value, onChange }: { slots: number[]; value: number; onChange: (slot: number) => void }) {
  const { c, language } = useCopy();
  const shownDay = dayKey(value);
  return <>
    <FilterChips label={c.scheduleDay} items={[...new Set(slots.map(dayKey))].map(key => ({ key, label: dayLabel(slots.find(s => dayKey(s) === key)!, language, c) }))} value={shownDay}
      onChange={key => onChange(slots.find(s => dayKey(s) === key)!)} />
    <FilterChips label={c.scheduleTime} items={slots.filter(s => dayKey(s) === shownDay).map(s => ({ key: String(s), label: timeLabel(s, language) }))} value={String(value)}
      onChange={key => onChange(Number(key))} />
  </>;
}

export function ServiceIcon({ service, size = 40 }: { service: Service; size?: number }) {
  const meta = serviceMeta[service];
  return <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: meta.pale, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={meta.icon} size={size * 0.5} color={meta.color} />
  </View>;
}

// Pickup (olive dot) joined to drop-off (clay square): the route spine used on booking, trip and job screens.
// The word that names each end comes from the copy dictionary in the reader's language, never a literal.
export function RouteLine({ from, to, fromNote, toNote, onFrom, onTo, ride }: {
  from: string; to: string; fromNote?: string; toNote?: string; onFrom?: () => void; onTo?: () => void; ride?: boolean;
}) {
  const { c, row } = useCopy();
  const stop = (label: string, place: string, note: string | undefined, first: boolean, onPress?: () => void) => {
    const body = <View style={[styles.stop, { flexDirection: row }]}>
      <View style={styles.rail}>
        <View style={first ? styles.dot : styles.square} />
        {first && <View style={styles.spine} />}
      </View>
      <View style={{ flex: 1, paddingBottom: first ? 12 : 0 }}>
        <Txt variant="label">{label}</Txt>
        <Row gap={6}>
          <Txt variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>{place}</Txt>
          {onPress && <Ionicons name="chevron-down" size={iconSize.sm} color={palette.olive} />}
        </Row>
        {!!note && <Txt variant="caption" numberOfLines={2}>{note}</Txt>}
      </View>
    </View>;
    return onPress ? <Press accessibilityLabel={`${label}: ${place}`} onPress={onPress}>{body}</Press> : body;
  };
  return <View>
    {stop(ride ? c.pickup_ride : c.pickup, from, fromNote, true, onFrom)}
    {stop(ride ? c.dropoff_ride : c.dropoff, to, toNote, false, onTo)}
  </View>;
}

/**
 * Live ETA headline like ride trackers: minutes as the headline ("Arriving now" in the last minute), then road distance
 * left and the latest arrival clock time. A slow-checkpoint estimate has no upper bound, so no clock time either.
 */
export function EtaLine({ eta, toPickup, slow, km, now }: { eta: [number, number]; toPickup: boolean; slow: boolean; km?: number | null; now: number }) {
  const { c } = useCopy();
  const { stamp } = useFormat();
  const [lo, hi] = eta, here = lo <= 1 && !slow; // a checkpoint delay keeps its "or more" wording to the end
  const head = here ? toPickup ? c.arrivingPickup : c.arrivingDropoff
    : fill(toPickup ? slow ? c.etaToPickupSlow : c.etaToPickup : slow ? c.etaToDropoffSlow : c.etaToDropoff, { lo, hi });
  // Arriving: no distance (a road route from a rounded origin still reads 0.2 km at the pin). "By" rounds up a minute.
  const detail = here ? '' : [km != null && fill(c.kmAway, { km: kmLabel(km) }), !slow && fill(c.arriveBy, { t: stamp(Math.ceil((now + hi * 60_000) / 60_000) * 60_000) })].filter(Boolean).join(', ');
  // polite: a screen reader hears a new estimate when it changes, without interrupting
  return <View accessibilityLiveRegion="polite"><Row gap={10}>
    <Ionicons name={here ? 'flag' : 'time'} size={22} color={palette.olive} />
    <View style={{ flex: 1 }}>
      <Txt variant="h2">{head}</Txt>
      {!!detail && <Txt variant="caption">{detail}</Txt>}
    </View>
  </Row></View>;
}

/** An orders list that can load older history page by page (GET /orders?before=<oldest ended id shown>). */
export function useOrders(path: string | null, pollMs: number) {
  const latest = useApi<Order[]>(path, pollMs);
  const [pages, setPages] = useState<{ path: string | null; older: Order[]; more: boolean; request?: object }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ path: string | null; code: string }>();
  const [seen, setSeen] = useState<{ path: string | null; data: Order[] }>();
  if (latest.data && latest.data !== seen?.data) {
    // A poll replaced the first page: carry what its window moved past into the loaded pages, or start over (keepOlder,
    // or the polls of this list were interrupted by another path, so what moved past meanwhile is unknown).
    setSeen({ path, data: latest.data });
    if (pages?.path === path) {
      const older = seen?.path === path && keepOlder(seen.data, latest.data, pages.older);
      setPages(older ? { ...pages, older } : undefined);
    }
  }
  const own = pages?.path === path ? pages : undefined;
  const data = latest.data && withOlder(latest.data, own?.older ?? []);
  const ended = (data ?? []).filter(o => !isOpen(o));
  async function load() {
    if (!path || busy || ended.length === 0) return;
    // The pages carry this request; a poll that starts over drops it, and with it this answer for the old cursor (Sol 10b F2).
    const request = {};
    setPages(p => ({ path, older: p?.path === path ? p.older : [], more: true, request }));
    setBusy(true); setFailure(undefined);
    try {
      const page = await api<Order[]>(`${path}${path.includes('?') ? '&' : '?'}before=${Math.min(...ended.map(o => o.id))}`);
      // Keep the ended orders on screen; later polls carry forward whatever the first page's window moves past.
      setPages(p => p?.request !== request ? p : { path, older: withOlder([...ended, ...page], p.older), more: page.length === HISTORY_PAGE });
    } catch (e) { setFailure({ path, code: errorCode(e) }); } finally { setBusy(false); }
  }
  const more = data && (own ? own.more : ended.length >= HISTORY_PAGE);
  return { ...latest, data, more: more ? { load, busy, failure: failure?.path === path ? failure.code : undefined } : null };
}

/** "Show older" under an orders list, with its own loading and error state. */
export function MoreOrders({ more }: { more: ReturnType<typeof useOrders>['more'] }) {
  const { c, err } = useCopy();
  if (!more) return null;
  return <View style={{ marginTop: 8, gap: 8 }}>
    <ErrorText>{more.failure && err(more.failure)}</ErrorText>
    <Button title={c.loadOlder} icon="time-outline" variant="outline" loading={more.busy} onPress={more.load} />
  </View>;
}

/** The trip in a line. Inside one town its name says nothing, so the places do. */
export function tripTitle(order: Pick<Order, 'pickupCity' | 'dropoffCity' | 'pickupNote' | 'dropoffNote'>, language: 'ar' | 'en', rtl: boolean) {
  const here = order.pickupCity === order.dropoffCity && !!order.pickupNote && !!order.dropoffNote;
  return `${here ? order.pickupNote : city(order.pickupCity)[language]} ${rtl ? '←' : '→'} ${here ? order.dropoffNote : city(order.dropoffCity)[language]}`;
}

export function OrderRow({ order, index = 0, status = true }: { order: Order; index?: number; status?: boolean }) {
  const { c, language, money, rtl } = useCopy();
  const { time } = useFormat();
  const { me } = useSession();
  const mine = me?.user.role === 'driver' && order.driverId === me.user.id;
  return <Appear index={index}>
    <Card style={{ padding: 12 }}>
      {/* Announce every fact the row shows; a container label replaces the children for screen readers. */}
      <Press accessibilityLabel={`${orderCode(order.id)}, ${c[order.service]}, ${tripTitle(order, language, rtl)}, ${money(order.price)}, ${statusText(c, order, mine)}`} onPress={() => router.push(`/order/${order.id}`)}>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <ServiceIcon service={order.service} />
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                {tripTitle(order, language, rtl)}
              </Txt>
              {/* a cancelled order was never charged and pays the driver nothing */}
              <Txt variant="title" style={order.status === 'cancelled' && { color: palette.faint, textDecorationLine: 'line-through' }}>{money(order.price)}</Txt>
            </Row>
            {/* private is the default and sat on every row; only shared, the exception, is marked */}
            <Txt variant="caption" numberOfLines={1}>{c[order.service]}{order.shared ? `, ${c.shared}` : ''}</Txt>
            <Row style={{ justifyContent: 'space-between', marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
              {status ? <Badge label={statusText(c, order, mine)} status={order.status} /> : <View />}
              {/* time and code are separate facts: two plain labels, no separator glyph */}
              <Row gap={8}>
                <Txt variant="micro">{order.scheduledFor && ['searching', 'assigned'].includes(order.status) ? fill(c.scheduledFor, { t: time(order.scheduledFor) }) : time(order.createdAt)}</Txt>
                <Txt variant="micro">{orderCode(order.id)}</Txt>
              </Row>
            </Row>
          </View>
        </Row>
      </Press>
    </Card>
  </Appear>;
}

// Web Push on/off for this browser (SPEC-web-push.md); the result is announced. Admins reach it from their dashboard, since
// the alerts they get (SPEC-notification-audit.md) would otherwise have no way to be switched on.
export function PushRow() {
  const { c, language } = useCopy();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState().then(next => { setState(next); if (next === 'on') void refreshPush(language).catch(() => undefined); }).catch(() => setState('unsupported'));
  }, [language]);
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
      {/* "0 joined · 0 rewards" is noise until the first friend joins */}
      {data.joined > 0 && <Txt variant="caption" style={{ marginTop: 8 }}>{fill(c.inviteStats, { joined: data.joined, earned: data.earned })}</Txt>}
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
    <Card tone={sub?.status === 'active' ? 'olive' : sub ? 'card' : 'clay'}>{/* waiting on support is not a call to action; the badge carries it */}
      <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <Row gap={8}>
          <Ionicons name="sparkles" size={18} color={palette.clay} />
          <Txt variant="title">{isPlus ? c.plusTitle : c.proTitle}</Txt>
        </Row>
        {sub && !(sub.status === 'active' && sub.endsAt) && <Badge label={c[sub.status]} tone={sub.status === 'active' ? tones.olive : tones.clay} />}{/* "active until" below already says it */}
      </Row>
      <Txt>{sub?.status === 'active' && sub.endsAt ? fill(c.subActive, { date: date(sub.endsAt) }) : sub ? c.subPending : pitch}</Txt>
      {!sub && <View style={{ marginTop: 10, alignSelf: 'flex-start' }}><Button title={c.subscribe} size="sm" icon="sparkles-outline" onPress={subscribe} loading={busy} /></View>}
      <ErrorText>{error}</ErrorText>
    </Card>
  </Appear>;
}

/** A Microsoft sign-in ready to prove the account for one sensitive action. Stays null for an account not linked to Microsoft. */
function useEntraReauth(challengePath: string, open: boolean) {
  const [request, setRequest] = useState<EntraRequest | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const revision = apiSessionRevision();
  useEffect(() => {
    if (!open || !entraConfigured) return;
    let active = true;
    const load = (first: boolean) => void api<{ nonce: string }>(challengePath, {}).then(({ nonce }) => prepareEntraRequest(nonce))
      .then(next => { if (active && revision === apiSessionRevision()) { setRequest(next); setFailed(false); } })
      .catch(error => { if (first && active && revision === apiSessionRevision()) { setRequest(null); setFailed(errorCode(error) !== 'entra_unavailable'); } });
    load(true);
    // A challenge lasts five minutes and the sign-in popup must open from the tap, so a fresh one waits here rather than being fetched on press.
    // Every two minutes leaves at least three for the sign-in. A failed refresh keeps the last one; the server has the final say.
    const refresh = setInterval(() => load(false), 120_000);
    return () => { active = false; clearInterval(refresh); };
  }, [open, attempt, revision, challengePath]);
  return { request, failed, revision, retry: () => { setRequest(null); setAttempt(n => n + 1); }, reset: () => { setRequest(null); setFailed(false); } };
}

export function PasswordCard() {
  const { c, err } = useCopy();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const entra = useEntraReauth('/me/password/challenge', open);

  async function save(microsoft = false) {
    setBusy(true);
    setError('');
    try {
      const proof = microsoft && entra.request ? await signInWithEntra(entra.request) : { current };
      if (!proof) return;
      await api('/me/password', { ...proof, password: next });
      haptic.success();
      setOpen(false);
      setCurrent('');
      setNext('');
      setMessage(c.passwordChanged);
    } catch (e) {
      haptic.error();
      setError(err(e));
    } finally {
      setBusy(false);
      if (microsoft) entra.retry(); // a proof works once
    }
  }

  // A row inside a ListGroup; opens in place into the form.
  if (!open) return <View>
    <ListRow icon="key-outline" label={c.changePassword} tone="muted" onPress={() => { setOpen(true); setMessage(''); }} />
    {!!message && <View accessibilityLiveRegion="polite"><Txt center variant="caption" style={{ color: palette.olive, fontWeight: '800', paddingBottom: 10 }}>{message}</Txt></View>}
  </View>;
  return <Appear style={{ padding: 16 }}>
    <Field label={c.currentPassword} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="password" />
    <Field label={c.newPassword} value={next} onChangeText={setNext} placeholder={c.passwordHint} secureTextEntry autoComplete="new-password" />
    <ErrorText>{error}</ErrorText>
    <Row gap={8} style={{ alignItems: 'flex-start' }}>{/* a disabled Save carries its reason below; Cancel stays level with Save */}
      <View style={{ flex: 1 }}><Button title={c.save} onPress={() => { void save(); }} loading={busy} disabled={!current || next.length < 12 || next.length > 100} reason={c.password_rule} /></View>
      <View style={{ flex: 1 }}><Button title={c.cancel} variant="ghost" onPress={() => setOpen(false)} /></View>
    </Row>
    {/* An account made with Microsoft never had a password to type here. */}
    {!!entra.request && <View style={{ marginTop: 8 }}><Button title={c.deleteMicrosoft} variant="soft" disabled={busy || next.length < 12 || next.length > 100} reason={c.password_rule} onPress={() => { void save(true); }} /></View>}
    {entra.failed && <View style={{ marginTop: 8 }}><Button title={c.retry} variant="soft" disabled={busy} onPress={entra.retry} /></View>}
  </Appear>;
}

/** Unverified email while the server can send codes: one row that opens the profile, where the code goes in. */
export function VerifyEmailNudge() {
  const { me } = useSession();
  const { c } = useCopy();
  if (!me?.capabilities?.emailVerification || !me.user.email || me.user.emailVerifiedAt) return null;
  return <Press accessibilityLabel={c.emailVerifyTitle} onPress={() => router.push('/profile')} style={{ marginBottom: 12 }}>
    <Card tone="clay" style={{ marginBottom: 0 }}>
      <Row gap={10}>
        <Ionicons name="mail-unread-outline" size={22} color={palette.clayInk} />
        <View style={{ flex: 1 }}>
          <Txt variant="title">{c.emailVerifyTitle}</Txt>
          <Txt variant="caption">{c.emailVerifyNudge}</Txt>
        </View>
      </Row>
    </Card>
  </Press>;
}

// Support and privacy policy: needed by both app stores and reachable before sign-in.
export function HelpLinks({ help = true, privacy = true }: { help?: boolean; privacy?: boolean }) {
  const { c } = useCopy();
  return <Row gap={16} style={{ justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
    {help && <Press accessibilityRole="link" accessibilityLabel={c.help} onPress={() => router.push('/help')}>
      <Txt variant="caption" style={styles.link}>{c.help}</Txt>
    </Press>}
    {SUPPORT_URL && <Press accessibilityRole="link" accessibilityLabel={c.support} onPress={() => Linking.openURL(SUPPORT_URL!)}>
      <Txt variant="caption" style={styles.link}>{c.support}</Txt>
    </Press>}
    {privacy && <Press accessibilityRole="link" accessibilityLabel={c.privacy} onPress={() => Linking.openURL(PRIVACY_URL)}>
      <Txt variant="caption" style={styles.link}>{c.privacy}</Txt>
    </Press>}
  </Row>;
}

export function AccountScreen() {
  const { me, signOut, forget, language, setLanguage } = useSession();
  const { c, err } = useCopy();
  const [deleteError, setDeleteError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const entra = useEntraReauth('/me/delete/challenge', deleteOpen);
  const { revision } = entra;
  if (!me) return null;
  const { user } = me;

  async function deleteAccount(microsoft = false) {
    if (pending.current || revision !== apiSessionRevision()) return;
    pending.current = true; setBusy(true);
    setDeleteError('');
    try {
      const proof = microsoft && entra.request ? await signInWithEntra(entra.request) : { password };
      if (!proof || revision !== apiSessionRevision()) return;
      await api('/me/delete', proof);
      if (revision === apiSessionRevision()) await forget();
    } catch (e) {
      haptic.error();
      setDeleteError(err(e));
    } finally { pending.current = false; setBusy(false); if (microsoft) entra.retry(); }
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
                {/* each role has its own app, so its own account restating 'customer' or 'driver' (beside the vehicle chip) said nothing; only admin is marked */}
                {user.role === 'admin' &&<Badge label={c[user.role]} tone={tones.blue} />}
                {user.vehicle && <Badge label={c[user.vehicle]} tone={tones.muted} />}
                {user.rating != null && <Badge label={`★ ${user.rating}`} tone={tones.clay} />}
                {user.priceRating != null && <Badge label={fill(c.priceStars, { r: user.priceRating })} tone={tones.clay} />}
                {user.role === 'driver' && !!user.trips && <Badge label={fill(c.tripsCount, { n: user.trips })} tone={tones.olive} />}
              </Row>
            </View>
            <Ionicons name="create-outline" size={iconSize.lg} color={palette.olive} />
          </Row>
        </Press>
      </Card>
    </Appear>
    <VerifyEmailNudge />
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
      {/* support lives one tap in: Help leads with it, so a second row here only splits the same door */}
      <ListRow icon="shield-checkmark-outline" label={c.privacy} tone="muted" onPress={() => Linking.openURL(PRIVACY_URL)} />
    </ListGroup>
    <ErrorText>{deleteError}</ErrorText>
    <ListGroup>
      <ListRow icon="log-out-outline" label={c.logout} danger onPress={() => confirm(c.logoutConfirm, () => { void signOut().catch(e => setDeleteError(err(e))); }, c.logout, c.no)} />
      {!deleteOpen ? <ListRow icon="trash-outline" label={c.deleteAccount} tone="muted" onPress={() => setDeleteOpen(true)} />
        : <View style={{ padding: 16, gap: 8 }}>
          <Txt>{c.deleteReauth}</Txt>
          <Field label={c.currentPassword} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" disabled={busy} maxLength={100} />
          <Button title={c.deleteAccount} variant="danger" disabled={!password || busy} loading={busy}
            onPress={() => confirm(c.deleteConfirm, () => { void deleteAccount(); }, c.deleteAccount, c.no)} />
          {!!entra.request && <Button title={c.deleteMicrosoft} variant="soft" disabled={busy}
            onPress={() => confirm(c.deleteConfirm, () => { void deleteAccount(true); }, c.deleteAccount, c.no)} />}
          {entra.failed && <Button title={c.retry} variant="soft" disabled={busy} onPress={entra.retry} />}
          <Button title={c.cancel} variant="ghost" disabled={busy} onPress={() => { setDeleteOpen(false); setPassword(''); setDeleteError(''); entra.reset(); }} />
        </View>}
    </ListGroup>
  </Screen>;
}

const styles = StyleSheet.create({
  link: { color: palette.olive, fontWeight: '800', textDecorationLine: 'underline', paddingVertical: 8 },
  stop: { alignItems: 'stretch', gap: 10, minHeight: 48 },
  rail: { width: 12, alignItems: 'center', paddingTop: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.olive },
  square: { width: 10, height: 10, borderRadius: 2, backgroundColor: palette.clay },
  spine: { flex: 1, width: 2, borderRadius: 1, backgroundColor: palette.line, marginTop: 4 },
});
