import { useEffect, useRef, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { api, ApiError, SUPPORT_URL } from '../api';
import { vehicles, type AccountMode, type Vehicle } from '../model';
import { captainStateLabel, shopStateLabel } from '../profile-switch';
import { useSession } from '../session';
import { Button, Card, Choices, ErrorText, Field, fill, Header, ListGroup, ListRow, Row, Screen, Txt, useCopy } from '../ui';

const home = { personal: '/', captain: '/driver', shop: '/merchant' } as const;

export default function Profiles() {
  const { me, switchMode, refresh } = useSession();
  const { c, err } = useCopy();
  const profile = me?.accountProfile;
  const { notice: noticeRef } = useLocalSearchParams<{ notice?: string }>();
  const [done, setDone] = useState<AccountMode | null>(null);
  const [confirm, setConfirm] = useState<AccountMode | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [targetNotice, setTargetNotice] = useState<{ ref: string; mode: AccountMode } | null>(null);
  const noticeMode = targetNotice?.ref === noticeRef ? targetNotice?.mode : undefined;
  const [password, setPassword] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [applying, setApplying] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle>('car');
  const [plate, setPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    if (done && profile?.mode === done && !noticeRef) router.replace(home[done]);
  }, [done, profile?.mode, noticeRef]);

  const mode = profile?.mode;
  useEffect(() => {
    if (!mode || typeof noticeRef !== 'string' || !/^[A-Za-z0-9_-]{24}$/.test(noticeRef)) return;
    let current = true;
    void api<{ mode: AccountMode; path: string | null }>(`/session/notifications?ref=${noticeRef}`).then(target => {
      if (!current) return;
      if (target.path) router.replace(target.path as never);
      else { setTargetNotice({ ref: noticeRef, mode: target.mode }); void refresh(); }
    }, cause => {
      if (!current) return;
      if (cause instanceof ApiError && cause.status === 404) {
        setDone(null);
        setTargetNotice(null);
        setError(c.profileUpdateUnavailable);
        router.setParams({ notice: undefined });
        void refresh();
      } else if (done === mode) router.replace(home[mode]);
      else setError(c.profileUpdateUnavailable);
    });
    return () => { current = false; };
  }, [done, mode, noticeRef, refresh, c.profileUpdateUnavailable]);

  if (!profile) return <Redirect href="/" />;
  // "Current · Online": which profile is in use, then what is happening in it.
  const rowState = (mode: AccountMode, ...state: (string | undefined)[]) =>
    [profile.mode === mode ? c.profileInUse : undefined, ...state].filter(Boolean).join(' · ') || undefined;
  const captainState = !profile.captain ? undefined : profile.captain.state === 'approved' && profile.mode === 'captain'
    ? profile.captainOnline ? c.captainOnline : c.captainOffline : captainStateLabel(c, profile.captain.state);
  async function select(mode: AccountMode, agreed = false) {
    if (!profile || sending.current) return;
    setError(''); setNotice('');
    if (profile.mode === mode) { setDone(mode); return; }
    if (profile.mode === 'captain' && profile.workInHand) { setError(c.err_work_in_hand); return; }
    if (profile.mode === 'captain' && profile.captainOnline && !agreed) { setConfirm(mode); return; }
    if (profile.mode === 'shop' && (profile.shopOrdersOpen ?? 0) > 0 && !agreed) { setConfirm(mode); return; }
    sending.current = true; setBusy(true); setConfirm(null);
    try { await switchMode(mode); setDone(mode); }
    catch (e) { setError(err(e)); }
    finally { sending.current = false; setBusy(false); }
  }
  async function endOtherSessions() {
    if (sending.current || !password) return;
    sending.current = true; setBusy(true); setError('');
    try { await api('/session/other-phones', { password }); setSigningOut(false); setNotice(c.profileEndSessionsDone); }
    catch (e) { setError(err(e)); }
    finally { setPassword(''); sending.current = false; setBusy(false); }
  }
  async function applyAsCaptain() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try {
      await api('/captain/application', { vehicle, plate: vehicle === 'bicycle' ? '' : plate });
      await refresh(true);
      setApplying(false);
    } catch (e) { setError(err(e)); }
    finally { sending.current = false; setBusy(false); }
  }

  return <Screen>
    <Header title={c.profiles} subtitle={me?.user.name} back />
    {noticeMode && noticeMode !== profile.mode && <Button
      title={fill(c.profileOpenUpdate, { profile: noticeMode === 'captain' ? c.profileCaptain : noticeMode === 'shop' ? c.profileShop : c.profilePersonal })}
      onPress={() => select(noticeMode)} />}
    {!noticeRef && profile.updates?.ref && <ListGroup><ListRow icon="notifications-outline"
      label={fill(c.profileUpdatesWaiting, { n: profile.updates.count })}
      onPress={() => router.replace({ pathname: '/profiles', params: { notice: profile.updates!.ref! } })} /></ListGroup>}
    <ListGroup>
      <ListRow below icon="person-circle-outline" label={c.profilePersonal} value={rowState('personal')} onPress={() => select('personal')} />
      {profile.captain && <ListRow below icon="car-outline" label={c.profileCaptain} value={rowState('captain', captainState)}
        onPress={() => { if (profile.captain?.available) void select('captain'); else setStatusOpen(open => !open); }} />}
      {!profile.captain && profile.mode === 'personal' && !applying &&
        <ListRow icon="car-outline" label={c.profileApplyCaptain} onPress={() => { setError(''); setApplying(true); }} />}
      {profile.shop ? <ListRow below icon="storefront-outline" label={profile.shop.name} value={rowState('shop', shopStateLabel(c, profile.shop.state),
        profile.shopOrdersOpen ? fill(c.profileShopOrders, { n: profile.shopOrdersOpen }) : undefined)} onPress={() => select('shop')} />
        : profile.mode === 'personal' && me?.capabilities?.enabledServices.includes('shop') &&
          <ListRow icon="add-circle-outline" label={c.merchantApplyTitle} onPress={() => router.push('/merchant')} />}
    </ListGroup>
    {statusOpen && profile.captain && !profile.captain.available && <Card>
      <View accessibilityLiveRegion="polite">
        <Txt variant="label">{captainStateLabel(c, profile.captain.state)}</Txt>
      </View>
      <Button title={SUPPORT_URL?.startsWith('https://wa.me/') ? c.whatsappSupport : c.support} variant="soft"
        icon={SUPPORT_URL?.startsWith('https://wa.me/') ? 'logo-whatsapp' : 'chatbubble-ellipses-outline'}
        onPress={() => { if (SUPPORT_URL) void Linking.openURL(SUPPORT_URL); else router.push('/support'); }} />
    </Card>}
    {applying && profile.mode === 'personal' && !profile.captain && <Card>
      <Txt variant="label">{c.vehicle}</Txt>
      <Choices label={c.vehicle} value={vehicle} onChange={setVehicle} items={vehicles.map(key => ({ key, label: c[key] }))} />
      {vehicle !== 'bicycle' && <Field label={c.plate} value={plate} onChangeText={setPlate} maxLength={12} />}
      <Button title={c.profileSubmitApplication} loading={busy} onPress={applyAsCaptain} />
      <Button title={c.cancel} variant="ghost" disabled={busy} onPress={() => setApplying(false)} />
    </Card>}
    {confirm && <Card>
      <Txt variant="label">{profile.mode === 'shop' ? fill(c.profileShopSwitch, { n: profile.shopOrdersOpen ?? 0 }) : c.profileOfflineSwitch}</Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        <Button title={c.profileSwitch} onPress={() => select(confirm, true)} />
        <Button title={c.cancel} variant="ghost" onPress={() => setConfirm(null)} />
      </Row>
    </Card>}
    {profile.mode === 'captain' && profile.workInHand && <Button title={c.captainResumeWork} variant="soft" onPress={() => router.replace('/driver/trips')} />}
    {!signingOut && <ListGroup><ListRow icon="log-out-outline" label={c.profileEndSessions} onPress={() => { setError(''); setNotice(''); setSigningOut(true); }} /></ListGroup>}
    {signingOut && <Card>
      <Field label={c.password} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={endOtherSessions} />
      <Button title={c.profileEndSessions} disabled={!password} loading={busy} onPress={endOtherSessions} />
      <Button title={c.cancel} variant="ghost" disabled={busy} onPress={() => { setPassword(''); setSigningOut(false); }} />
    </Card>}
    <ErrorText>{error}</ErrorText>
    {!!notice && <View accessibilityLiveRegion="polite"><Txt>{notice}</Txt></View>}
  </Screen>;
}
