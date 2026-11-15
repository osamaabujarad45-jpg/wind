// Sign-in: reset the password with a code sent to a mobile number. The replies are generic on purpose: nothing says whether the
// number belongs to an account, and a valid code only sets a password. It never signs anyone in; the sign-in screen takes over.
import { useEffect, useRef, useState } from 'react';
import { errorCode } from './api';
import { keyValue, newUuid, phoneApi } from './phone/client';
import { commandSlot, memorySlot, stableDeviceId, storedSlot, type Commands, type Slot } from './phone/command';
import { clock, codeInput, issueKey, normalizePhoneInput, phoneInputOk, secondsUntil, type Gate } from './phone/flow';
import { recoveryIssueBody, recoveryProveBody } from './phone/requests';
import { Button, ErrorText, Field, fill, haptic, palette, Press, Txt, useCopy } from './ui';
import type { CopyKey } from './copy';

const RECOVERY_SLOT = 'wp06.phone.issue.recovery';

export function PhoneRecovery({ gate, onBack, onDone }: { gate: Gate; onBack: () => void; onDone: (notice: string) => void }) {
  const { c, err } = useCopy();
  const alive = useRef(true);
  const proof = useRef<Slot>(memorySlot()); // proof commands stay in memory, so a lost reply can be retried with the same ID
  const [device, setDevice] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'proof'>('phone');
  const [challengeId, setChallengeId] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    alive.current = true;
    // A device ID that cannot be saved is named, instead of leaving the send button waiting forever.
    stableDeviceId(keyValue, newUuid).then(id => { if (alive.current) setDevice(id); })
      .catch(failure => { if (alive.current) setError(err(failure)); });
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- err is rebuilt each render; this one-time load needs only the mount
  }, []);

  useEffect(() => {
    if (step !== 'proof') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  const left = secondsUntil(resendAt, now);
  const open = gate === 'ready' && !!device;
  const notReady = gate === 'checking' ? 'phone_status_checking' : gate === 'failed' ? 'phone_status_failed'
    : gate === 'unavailable' ? 'phone_recovery_unavailable' : gate === 'disabled' ? 'phone_recovery_disabled' : null;

  // Sends the code. A lost reply keeps its command ID; an answered reply ends it. The reply never says whether the number is registered.
  async function send() {
    if (busy || !open || !phoneInputOk(phone)) return;
    setBusy(true);
    setError('');
    const normalized = normalizePhoneInput(phone);
    let slot: Commands | null = null;
    let commandId = '';
    try {
      slot = commandSlot(storedSlot(keyValue, RECOVERY_SLOT, 'public'), newUuid);
      commandId = await slot.begin(issueKey({ kind: 'recovery', phone: normalized, purpose: 'recovery', revision: 0 }));
      const res = await phoneApi.issueRecovery(recoveryIssueBody({ commandId, deviceId: device!, phone: normalized }));
      await slot.settle('ok');
      if (!alive.current) return;
      setChallengeId(res.challengeId);
      setResendAt(Date.now() + res.resendAfterSeconds * 1000);
      setCode('');
      setStep('proof');
    } catch (failure) {
      const reasonCode = errorCode(failure);
      if (slot && commandId) await slot.settle(reasonCode);
      if (alive.current) { haptic.error(); setError(err(reasonCode)); }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function save() {
    if (busy || !open || !challengeId) return;
    setBusy(true);
    setError('');
    const slot = commandSlot(proof.current, newUuid);
    let commandId = '';
    try {
      commandId = await slot.begin(`proof|${challengeId}|${code}`);
      await phoneApi.proveRecovery(recoveryProveBody({ commandId, deviceId: device!, challengeId, code, password }));
      await slot.settle('ok');
      if (!alive.current) return;
      haptic.success();
      onDone(c.resetDone);
    } catch (failure) {
      const reasonCode = errorCode(failure);
      if (commandId) await slot.settle(reasonCode);
      if (alive.current) {
        haptic.error();
        setError(err(reasonCode));
        if (reasonCode === 'phone_proof_invalid') setCode('');
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const passwordOk = password.length >= 12 && password.length <= 100;
  const sendReason = !phoneInputOk(phone) ? c.phone_reason_new_number : busy ? c.wait_busy : undefined;
  const saveReason = code.length !== 6 ? c.code_six_digits : !passwordOk ? c.password_rule : busy ? c.wait_busy : undefined;

  return <>
    <Txt variant="h2" header style={{ marginBottom: 4 }}>{c.phone_recovery_title}</Txt>
    {notReady ? <Txt variant="caption" style={{ marginBottom: 12 }}>{c[notReady as CopyKey]}</Txt> : <>
      <Txt variant="caption" style={{ marginBottom: 12 }}>{step === 'phone' ? c.phone_recovery_body : c.phone_recovery_proof}</Txt>
      {step === 'phone' ? <>
        <Field label={c.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={20} disabled={busy} />
        <Button title={c.phone_recovery_send} icon="mail-outline" onPress={send} loading={busy} disabled={!open || !phoneInputOk(phone) || busy}
          reason={!open ? c.wait_busy : sendReason} />
      </> : <>
        {/* Shown for every reply: the request is recorded, and whether a code goes out is not disclosed */}
        <Txt variant="caption" style={{ marginBottom: 12, color: palette.olive, fontWeight: '700' }}>{c.phone_recovery_recorded}</Txt>
        <Field label={c.phone_code_label} value={code} onChangeText={next => setCode(codeInput(next))} keyboardType="number-pad" autoComplete="one-time-code"
          maxLength={6} disabled={busy} />
        <Field label={c.newPassword} value={password} onChangeText={setPassword} placeholder={c.passwordMinimum} secureTextEntry maxLength={100}
          autoComplete="new-password" disabled={busy} />
        <Button title={c.phone_recovery_save} icon="key-outline" onPress={save} loading={busy} disabled={!open || code.length !== 6 || !passwordOk || busy}
          reason={saveReason} />
        <Button title={c.phone_recovery_send} icon="mail-outline" variant="ghost" onPress={send} disabled={left > 0 || busy || !open}
          reason={left > 0 ? fill(c.phone_resend_wait, { t: clock(left) }) : c.wait_busy} />
      </>}
    </>}
    <ErrorText>{error}</ErrorText>
    <Press accessibilityRole="button" accessibilityLabel={c.backToSignIn} onPress={onBack}>
      <Txt variant="caption" center style={{ paddingVertical: 14, color: palette.olive, fontWeight: '700' }}>{c.backToSignIn}</Txt>
    </Press>
  </>;
}
