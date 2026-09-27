import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { api } from '../api';
import { isValidPhone, vehicles, type Vehicle } from '../model';
import { HelpLinks } from '../parts';
import { useSession, type Me } from '../session';
import { Appear, Button, Card, Choices, ErrorText, Field, haptic, Logo, Press, Row, Screen, Txt, useCopy } from '../ui';

const HERO = FadeInUp.duration(400);
const FORM = FadeInDown.duration(300).delay(120);

export default function Auth() {
  const { signIn, language, setLanguage } = useSession();
  const { c, err } = useCopy();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'customer' | 'driver'>('customer');
  const [vehicle, setVehicle] = useState<Vehicle>('car');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!isValidPhone(phone)) return setError(err('invalid_phone'));
    if (password.length < 6) return setError(err('weak_password'));
    if (mode === 'up' && !name.trim()) return setError(err('invalid_input'));
    setBusy(true);
    setError('');
    try {
      const data = await api<Me & { token: string }>(mode === 'in' ? '/auth/login' : '/auth/register',
        mode === 'in' ? { phone, password } : { phone, password, name, role, vehicle });
      haptic.success();
      await signIn(data);
    } catch (e) {
      haptic.error();
      setError(err(e));
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen>
      <Row style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
        <Press accessibilityLabel={c.language} onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
          style={{ paddingHorizontal: 14, height: 40, borderRadius: 12, justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
          <Txt variant="label">{c.language}</Txt>
        </Press>
      </Row>
      <Animated.View entering={HERO} style={{ alignItems: 'center', marginVertical: 24, gap: 10 }}>
        <Logo size={72} />
        <Txt variant="h1" center style={{ fontSize: 34 }}>{c.brand}</Txt>
        <Txt center>{c.tagline}</Txt>
      </Animated.View>
      <Animated.View entering={FORM}>
        <Card>
          <Choices items={[{ key: 'in', label: c.signIn }, { key: 'up', label: c.signUp }]} value={mode}
            onChange={next => { setMode(next); setError(''); }} />
          <View style={{ height: 10 }} />
          {mode === 'up' && <Appear><Field label={c.name} value={name} onChangeText={setName} placeholder={c.nameHint} autoComplete="name" /></Appear>}
          <Field label={c.phone} value={phone} onChangeText={setPhone} placeholder={c.phoneHint} keyboardType="phone-pad" autoComplete="tel" />
          <Field label={c.password} value={password} onChangeText={setPassword} placeholder={c.passwordHint} secureTextEntry
            autoComplete={mode === 'in' ? 'password' : 'new-password'} onSubmitEditing={mode === 'in' ? submit : undefined} />
          {mode === 'up' && <Appear>
            <Txt variant="label" style={{ marginBottom: 7 }}>{c.iAm}</Txt>
            <Choices items={[{ key: 'customer', label: c.customer }, { key: 'driver', label: c.driver }]} value={role} onChange={setRole} />
            {role === 'driver' && <Appear>
              <Txt variant="label" style={{ marginVertical: 7 }}>{c.vehicle}</Txt>
              <Choices items={vehicles.map(v => ({ key: v, label: c[v] }))} value={vehicle} onChange={setVehicle} />
            </Appear>}
            <View style={{ height: 8 }} />
          </Appear>}
          <ErrorText>{error}</ErrorText>
          <Button title={mode === 'in' ? c.signIn : c.continue} onPress={submit} loading={busy} />
          {mode === 'in' && <Txt variant="caption" center style={{ marginTop: 10 }}>{c.forgotPassword}</Txt>}
        </Card>
        <HelpLinks />
      </Animated.View>
    </Screen>
  </KeyboardAvoidingView>;
}
