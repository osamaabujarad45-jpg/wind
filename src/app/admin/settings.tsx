import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../api';
import { fractionSettings, type Settings } from '../../model';
import { PasswordCard } from '../../parts';
import { useSession } from '../../session';
import { Button, Card, confirm, ErrorText, Field, haptic, Header, ListGroup, Screen, Txt, useCopy } from '../../ui';

const groups: { title: 'pricing' | 'discounts' | 'plans'; keys: (keyof Settings)[] }[] = [
  { title: 'pricing', keys: ['parcelBase', 'parcelPerKm', 'parcelLarge', 'rideBase', 'ridePerKm', 'freightBase', 'freightPerKm', 'freightLarge', 'loadingHelp'] },
  { title: 'discounts', keys: ['sharedDiscount', 'plusDiscount', 'commission', 'proCommission'] },
  { title: 'plans', keys: ['plusPrice', 'proPrice'] },
];

export default function AdminSettings() {
  const { me, refresh, signOut, language, setLanguage } = useSession();
  const { c, err } = useCopy();
  const [values, setValues] = useState(() => Object.fromEntries(Object.entries(me!.settings).map(([k, v]) => [k, String(v)])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/admin/settings', Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v.replace(',', '.'))])));
      await refresh();
      haptic.success();
      setMessage(c.saved);
    } catch (e) {
      haptic.error();
      setError(err(e));
    }
    setBusy(false);
  }

  return <Screen>
    <Header title={c.settings} />
    {groups.map(group => <Card key={group.title}>
      <Txt variant="h2" style={{ marginBottom: 4 }}>{c[group.title]}</Txt>
      {group.title === 'discounts' && <Txt variant="caption" style={{ marginBottom: 10 }}>{c.percentNote}</Txt>}
      {group.keys.map(key => <Field key={key} keyboardType="decimal-pad"
        label={`${c[`set_${key}`]}${fractionSettings.includes(key) ? ` (${Math.round(Number(values[key]) * 100) || 0}%)` : ' ₪'}`}
        value={values[key]} onChangeText={text => setValues(v => ({ ...v, [key]: text }))} />)}
    </Card>)}
    <ErrorText>{error}</ErrorText>
    {!!message && <Txt center style={{ marginBottom: 10, fontWeight: '800' }}>{message}</Txt>}
    <View style={{ gap: 10 }}>
      <Button title={c.save} icon="save-outline" onPress={save} loading={busy} />
      <Button title={c.language} icon="language-outline" variant="soft" onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')} />
      <ListGroup><PasswordCard /></ListGroup>
      <Button title={c.logout} icon="log-out-outline" variant="danger" onPress={() => confirm(c.logoutConfirm, signOut, c.logout, c.no)} />
    </View>
  </Screen>;
}
