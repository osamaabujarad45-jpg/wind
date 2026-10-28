// Edit profile: display name (POST /api/me). The phone card proves control with a code and changes the number only with the current password.
// Email: verified with an emailed 6-digit code when the server can send email (capabilities.emailVerification).
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useFormat } from '../parts';
import { PhoneCard } from '../phone-card';
import { useSession, type Me } from '../session';
import { Appear, Avatar, Badge, Button, Card, ErrorText, Field, fill, haptic, Header, palette, Row, Screen, tones, Txt, useCopy } from '../ui';

export default function Profile() {
  const { me, refresh } = useSession();
  const { c, err } = useCopy();
  const { date } = useFormat();
  const [name, setName] = useState(me?.user.name ?? '');
  const [busy, setBusy] = useState(false);
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
      {user.email && <Appear index={3}><EmailCard /></Appear>}
      <Appear index={4}>
        <Card tone="muted">
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt>{c.memberSince}</Txt>
            <Txt variant="title">{date(user.createdAt)}</Txt>
          </Row>
        </Card>
      </Appear>
      <ErrorText>{error}</ErrorText>
      {saved && !changed && <Txt center variant="caption" style={{ color: palette.olive, fontWeight: '800', marginBottom: 10 }}>{c.nameSaved}</Txt>}
      <Button title={c.save} icon="checkmark-outline" onPress={save} loading={busy} disabled={!changed} reason={c.profile_unchanged} />
    </Screen>
  </KeyboardAvoidingView>;
}

function EmailCard() {
  const { me, refresh } = useSession();
  const { c, err } = useCopy();
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [changing, setChanging] = useState<string | null>(null); // a new address being typed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!me?.user.email) return null;
  const { email, emailVerifiedAt } = me.user;
  const canVerify = !emailVerifiedAt && !!me.capabilities?.emailVerification;

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); haptic.success(); }
    catch (e) { haptic.error(); setError(err(e)); }
    setBusy(false);
  }
  const send = () => run(async () => { await api('/me/email/code', {}); setSent(true); setCode(''); });
  const verify = () => run(async () => { await api<Me>('/me/email/verify', { code: code.trim() }); await refresh(); });
  const change = () => run(async () => {
    await api<Me>('/me/email', { email: changing?.trim() });
    await refresh(); setChanging(null); setSent(false); setCode('');
    await api('/me/email/code', {}); setSent(true); // the new address gets its code at once
  });

  return <Card>
    <Txt variant="label" style={{ marginBottom: 7 }}>{c.email}</Txt>
    <Row gap={10} style={styles.locked}>
      <Ionicons name={emailVerifiedAt ? 'checkmark-circle' : 'mail-outline'} size={16} color={emailVerifiedAt ? palette.olive : palette.secondary} />
      <Txt variant="title" selectable style={{ flex: 1, color: palette.secondary }}>{email}</Txt>
      <View>{/* Badge aligns itself to the top of a row; this keeps it centred */}<Badge label={emailVerifiedAt ? c.verified : c.unverified} tone={emailVerifiedAt ? tones.olive : tones.clay} /></View>
    </Row>
    {emailVerifiedAt ? <Txt variant="caption" style={{ marginTop: 8 }}>{c.emailVerifiedNote}</Txt> : canVerify && <View style={{ marginTop: 12 }}>
      <Txt variant="title" style={{ marginBottom: 4 }}>{c.emailVerifyTitle}</Txt>
      <Txt variant="caption" style={{ marginBottom: 10 }}>{sent ? fill(c.emailCodeSent, { email }) : fill(c.emailVerifyBody, { email })}</Txt>
      {/* sign-up already emailed a code, so the field comes first */}
      <Field label={c.emailCodeLabel} value={code} onChangeText={next => setCode(next.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
        autoComplete="one-time-code" maxLength={6} disabled={busy} onSubmitEditing={code.length === 6 ? verify : undefined} />
      <ErrorText>{error}</ErrorText>
      <Button title={c.emailConfirm} icon="checkmark-outline" onPress={verify} loading={busy} disabled={code.length !== 6} reason={c.code_six_digits} />
      <Button title={sent ? c.emailResend : c.emailSendCode} icon="mail-outline" variant="ghost" onPress={send} disabled={busy} reason={c.wait_busy} />
      {changing === null
        ? <Button title={c.emailChange} icon="create-outline" variant="ghost" onPress={() => setChanging(email)} disabled={busy} reason={c.wait_busy} />
        : <View style={{ marginTop: 8 }}>
          <Field label={c.email} value={changing} onChangeText={setChanging} keyboardType="email-address" autoComplete="email" maxLength={254} disabled={busy} onSubmitEditing={change} />
          <Button title={c.emailChangeSave} icon="checkmark-outline" variant="soft" onPress={change} loading={busy} disabled={!changing.trim() || changing.trim() === email} reason={c.email_unchanged} />
        </View>}
    </View>}
  </Card>;
}

const styles = StyleSheet.create({
  locked: { minHeight: 44, borderRadius: 12, backgroundColor: palette.muted, paddingHorizontal: 12 },
});
