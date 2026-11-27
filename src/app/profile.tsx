// Edit profile: display name (POST /api/me). The phone card proves control with a code and changes the number only with the current password.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, apiSessionRevision } from '../api';
import { normalizeEmail } from '../model';
import { useEntraReauth, useFormat } from '../parts';
import { signInWithEntra } from '../entra-auth';
import { PhoneCard } from '../phone-card';
import { codeInput } from '../phone/flow';
import { useSession, type Me } from '../session';
import { Appear, Avatar, Badge, Button, Card, ErrorText, Field, FilterChips, fill, haptic, Header, Row, Screen, Txt, useCopy } from '../ui';
import { themedStyles, useTheme } from '../theme-context';

export default function Profile() {
  const { palette, tones } = useTheme();
  const { me, refresh } = useSession();
  const { c, err } = useCopy();
  const { date } = useFormat();
  const [name, setName] = useState(me?.user.name ?? '');
  const [busy, setBusy] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  if (!me) return null;
  const { user } = me;
  const changed = name.trim() !== user.name && name.trim().length > 0;

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api<Me>('/me', { name: name.trim() });
      haptic.success();
      setSaved(true);
      await refresh();
    } catch (e) {
      haptic.error();
      setError(err(e));
    }
    setBusy(false);
  }

  async function saveOffer(seconds: '20' | '30' | '40') {
    if (savingOffer || Number(seconds) === me?.rideOfferSeconds) return;
    setSavingOffer(true);
    setError('');
    try {
      await api('/driver/ride-offer-settings', { seconds: Number(seconds) });
      await refresh();
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(err(e));
    } finally { setSavingOffer(false); }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen>
      <Header title={c.profile} back />
      <Appear>
        <View style={{ alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Avatar name={name.trim() || user.name} size={72} />
          <Row gap={6} style={{ justifyContent: 'center' }}>
            {user.role !== 'customer' && <Badge label={c[user.role]} tone={tones.blue} />}
            {user.vehicle && <Badge label={c[user.vehicle]} tone={tones.muted} />}
          </Row>
        </View>
      </Appear>
      <Appear index={1}>
        <Card>
          <Field label={c.name} value={name} onChangeText={next => { setName(next); setSaved(false); }} placeholder={c.nameHint} autoComplete="name"
            onSubmitEditing={changed ? save : undefined} />
        </Card>
      </Appear>
      <Appear index={2}><PhoneCard key={user.id} /></Appear>
      <Appear index={3}><EmailCard key={user.id} /></Appear>
      {me.rideOfferSeconds !== undefined && <Card>
        <Txt variant="title" header>{c.dispatchOfferSettings}</Txt>
        <FilterChips label={c.dispatchOfferSettings} disabled={savingOffer}
          items={(['20', '30', '40'] as const).map(key => ({ key, label: fill(c.dispatchOfferSeconds, { n: key }) }))}
          value={String(me.rideOfferSeconds) as '20' | '30' | '40'} onChange={seconds => { void saveOffer(seconds); }} />
      </Card>}
      <Appear index={4}>
        <Card tone="muted">
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt>{c.memberSince}</Txt>
            <Txt variant="title">{date(user.createdAt)}</Txt>
          </Row>
        </Card>
      </Appear>
      <ErrorText>{error}</ErrorText>
      {saved && !changed && <Txt center variant="caption" style={{ color: palette.forest, fontWeight: '800', marginBottom: 10 }}>{c.nameSaved}</Txt>}
      <Button title={c.save} icon="checkmark-outline" onPress={save} loading={busy} disabled={!changed} reason={c.profile_unchanged} />
    </Screen>
  </KeyboardAvoidingView>;
}

function EmailCard() {
  const { palette, tones } = useTheme();
  const styles = useStyles();
  const { me, refresh, language } = useSession();
  const { c, err } = useCopy();
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [current, setCurrent] = useState('');
  const [action, setAction] = useState<'send' | 'confirm' | 'change' | null>(null);
  const [changing, setChanging] = useState<string | null>(null); // a new address being typed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const entra = useEntraReauth('/me/email/challenge', action !== null);
  if (!me) return null;
  const { email, emailVerifiedAt } = me.user;
  const linkMode = !!me.capabilities?.emailVerificationLink;
  const codeMode = !!me.capabilities?.emailVerification;
  const nextEmail = normalizeEmail(changing);

  async function submit(microsoft = false) {
    if (busy || !action) return;
    setBusy(true); setError('');
    const revision = apiSessionRevision();
    try {
      const proof = microsoft && entra.request ? await signInWithEntra(entra.request) : { current };
      if (!proof || revision !== apiSessionRevision()) return;
      if (action === 'send') {
        if (linkMode) await api('/me/email/link', { ...proof, lang: language });
        else await api('/me/email/code', proof);
        setSent(true); setCode('');
      } else if (action === 'confirm') {
        if (linkMode) await api('/me/email/link/confirm', { ...proof, mailboxProof: code.trim() });
        else await api('/me/email/verify', { ...proof, code });
        await refresh();
      } else if (nextEmail && nextEmail !== email) {
        await api('/me/email', { ...proof, email: nextEmail });
        await refresh();
        setChanging(null); setSent(false); setCode('');
      }
      setAction(null); setCurrent('');
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(err(e));
    } finally {
      setBusy(false);
      if (microsoft) entra.retry();
    }
  }
  const choose = (next: typeof action) => { setAction(next); setCurrent(''); setError(''); };

  return <Card>
    <Txt variant="label" style={{ marginBottom: 7 }}>{c.email}</Txt>
    <Row gap={10} style={[styles.locked, { flexWrap: 'wrap' }]}>
      <Ionicons name={emailVerifiedAt ? 'checkmark-circle' : 'mail-outline'} size={16} color={emailVerifiedAt ? palette.olive : palette.secondary} />
      {/* minWidth 0: on the web a flex text will not shrink below an unbreakable address, which pushed the badge past the field edge. The row wraps, so the badge moves down before the address splits mid-word; only an address wider than the field still wraps. */}
      <Txt variant="title" selectable={!!email} style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: '88%', color: palette.secondary }}>{email ?? c.emailNotAdded}</Txt>
      {!!email && <View><Badge label={emailVerifiedAt ? c.verified : c.unverified} tone={emailVerifiedAt ? tones.olive : tones.warn} /></View>}
    </Row>
    {!!email && !emailVerifiedAt && changing === null && !action && codeMode && <View style={{ marginTop: 12 }}>
      <Txt variant="caption" style={{ marginBottom: 10 }}>{fill(sent ? c.emailCodeSent : c.emailVerifyBody, { email })}</Txt>
      <Field label={c.emailCodeLabel} value={code} onChangeText={next => setCode(codeInput(next))} keyboardType="number-pad"
        autoComplete="one-time-code" maxLength={6} disabled={busy} onSubmitEditing={code.length === 6 ? () => choose('confirm') : undefined} />
      <Button title={c.emailConfirm} icon="checkmark-outline" onPress={() => choose('confirm')} disabled={code.length !== 6} reason={c.code_six_digits} />
      <Button title={sent ? c.emailResend : c.emailSendCode} icon="mail-outline" variant="ghost" onPress={() => choose('send')} disabled={busy} reason={c.wait_busy} />
    </View>}
    {!!email && !emailVerifiedAt && changing === null && !action && linkMode && <View style={{ marginTop: 12 }}>
      {sent && <View accessibilityLiveRegion="polite"><Txt variant="caption">{fill(c.emailLinkSent, { email })}</Txt></View>}
      <Field label={c.emailLinkProof} value={code} onChangeText={next => setCode(next.trim())}
        autoCorrect={false} maxLength={32} disabled={busy} />
      <Button title={c.emailConfirm} icon="checkmark-outline" onPress={() => choose('confirm')}
        disabled={!/^[A-Za-z0-9_-]{32}$/.test(code)} reason={c.emailLinkProof} />
      <Button title={sent ? c.emailResendLink : c.emailSendLink} icon="mail-outline" variant="ghost" onPress={() => choose('send')} />
    </View>}
    {!action && !emailVerifiedAt && (!!email || codeMode || linkMode) && <View style={{ marginTop: 8 }}>
      {changing === null
        ? <Button title={email ? c.emailChange : c.emailAdd} icon="create-outline" variant={email ? 'ghost' : 'soft'} onPress={() => setChanging(email ?? '')} disabled={busy} reason={c.wait_busy} />
        : <>
          <Field label={c.email} value={changing} onChangeText={setChanging} keyboardType="email-address" autoComplete="email" maxLength={254} disabled={busy} onSubmitEditing={nextEmail && nextEmail !== email ? () => choose('change') : undefined} />
          <Button title={c.emailChangeSave} icon="checkmark-outline" variant="soft" onPress={() => choose('change')} disabled={!nextEmail || nextEmail === email} reason={err(nextEmail === email && nextEmail ? 'email_unchanged' : 'invalid_email')} />
          <Button title={c.cancel} variant="ghost" onPress={() => { setChanging(null); setError(''); }} disabled={busy} reason={c.wait_busy} />
        </>}
    </View>}
    {!!action && <View style={{ marginTop: 12 }}>
      <Field label={c.currentPassword} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="password"
        maxLength={100} disabled={busy} onSubmitEditing={current ? () => void submit() : undefined} />
      <Button title={c.continue} onPress={() => submit()} loading={busy} disabled={!current} reason={c.currentPassword} />
      {!!entra.request && <Button title={c.deleteMicrosoft} variant="soft" disabled={busy} onPress={() => submit(true)} />}
      {entra.failed && <Button title={c.retry} variant="soft" disabled={busy} onPress={entra.retry} />}
      <Button title={c.cancel} variant="ghost" disabled={busy} onPress={() => choose(null)} />
    </View>}
    <ErrorText>{error}</ErrorText>
  </Card>;
}

const useStyles = themedStyles(palette => StyleSheet.create({
  locked: { minHeight: 44, borderRadius: 12, backgroundColor: palette.muted, paddingHorizontal: 12 },
}));
