// Profile: the mobile number, proof that you control it, and an explicit change with the current password.
// Proof of control is not identity and not driver approval; the copy says so. Every disabled control gives its reason.
// The code and password live in this component only. They are never stored, logged or sent anywhere but the phone route.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { errorCode } from './api';
import { setAuthNotice } from './phone/notice';
import { digest, keyValue, newUuid, phoneApi } from './phone/client';
import { commandSlot, memorySlot, sessionScope, stableDeviceId, storedSlot, type Commands, type Slot } from './phone/command';
import {
  awaitingProvider, clock, codeInput, codeUsable, deliveryKey, gateOf, gateReasonKey, issueKey, latestChallenge, normalizePhoneInput, phoneInputOk,
  secondsUntil, type Capabilities, type Gate,
} from './phone/flow';
import { issueBody, proveBody, type SelfView } from './phone/requests';
import { useSession } from './session';
import { Badge, Button, Card, ErrorText, Field, fill, haptic, palette, Row, Txt, tones, useCopy } from './ui';
import type { CopyKey } from './copy';

type Purpose = 'verify' | 'change';
type Active = { purpose: Purpose; challengeId: string; phone: string; expiresAt: number; resendAt: number; state: string; attempts: number };

const ISSUE_SLOT = 'wp06.phone.issue.self';
const POLL_MS = 3000;
const MAX_POLLS = 20; // about a minute of watching the provider answer; leaving and returning starts again

