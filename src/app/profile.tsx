// Edit profile: display name (POST /api/me). Phone is the account identity and stays read-only.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useFormat } from '../parts';
import { useSession, type Me } from '../session';
import { Appear, Avatar, Badge, Button, Card, ErrorText, Field, haptic, Header, palette, Row, Screen, tones, Txt, useCopy } from '../ui';

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
            <Badge label={c[user.role]} tone={tones.blue} />
            {user.vehicle && <Badge label={c[user.vehicle]} tone={tones.muted} />}
          </Row>
        </View>
      </Appear>
      <Appear index={1}>
        <Card>
          <Field label={c.name} value={name} onChangeText={next => { setName(next); setSaved(false); }} placeholder={c.nameHint} autoComplete="name"
            onSubmitEditing={changed ? save : undefined} />
          <Txt variant="label" style={{ marginBottom: 7 }}>{c.phone}</Txt>
          <Row gap={10} style={styles.locked}>
            <Ionicons name="lock-closed-outline" size={16} color={palette.secondary} />
            <Txt variant="title" style={{ flex: 1, color: palette.secondary }}>{user.phone}</Txt>
          </Row>
          <Txt variant="caption" style={{ marginTop: 8 }}>{c.phoneLocked}</Txt>
        </Card>
      </Appear>
      <Appear index={2}>
        <Card tone="muted">
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt>{c.memberSince}</Txt>
            <Txt variant="title">{date(user.createdAt)}</Txt>
          </Row>
        </Card>
      </Appear>
      <ErrorText>{error}</ErrorText>
      {saved && !changed && <Txt center variant="caption" style={{ color: palette.olive, fontWeight: '800', marginBottom: 10 }}>{c.nameSaved}</Txt>}
      <Button title={c.save} icon="checkmark-outline" onPress={save} loading={busy} disabled={!changed} />
    </Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  locked: { minHeight: 44, borderRadius: 12, backgroundColor: palette.muted, paddingHorizontal: 12 },
});
