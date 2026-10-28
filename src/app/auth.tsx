import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useReducedMotion } from '../motion';
import { router } from 'expo-router';
import { api, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../api';
import { isValidPhone, normalizeEmail, vehicles, type Vehicle } from '../model';
import { HelpLinks } from '../parts';
import { InstallLink } from '../install-link';
import { useSession, type Me } from '../session';
import { PhoneRecovery } from '../phone-recovery';
import { entraConfigured, prepareEntraRequest, signInWithEntra, type EntraRequest } from '../entra-auth';
import { phoneApi } from '../phone/client';
import { gateOf, type Capabilities } from '../phone/flow';
import { takeAuthNotice } from '../phone/notice';
import { Appear, Button, Card, Choices, ErrorText, Field, haptic, Loading, Logo, palette, Press, Row, Screen, Txt, useCopy } from '../ui';

const HERO = FadeInUp.duration(400);
const FORM = FadeInDown.duration(300).delay(120);

export default function Auth() {
  const { signIn, language, setLanguage } = useSession();
  const { c, err } = useCopy();
  const still = useReducedMotion(); // reduced motion: render the auth card without entrance movement
  const [mode, setMode] = useState<'in' | 'up' | 'reset' | 'phone'>('in');
  // Forgot password by email (server has email): ask for a code, then code + new password.
  const [emailReset, setEmailReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState(() => takeAuthNotice() ?? ''); // e.g. after a verified number change ended the last session
  // Phone-code reset: the server says whether the module exists and is switched on. A failed check is never shown as available.
  const [phoneCaps, setPhoneCaps] = useState<Capabilities | null>(null);
  const [phoneCapsFailed, setPhoneCapsFailed] = useState(false);
  const [phoneCapsTry, setPhoneCapsTry] = useState(0);
  const phoneGate = gateOf(phoneCaps, phoneCapsFailed);
  const phoneNote = phoneGate === 'unavailable' ? c.phone_recovery_unavailable : phoneGate === 'disabled' ? c.phone_recovery_disabled
    : phoneGate === 'failed' ? c.phone_status_failed : null;
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [role, setRole] = useState<'customer' | 'driver'>('customer');
  const [vehicle, setVehicle] = useState<Vehicle>('car');
  const [busy, setBusy] = useState(false);
  const [entraRequest, setEntraRequest] = useState<EntraRequest | null>(null);
  const [entraPrepareFailed, setEntraPrepareFailed] = useState(false);
  const [entraTry, setEntraTry] = useState(0);
  const [error, setError] = useState('');
  // null while the policy loads; 'failed' when the server could not say, so a dropped request never reads as closed signup.
  const [registration, setRegistration] = useState<'open' | 'closed' | 'failed' | null>(null);
  const [policyTry, setPolicyTry] = useState(0);
  // Enter moves through the sign-up fields and submits from the password (web keyboard users).
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  useEffect(() => {
    let active = true;
    void api<{ registrationOpen: boolean; emailReset?: boolean }>('/auth/options').then(options => {
      if (active) { setRegistration(options.registrationOpen ? 'open' : 'closed'); setEmailReset(!!options.emailReset); }
    }).catch(() => { if (active) setRegistration('failed'); }); // signup stays shut until the server confirms its policy
    return () => { active = false; };
  }, [policyTry]);

  useEffect(() => {
    let active = true;
    void phoneApi.capabilities().then(next => { if (active) { setPhoneCaps(next); setPhoneCapsFailed(false); } }).catch(() => { if (active) setPhoneCapsFailed(true); });
    return () => { active = false; };
  }, [phoneCapsTry]);

  useEffect(() => {
    let active = true;
    if (entraConfigured) void prepareEntraRequest().then(request => { if (active) { setEntraRequest(request); setEntraPrepareFailed(false); } })
      .catch(() => { if (active) { setEntraPrepareFailed(true); setError(err('entra_unavailable')); } });
    return () => { active = false; };
  }, [entraTry]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reset() {
    if (busy) return;
    if (!phone.trim()) return setError(err('invalid_input'));
    if (resetSent && code.length !== 6) return setError(err('wrong_email_code'));
    if (resetSent && (password.length < 12 || password.length > 100)) return setError(err('weak_password'));
    setBusy(true);
    setError('');
    try {
      if (!resetSent) {
        await api('/auth/reset/code', { identifier: phone });
        setResetSent(true);
        setBusy(false);
        return;
      }
      await api('/auth/reset', { identifier: phone, code, password });
      // Then a normal sign-in, through every login gate. The code is spent either way: if this fails, say so on sign-in.
      const data = await api<Me & { token: string }>('/auth/login', { identifier: phone, password }).catch(() => null);
      haptic.success();
      if (data) return await signIn(data);
      setMode('in'); setResetSent(false); setCode(''); setNotice(c.resetDone); setBusy(false);
    } catch (e) {
      haptic.error();
      setError(err(e));
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    if (mode === 'reset') return reset();
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

  async function entraSignIn() {
    if (busy || !entraRequest) return;
    if (mode === 'up' && (!consent || !name.trim() || !normalizeEmail(email) || !isValidPhone(phone))) {
      return setError(err(!consent ? 'consent_required' : !name.trim() ? 'invalid_input' : !normalizeEmail(email) ? 'invalid_email' : 'invalid_phone'));
    }
    setBusy(true);
    setError('');
    try {
      const request = entraRequest;
      setEntraRequest(null);
      const tokens = await signInWithEntra(request);
      if (!tokens) { setBusy(false); return; } // browser dismissed: stay on the form, no error noise
      const data = await api<Me & { token: string }>('/auth/entra', {
        idToken: tokens.idToken, nonce: tokens.nonce,
        consent: mode === 'up' ? consent : false,
        ...(mode === 'up' ? { registrationRole: role, vehicle, phone, name, email } : {}),
      });
      haptic.success();
      await signIn(data);
    } catch (e) {
      haptic.error();
      setError(err(e));
      setBusy(false);
    } finally {
      setEntraTry(n => n + 1); // never reuse a nonce, state, or PKCE verifier
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
          {mode === 'phone' ? <PhoneRecovery gate={phoneGate} onBack={() => { setMode('in'); setError(''); }}
            onDone={text => { setMode('in'); setPassword(''); setError(''); setNotice(text); }} /> : mode === 'reset' ? <>
            <Txt variant="h2" style={{ marginBottom: 4 }}>{c.resetTitle}</Txt>
            <Txt variant="caption" style={{ marginBottom: 12 }}>{resetSent ? c.resetSent : c.resetBody}</Txt>
            <Field label={c.identifier} value={phone} onChangeText={next => { setPhone(next); setResetSent(false); }} autoComplete="username"
              maxLength={254} disabled={busy} onSubmitEditing={resetSent ? undefined : submit} />
            {resetSent && <Appear>
              <Field label={c.emailCodeLabel} value={code} onChangeText={next => setCode(next.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
                autoComplete="one-time-code" maxLength={6} disabled={busy} returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
              <Field label={c.newPassword} inputRef={passwordRef} value={password} onChangeText={setPassword} placeholder={c.passwordMinimum} secureTextEntry
                maxLength={100} disabled={busy} autoComplete="new-password" onSubmitEditing={submit} />
            </Appear>}
            <ErrorText>{error}</ErrorText>
            <Button title={resetSent ? c.resetSave : c.resetSend} icon={resetSent ? 'key-outline' : 'mail-outline'} onPress={submit} loading={busy} />
            {resetSent && <Button title={c.emailResend} variant="ghost" disabled={busy} reason={c.wait_busy} onPress={() => { setResetSent(false); setCode(''); }} />}
            <Press accessibilityRole="link" accessibilityLabel={c.resetNoEmail} onPress={() => router.push({ pathname: '/help', params: { topic: 'password' } })}>
              <Txt variant="caption" center style={{ marginTop: 10, paddingVertical: 6, color: palette.olive, fontWeight: '700' }}>{c.resetNoEmail}</Txt>
            </Press>
            <Press accessibilityRole="link" accessibilityLabel={c.backToSignIn} onPress={() => { setMode('in'); setError(''); setPassword(''); setCode(''); setResetSent(false); }}>
              <Txt variant="caption" center style={{ paddingVertical: 6, color: palette.olive, fontWeight: '700' }}>{c.backToSignIn}</Txt>
            </Press>
          </> : <>
          <Choices items={[{ key: 'in', label: c.signIn }, { key: 'up', label: c.signUp }]} value={mode}
            onChange={next => { setMode(next); setError(''); }} />
          <View style={{ height: 10 }} />
          {mode === 'up' && registration === null ? <Loading />
          : mode === 'up' && registration === 'failed' ? <>
            <Txt center>{c.offlineDesc}</Txt>
            <Loading failed onRetry={() => { setRegistration(null); setPolicyTry(n => n + 1); }} />
          </> : mode === 'up' && registration === 'closed' ? <>
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
          {mode === 'in' && !!notice && <Txt variant="caption" center style={{ color: palette.olive, fontWeight: '700', marginBottom: 8 }}>{notice}</Txt>}
          <ErrorText>{error}</ErrorText>
          <Button title={mode === 'in' ? c.signIn : c.createAccount} onPress={submit} loading={busy} />
          {entraConfigured && <Button title={entraPrepareFailed ? c.entraRetry : c.entraSignIn} variant="ghost"
            disabled={busy || (!entraRequest && !entraPrepareFailed)} reason={c.wait_busy}
            onPress={entraPrepareFailed ? () => { setError(''); setEntraPrepareFailed(false); setEntraTry(n => n + 1); } : entraSignIn} />}
          {mode === 'in' && <Press accessibilityRole="link" accessibilityLabel={emailReset ? c.forgotPasswordEmail : c.forgotPassword}
            onPress={() => { if (emailReset) { setMode('reset'); setError(''); setPassword(''); } else router.push({ pathname: '/help', params: { topic: 'password' } }); }}>
            <Txt variant="caption" center style={{ marginTop: 10, paddingVertical: 6, color: palette.olive, fontWeight: '700' }}>{emailReset ? c.forgotPasswordEmail : c.forgotPassword}</Txt>
          </Press>}
          {mode === 'in' && phoneGate === 'ready' && <Press accessibilityRole="link" accessibilityLabel={c.phone_recovery_open} onPress={() => { setMode('phone'); setError(''); setPassword(''); }}>
            <Txt variant="caption" center style={{ paddingVertical: 6, color: palette.olive, fontWeight: '700' }}>{c.phone_recovery_open}</Txt>
          </Press>}
          {mode === 'in' && !!phoneNote && <Txt variant="caption" center style={{ paddingVertical: 6 }}>{phoneNote}</Txt>}
          {mode === 'in' && phoneGate === 'failed' && <Button title={c.retry} variant="ghost" disabled={busy} reason={c.wait_busy}
            onPress={() => { setPhoneCapsFailed(false); setPhoneCapsTry(n => n + 1); }} />}
          </>}
          </>}
        </Card>
        <HelpLinks privacy={!(mode === 'up' && registration === 'open')} />{/* sign-up links privacy beside its consent box */}
        <InstallLink />
      </Animated.View>
    </Screen>
  </KeyboardAvoidingView>;
}
