// Pieces shared by the customer, driver and admin screens.
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api, PRIVACY_URL, SUPPORT_URL } from './api';
import { city, orderCode, type Order, type Service } from './model';
import { useSession } from './session';
import {
  Appear, Badge, Button, Card, confirm, ErrorText, Field, fill, Header, haptic, palette, Press, Row, Screen, tones, Txt, useCopy, type IconName,
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
    date: (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: (ms: number) => new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  };
}

export function ServiceIcon({ service, size = 48 }: { service: Service; size?: number }) {
  const meta = serviceMeta[service];
  return <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: meta.pale, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={meta.icon} size={size / 2} color={meta.color} />
  </View>;
}

export function OrderRow({ order, index = 0, footer, amount }: { order: Order; index?: number; footer?: React.ReactNode; amount?: number }) {
  const { c, language, money, rtl } = useCopy();
  const { time } = useFormat();
  // Footer sits outside the pressable area: a button inside a button is invalid on web and steals taps on native.
  return <Appear index={index}>
    <Card>
      <Press accessibilityLabel={`${orderCode(order.id)} ${c[order.service]}`} onPress={() => router.push(`/order/${order.id}`)}>
        <Row gap={12}>
          <ServiceIcon service={order.service} />
          <View style={{ flex: 1, gap: 3 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="title">{c[order.service]}</Txt>
              <Txt variant="title" style={{ color: palette.olive }}>{money(amount ?? order.price)}</Txt>
            </Row>
            <Txt variant="caption">{city(order.pickupCity)[language]} {rtl ? '←' : '→'} {city(order.dropoffCity)[language]} · {order.shared ? c.shared : c.private}</Txt>
            <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <Badge label={c[order.status]} status={order.status} />
              <Txt variant="caption">{orderCode(order.id)} · {time(order.createdAt)}</Txt>
            </Row>
          </View>
        </Row>
      </Press>
      {footer && <View style={{ marginTop: 12 }}>{footer}</View>}
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
      {!sub && <View style={{ marginTop: 12 }}><Button title={c.subscribe} variant="soft" icon="sparkles-outline" onPress={subscribe} loading={busy} /></View>}
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

  if (!open) return <View style={{ gap: 6 }}>
    <Button title={c.changePassword} icon="key-outline" variant="soft" onPress={() => { setOpen(true); setMessage(''); }} />
    {!!message && <Txt center variant="caption" style={{ color: palette.olive, fontWeight: '800' }}>{message}</Txt>}
  </View>;
  return <Appear>
    <Card>
      <Field label={c.currentPassword} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="password" />
      <Field label={c.newPassword} value={next} onChangeText={setNext} placeholder={c.passwordHint} secureTextEntry autoComplete="new-password" />
      <ErrorText>{error}</ErrorText>
      <Row gap={8}>
        <View style={{ flex: 1 }}><Button title={c.save} onPress={save} loading={busy} disabled={!current || next.length < 6} /></View>
        <View style={{ flex: 1 }}><Button title={c.cancel} variant="ghost" onPress={() => setOpen(false)} /></View>
      </Row>
    </Card>
  </Appear>;
}

// Support and privacy policy: needed by both app stores and reachable before sign-in.
export function HelpLinks() {
  const { c } = useCopy();
  return <Row gap={16} style={{ justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
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
        <Row gap={14}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: palette.olivePale, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="h2" style={{ color: palette.olive }}>{user.name.slice(0, 1)}</Txt>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="h2">{user.name}</Txt>
            <Txt>{user.phone}</Txt>
            <Row gap={6}>
              <Badge label={c[user.role]} tone={tones.blue} />
              {user.vehicle && <Badge label={c[user.vehicle]} tone={tones.muted} />}
              {user.rating != null && <Badge label={`★ ${user.rating}`} tone={tones.clay} />}
            </Row>
          </View>
        </Row>
      </Card>
    </Appear>
    <PlanCard />
    <View style={{ gap: 10, marginTop: 4 }}>
      <Button title={c.language} icon="language-outline" variant="soft" onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')} />
      <PasswordCard />
      <Button title={c.logout} icon="log-out-outline" variant="danger" onPress={() => confirm(c.logoutConfirm, signOut, c.logout, c.no)} />
      <ErrorText>{deleteError}</ErrorText>
      <Button title={c.deleteAccount} icon="trash-outline" variant="ghost" onPress={() => confirm(c.deleteConfirm, deleteAccount, c.deleteAccount, c.no)} />
      <HelpLinks />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  link: { color: palette.olive, fontWeight: '800', textDecorationLine: 'underline', paddingVertical: 8 },
});
