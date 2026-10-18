import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useReducedMotion } from '../motion';
import { router } from 'expo-router';
import { api, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../api';
import { isValidPhone, normalizeEmail, vehicles, type Vehicle } from '../model';
import { HelpLinks } from '../parts';
import { InstallLink } from '../install-link';
import { useSession, type Me } from '../session';
import { Appear, Button, Card, Choices, ErrorText, Field, haptic, Logo, palette, Press, Row, Screen, Txt, useCopy } from '../ui';

const HERO = FadeInUp.duration(400);
const FORM = FadeInDown.duration(300).delay(120);

export default function Auth() {
  const { signIn, language, setLanguage } = useSession();
  const { c, err } = useCopy();
  const still = useReducedMotion(); // reduced motion: render the auth card without entrance movement
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [role, setRole] = useState<'customer' | 'driver'>('customer');
  const [vehicle, setVehicle] = useState<Vehicle>('car');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  // Enter moves through the sign-up fields and submits from the password (web keyboard users).
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  useEffect(() => {
    let active = true;
    void api<{ registrationOpen: boolean }>('/auth/options').then(options => {
      if (active) setRegistrationOpen(options.registrationOpen);
    }).catch(() => { /* Keep signup closed when the server cannot confirm its policy. */ });
    return () => { active = false; };
  }, []);

  async function submit() {
    if (busy) return;
    if (mode === 'in' && (!phone.trim() || !password)) return setError(err('invalid_input'));
    if (mode === 'up') {
      if (!name.trim()) return setError(err('invalid_input'));
      if (!normalizeEmail(email)) return setError(err('invalid_email'));
      if (!isValidPhone(phone)) return setError(err('invalid_phone'));
      if (password.length < 12 || password.length > 100) return setError(err('weak_password'));
      if (!consent) return setError(err('consent_required'));
    }
    setBusy(true);
    setError('');
    try {
      const data = await api<Me & { token: string }>(mode === 'in' ? '/auth/login' : '/auth/register',
        mode === 'in' ? { identifier: phone, password } : { phone, password, name, email, consent, registrationRole: role, vehicle });
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
        <Press accessibilityLabel={c.language} hitSlop={4} onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
          style={{ paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: palette.card }}>
          <Txt variant="label">{c.language}</Txt>
        </Press>
      </Row>
      <Animated.View entering={still ? undefined : HERO} style={{ alignItems: 'center', marginTop: 8, marginBottom: 20, gap: 8 }}>
        <Logo size={60} />
        <Txt variant="h1" center style={{ fontSize: 26, lineHeight: 34 }}>{c.brand}</Txt>
        <Txt center>{c.tagline}</Txt>
      </Animated.View>
      <Animated.View entering={still ? undefined : FORM}>
        <Card>
          <Choices items={[{ key: 'in', label: c.signIn }, { key: 'up', label: c.signUp }]} value={mode}
            onChange={next => { setMode(next); setError(''); }} />
          <View style={{ height: 10 }} />
          {mode === 'up' && !registrationOpen ? <>
            <Txt center style={{ marginBottom: 12 }}>{c.err_registration_closed}</Txt>
            {SUPPORT_URL && <Button title={c.support} icon="mail-outline" onPress={() => Linking.openURL(SUPPORT_URL!)} />}
          </> : <>
          {mode === 'up' && <Appear>
            <Field label={c.name} value={name} onChangeText={setName} autoComplete="name" maxLength={60} disabled={busy}
              returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
            <Field label={c.email} inputRef={emailRef} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" maxLength={254} disabled={busy}
              returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} />
          </Appear>}
          <Field label={mode === 'in' ? c.identifier : c.phone} inputRef={phoneRef} value={phone} onChangeText={setPhone}
            placeholder={mode === 'up' ? c.phoneHint : undefined} keyboardType={mode === 'up' ? 'phone-pad' : 'default'}
            autoComplete={mode === 'up' ? 'tel' : 'username'} maxLength={254} disabled={busy}
            returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
          <Field label={c.password} inputRef={passwordRef} value={password} onChangeText={setPassword} placeholder={mode === 'up' ? c.passwordMinimum : undefined} secureTextEntry maxLength={100} disabled={busy}
            autoComplete={mode === 'in' ? 'password' : 'new-password'} onSubmitEditing={submit} />
          {mode === 'up' && <Appear>
            <Txt variant="label" style={{ marginBottom: 7 }}>{c.iAm}</Txt>
            <Choices items={[{ key: 'customer', label: c.customer }, { key: 'driver', label: c.driver }]} value={role} onChange={setRole} disabled={busy} />
            {role === 'driver' && <Appear>
              <Txt variant="label" style={{ marginVertical: 7 }}>{c.vehicle}</Txt>
              <Choices items={vehicles.map(v => ({ key: v, label: c[v] }))} value={vehicle} onChange={setVehicle} disabled={busy} />
            </Appear>}
            <View style={{ height: 8 }} />
            <Press accessibilityRole="checkbox" accessibilityLabel={c.consent} accessibilityState={{ checked: consent }} disabled={busy}
              onPress={() => setConsent(!consent)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Row gap={8}>
                <Txt variant="title" style={{ color: palette.olive }}>{consent ? '☑' : '☐'}</Txt>
                <Txt variant="caption">{c.consent}</Txt>
              </Row>
            </Press>
            <Row gap={16} style={{ justifyContent: 'center', marginBottom: 8 }}>
              <Press accessibilityRole="link" accessibilityLabel={c.privacy} onPress={() => Linking.openURL(PRIVACY_URL)}><Txt variant="caption" style={{ color: palette.olive }}>{c.privacy}</Txt></Press>
              <Press accessibilityRole="link" accessibilityLabel={c.terms} onPress={() => Linking.openURL(TERMS_URL)}><Txt variant="caption" style={{ color: palette.olive }}>{c.terms}</Txt></Press>
            </Row>
          </Appear>}
          <ErrorText>{error}</ErrorText>
          <Button title={mode === 'in' ? c.signIn : c.createAccount} onPress={submit} loading={busy} />
          {mode === 'in' && <Press accessibilityRole="link" accessibilityLabel={c.forgotPassword} onPress={() => router.push({ pathname: '/help', params: { topic: 'password' } })}>
            <Txt variant="caption" center style={{ marginTop: 10, paddingVertical: 6, color: palette.olive, fontWeight: '700' }}>{c.forgotPassword}</Txt>
          </Press>}
          </>}
        </Card>
        <HelpLinks privacy={!(mode === 'up' && registrationOpen)} />{/* sign-up links privacy beside its consent box */}
        <InstallLink />
      </Animated.View>
    </Screen>
  </KeyboardAvoidingView>;
}