export function PhoneCard() {
  const { me, refresh, forget } = useSession();
  const { c, err } = useCopy();
  const userId = me?.user.id;
  // Every async step checks the account epoch: a switched or ended account never receives an answer. Kept out of a ref so the unmount cleanup may bump it.
  const [account] = useState(() => ({ epoch: 0 }));
  const proof = useRef<Slot>(memorySlot()); // proof commands stay in memory, so a lost reply can be retried with the same ID
  const polls = useRef(0);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [capsFailed, setCapsFailed] = useState(false);
  const [view, setView] = useState<SelfView | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [form, setForm] = useState<{ phone: string; password: string } | null>(null); // change form: new number and current password
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verifiedNow, setVerifiedNow] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Profile keys this card by account, so its code, password and results never outlive the account they were typed for.
  // Leaving the screen or switching account bumps the epoch, and any reply still in flight is dropped.
  useEffect(() => {
    if (!userId) return;
    const current = ++account.epoch;
    void load(current);
    return () => { account.epoch++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() touches only state setters and the epoch, both stable
  }, [userId, account]);

  // Derived state. The user may be gone (signed out) while hooks still run, so nothing below assumes it.
  const user = me?.user;
  const isVerified = !!user?.phoneVerifiedAt;
  const gate: Gate = gateOf(caps, capsFailed);
  const reviewed = !!view?.mappings.some(m => m.state === 'reviewed' || m.state === 'verified');
  // Why the number cannot be verified or changed right now. Null means the control is live.
  const blockKey: string | null = gate !== 'ready' ? gateReasonKey(gate) : !view ? 'phone_reason_checking' : !reviewed ? 'phone_reason_review' : null;
  const changeBlock: string | null = user?.role === 'admin' ? 'phone_reason_admin' : blockKey;
  const reason = (key: string | null) => key ? c[key as CopyKey] : undefined;

  // The pending verification: one this screen just requested, or the newest one the server still holds for this session.
  const resumed = view && !isVerified ? latestChallenge(view.challenges, ['verify']) : null;
  const resumable = !!resumed && codeUsable({ deliveryState: resumed.deliveryState, expiresAt: resumed.expiresAt, attempts: resumed.attempts }, now);
  const shown: Active | null = active ?? (resumable && resumed && user ? {
    purpose: 'verify', challengeId: resumed.id, phone: user.phone, expiresAt: resumed.expiresAt, resendAt: resumed.resendAt,
    state: resumed.deliveryState, attempts: resumed.attempts,
  } : null);
  const hasShown = !!shown;
  const liveState = shown ? view?.challenges.find(x => x.id === shown.challengeId)?.effectiveDeliveryState ?? shown.state : '';
  const left = shown ? secondsUntil(shown.resendAt, now) : 0;
  const expired = shown ? shown.expiresAt <= now : false;

  useEffect(() => {
    if (!hasShown) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasShown]);

  // A provider answer arrives later: watch the server's own view until it settles, bounded.
  useEffect(() => {
    if (!shown || !awaitingProvider(liveState) || polls.current >= MAX_POLLS) return;
    const timer = setTimeout(() => { polls.current++; void reload(); }, POLL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.challengeId, liveState, view]);

  async function load(current: number) {
    try {
      const next = await phoneApi.capabilities();
      if (current !== account.epoch) return;
      setCaps(next);
      if (next.available && next.enabled) {
        const self = await phoneApi.self();
        if (current === account.epoch) setView(self);
      }
    } catch (failure) {
      if (current !== account.epoch) return;
      if (errorCode(failure) === 'phone_protocol_unavailable') setCaps({ available: false, enabled: false });
      else setCapsFailed(true);
    }
  }

  async function reload() {
    const current = account.epoch;
    try {
      const self = await phoneApi.self();
      if (current === account.epoch) setView(self);
    } catch (failure) {
      if (current === account.epoch) setError(err(failure));
    }
  }

  // One request for one number and purpose. A lost reply keeps its command ID for the retry; any answer ends it.
  async function issue(purpose: Purpose, phone: string, password: string) {
    if (busy || !view) return;
    const current = account.epoch;
    const revision = view.identityRevision;
    const normalized = normalizePhoneInput(phone);
    setBusy(true);
    setError('');
    let slot: Commands | null = null;
    let commandId = '';
    try {
      slot = commandSlot(storedSlot(keyValue, ISSUE_SLOT, await sessionScope(await keyValue.get('token'), digest)), newUuid);
      commandId = await slot.begin(issueKey({ kind: 'self', phone: normalized, purpose, revision }));
      const deviceId = await stableDeviceId(keyValue, newUuid);
      const res = await phoneApi.issueSelf(issueBody({ commandId, deviceId, phone: normalized, purpose, expectedRevision: revision, currentPassword: password }));
      await slot.settle('ok');
      if (current !== account.epoch) return;
      polls.current = 0;
      setActive({ purpose, challengeId: res.challengeId, phone: normalized, expiresAt: res.expiresAt, resendAt: Date.now() + res.resendAfterSeconds * 1000,
        state: res.deliveryState ?? 'prepared', attempts: 0 });
      setCode('');
      haptic.success();
      void reload();
    } catch (failure) {
      const reasonCode = errorCode(failure);
      if (slot && commandId) await slot.settle(reasonCode);
      if (current === account.epoch) {
        haptic.error();
        setError(err(reasonCode));
        if (reasonCode === 'phone_revision_changed') void reload();
      }
    } finally {
      if (current === account.epoch) setBusy(false);
    }
  }

  async function prove() {
    if (busy || !shown || expired) return;
    const current = account.epoch;
    const { purpose, challengeId } = shown;
    setBusy(true);
    setError('');
    const slot = commandSlot(proof.current, newUuid);
    let commandId = '';
    try {
      commandId = await slot.begin(`proof|${challengeId}|${purpose}|${code}`);
      const deviceId = await stableDeviceId(keyValue, newUuid);
      const res = await phoneApi.proveSelf(proveBody({ commandId, deviceId, challengeId, purpose, code }));
      await slot.settle('ok');
      if (current !== account.epoch) return;
      haptic.success();
      if (purpose === 'change' && res.sessionsRevoked) {
        // Every session ended with the change, this one included. The sign-in screen explains and takes over.
        setAuthNotice(c.phone_done_changed);
        await forget();
        return;
      }
      setActive(null); setForm(null); setCode(''); setVerifiedNow(true);
      await refresh();
      await reload();
    } catch (failure) {
      const reasonCode = errorCode(failure);
      if (commandId) await slot.settle(reasonCode);
      if (current === account.epoch) {
        haptic.error();
        setError(err(reasonCode));
        if (reasonCode === 'phone_proof_invalid') { setCode(''); void reload(); }
      }
    } finally {
      if (current === account.epoch) setBusy(false);
    }
  }

  function closeChange() {
    if (active?.purpose === 'change') setActive(null);
    setForm(null); setCode(''); setError('');
  }

  if (!user) return null;

  const status = gate === 'checking' ? c.phone_status_checking : isVerified ? c.phone_status_verified : c.phone_status_unverified;
  const badge = gate === 'ready' ? (isVerified ? { label: c.verified, tone: tones.olive } : { label: c.unverified, tone: tones.clay })
    : gate === 'unavailable' || gate === 'disabled' ? { label: c.phone_unavailable, tone: tones.muted } : null;
  const formValid = !!form && phoneInputOk(form.phone) && form.password.length > 0;
  const formReason = !form ? undefined : changeBlock ? reason(changeBlock) : !phoneInputOk(form.phone) ? c.phone_reason_new_number
    : !form.password ? c.phone_reason_password : busy ? c.wait_busy : undefined;

  return <Card>
    <Txt variant="label" style={{ marginBottom: 7 }}>{c.phone}</Txt>
    <Row gap={10} style={styles.locked}>
      <Ionicons name={isVerified ? 'shield-checkmark' : 'call-outline'} size={16} color={isVerified ? palette.olive : palette.secondary} />
      <Txt variant="title" selectable style={[styles.ltr, { flex: 1, color: palette.secondary }]}>{user.phone}</Txt>
      {badge && <View>{/* Badge aligns itself to the top of a row; this keeps it centred */}<Badge label={badge.label} tone={badge.tone} /></View>}
    </Row>
    {/* When the gate is closed, each disabled control already says why; repeating it here only adds noise */}
    {(gate === 'ready' || gate === 'checking') && <Txt variant="caption" style={{ marginTop: 8 }}>{status}</Txt>}
    {verifiedNow && <Txt variant="caption" style={{ marginTop: 6, color: palette.olive, fontWeight: '700' }}>{c.phone_done_verified}</Txt>}

    {!isVerified && !shown && !form && <View style={{ marginTop: 12 }}>
      <Txt variant="caption" style={{ marginBottom: 10 }}>{c.phone_verify_body}</Txt>
      <Button title={c.phone_verify_send} icon="shield-checkmark-outline" onPress={() => issue('verify', user.phone, '')} loading={busy}
        disabled={!!blockKey || busy} reason={reason(blockKey) ?? c.wait_busy} />
    </View>}
    {/* The error belongs to the control that caused it: next to the code, next to the form, or under the send button. */}
    {!shown && !form && <ErrorText>{error}</ErrorText>}

    {shown && <View style={{ marginTop: 12 }}>
      <Txt variant="caption" style={{ marginBottom: 2 }}>{expired ? c.phone_code_expired : fill(c.phone_code_recorded, { t: clock(secondsUntil(shown.expiresAt, now)) })}</Txt>
      <Txt variant="caption" style={{ marginBottom: 10 }}>{c[deliveryKey(liveState) as CopyKey]}</Txt>
      {!expired && <>
        <Field label={c.phone_code_label} value={code} onChangeText={next => setCode(codeInput(next))} keyboardType="number-pad" autoComplete="one-time-code"
          maxLength={6} disabled={busy} onSubmitEditing={code.length === 6 ? prove : undefined} />
        <Txt variant="caption" style={{ marginBottom: 10 }}>{fill(c.phone_attempts, { n: Math.max(0, 5 - shown.attempts) })}</Txt>
        <ErrorText>{error}</ErrorText>
        <Button title={shown.purpose === 'change' ? c.phone_confirm_change : c.phone_confirm} icon="checkmark-outline" onPress={prove} loading={busy}
          disabled={code.length !== 6 || busy} reason={code.length !== 6 ? c.code_six_digits : c.wait_busy} />
      </>}
      {(shown.purpose === 'verify' || !!form?.password) && <Button title={c.phone_resend} icon="mail-outline" variant="ghost"
        onPress={() => issue(shown.purpose, shown.phone, form?.password ?? '')} disabled={left > 0 || busy}
        reason={left > 0 ? fill(c.phone_resend_wait, { t: clock(left) }) : c.wait_busy} />}
      {shown.purpose === 'change' && <Button title={c.cancel} variant="ghost" onPress={closeChange} disabled={busy} reason={c.wait_busy} />}
    </View>}

    {!form && !shown && <View style={{ marginTop: 10 }}>
      <Button title={c.phone_change} icon="create-outline" variant="ghost" onPress={() => { setActive(null); setForm({ phone: '', password: '' }); setError(''); }}
        disabled={!!changeBlock || busy} reason={reason(changeBlock) ?? c.wait_busy} />
    </View>}

    {form && !shown && <View style={{ marginTop: 12 }}>
      <Txt variant="title" style={{ marginBottom: 4 }}>{c.phone_change_title}</Txt>
      <Txt variant="caption" style={{ marginBottom: 10 }}>{c.phone_change_body}</Txt>
      <Field label={c.phone_new_number} value={form.phone} onChangeText={phone => setForm({ ...form, phone })} keyboardType="phone-pad" autoComplete="tel"
        maxLength={20} disabled={busy} />
      <Field label={c.phone_current_password} value={form.password} onChangeText={password => setForm({ ...form, password })} secureTextEntry
        autoComplete="password" maxLength={100} disabled={busy} />
      <ErrorText>{error}</ErrorText>
      <Button title={c.phone_change_send} icon="mail-outline" onPress={() => issue('change', form.phone, form.password)} loading={busy}
        disabled={!formValid || busy || !!changeBlock} reason={formReason} />
      <Button title={c.cancel} variant="ghost" onPress={closeChange} disabled={busy} reason={c.wait_busy} />
    </View>}
  </Card>;
}

const styles = StyleSheet.create({
  locked: { minHeight: 44, borderRadius: 12, backgroundColor: palette.muted, paddingHorizontal: 12 },
  ltr: { writingDirection: 'ltr' },
});
