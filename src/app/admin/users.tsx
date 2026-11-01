import { useState } from 'react';
import { useSession } from '../../session';
import { View } from 'react-native';
import { api, ApiError, useApi } from '../../api';
import { vehicles, type Role, type User, type Vehicle } from '../../model';
import { useFormat } from '../../parts';
import {
  Appear, Badge, Button, Card, Choices, confirm, Empty, ErrorText, Field, fill, FilterChips, haptic, Header, Loading, palette, Row, Screen, tones, Txt, useCopy,
} from '../../ui';

export default function Users() {
  const { c, err } = useCopy();
  const { date, time } = useFormat();
  const { me } = useSession();
  const [role, setRole] = useState<'all' | Role>('all');
  const [q, setQ] = useState('');
  const path = `/admin/users?q=${encodeURIComponent(q.trim())}${role === 'all' ? '' : `&role=${role}`}`;
  const { data, error, reload } = useApi<User[]>(path);
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [temp, setTemp] = useState<{ id: number; password: string } | null>(null);
  // Support caller check: a one-time code goes to the user's verified email and the caller reads it back.
  const [identity, setIdentity] = useState<{ id: number; code: string; confirmedAt?: number } | null>(null);
  const [editing, setEditing] = useState<{ id: number; name: string; email: string; phone: string; role: 'customer' | 'driver'; vehicle: Vehicle; plate: string } | null>(null);

  async function action(user: User, suffix: string, body?: object, method?: 'POST' | 'PATCH' | 'DELETE') {
    if (busy !== null) return;
    setBusy(user.id); setActionError('');
    try {
      await api(`/admin/users/${user.id}${suffix}`, body, method);
      haptic.success(); setEditing(null); setTemp(null); await reload();
    } catch (e) {
      // A courier mid-job: support confirms what happens to the parcels before the block goes through.
      if (e instanceof ApiError && e.message === 'carrying_parcels') confirm(c.blockCarrying, () => action(user, suffix, { ...body, recovery: 'return' }, method), c.block, c.cancel);
      else setActionError(err(e));
    } finally { setBusy(null); }
  }

  async function resetPassword(user: User) {
    if (busy !== null) return;
    setBusy(user.id); setActionError('');
    try {
      const { password } = await api<{ password: string }>(`/admin/users/${user.id}/password`, {});
      haptic.success(); setTemp({ id: user.id, password });
    } catch (e) { setActionError(err(e)); }
    finally { setBusy(null); }
  }

  async function identityStep(user: User) {
    if (busy !== null) return;
    setBusy(user.id); setActionError('');
    try {
      if (identity?.id !== user.id) {
        await api(`/admin/users/${user.id}/identity-code`, {});
        setIdentity({ id: user.id, code: '' });
      } else {
        const { at } = await api<{ at: number }>(`/admin/users/${user.id}/identity-check`, { code: identity.code });
        setIdentity({ ...identity, confirmedAt: at });
      }
      haptic.success();
    } catch (e) {
      haptic.error(); setActionError(err(e));
      if (e instanceof ApiError && e.message === 'code_expired') setIdentity(null); // the button sends a fresh one
    } finally { setBusy(null); }
  }

  return <Screen onRefresh={reload}>
    <Header title={c.users} />
    <Field label={c.search} value={q} onChangeText={setQ} placeholder={c.usersSearch} />
    <View style={{ marginBottom: 12 }}>
      <FilterChips items={(['all', 'customer', 'driver', 'admin'] as const).map(key => ({ key, label: key === 'all' ? c.all : c[key] }))} value={role} onChange={setRole} />
    </View>
    <ErrorText>{actionError || (error && err(error))}</ErrorText>
    {!data ? <Loading failed={!!error} onRetry={reload} /> : data.length === 0 ? <Empty icon="people-outline" title={c.noUsers} />
      : data.map((user, i) => <Appear key={user.id} index={i}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="title">{user.name}</Txt>
              <Txt variant="caption" selectable>{user.email || user.phone}</Txt>
              {user.email && <Txt variant="caption" selectable>{user.phone}</Txt>}
              <Txt variant="micro">{date(user.createdAt)}</Txt>
            </View>
            <Badge label={c[user.status]} tone={user.status === 'active' ? tones.olive : user.status === 'pending' ? tones.clay : tones.error} />
          </Row>
          <Row gap={6} style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <Badge label={c[user.role]} tone={tones.blue} />
            {user.vehicle && <Badge label={c[user.vehicle]} tone={tones.muted} />}
            {user.plate && <Badge label={user.plate} tone={tones.muted} />}
            {user.permanentlyApprovedAt && <Badge label={c.permanentlyApproved} tone={tones.olive} />}
          </Row>
          <Txt variant="micro" style={{ marginTop: 8 }}>{c.phone}: {user.phoneVerifiedAt ? c.verified : c.unverified}{user.email ? ` · ${c.email}: ${user.emailVerifiedAt ? c.verified : c.unverified}` : ''}</Txt>
          {user.role !== 'admin' && me?.capabilities?.emailVerification && user.email && user.emailVerifiedAt && <View style={{ marginTop: 12 }}>
            <Txt variant="label">{c.identityTitle}</Txt>
            {identity?.id === user.id && identity.confirmedAt
              ? <Txt variant="title" style={{ color: palette.olive, marginTop: 6 }}>{fill(c.identityConfirmed, { time: time(identity.confirmedAt) })}</Txt>
              : <>
                <Txt variant="caption" style={{ marginVertical: 6 }}>{fill(c.identityBody, { email: user.email })}</Txt>
                {identity?.id === user.id && <Field label={c.emailCodeLabel} value={identity.code} keyboardType="number-pad" maxLength={6} disabled={busy !== null}
                  onChangeText={code => setIdentity({ id: user.id, code: code.replace(/\D/g, '').slice(0, 6) })} />}
                <Button title={identity?.id === user.id ? c.identityCheck : c.identitySend} icon={identity?.id === user.id ? 'shield-checkmark-outline' : 'mail-outline'} variant="soft"
                  loading={busy === user.id} disabled={busy !== null || (identity?.id === user.id && identity.code.length !== 6)} reason={busy !== null ? c.wait_busy : c.code_six_digits} onPress={() => identityStep(user)} />
              </>}
          </View>}
          {user.role !== 'admin' && <View style={{ marginTop: 12, gap: 8 }}>
            {/* only drivers wait on approval (server needActive); on a customer it was the loudest button doing nothing */}
            {user.role === 'driver' && !user.permanentlyApprovedAt && <Button title={c.permanentlyApprove} icon="checkmark-circle-outline" loading={busy === user.id} disabled={busy !== null} reason={c.wait_busy}
              onPress={() => confirm(fill(c.approvalConfirm, { name: user.name }), () => action(user, '/approve', {}), c.approve, c.cancel)} />}
            <Row gap={8}>
              <View style={{ flex: 1 }}><Button title={c.editUser} variant="soft" disabled={busy !== null} reason={c.wait_busy} onPress={() => setEditing({ id: user.id, name: user.name, email: user.email ?? '', phone: user.phone, role: user.role as 'customer' | 'driver', vehicle: user.vehicle ?? 'car', plate: user.plate ?? '' })} /></View>
              <View style={{ flex: 1 }}><Button title={user.status === 'blocked' ? c.unblock : c.block} variant={user.status === 'blocked' ? 'soft' : 'danger'} disabled={busy !== null} reason={c.wait_busy}
                onPress={() => action(user, '', { status: user.status === 'blocked' ? user.role === 'driver' && !user.permanentlyApprovedAt ? 'pending' : 'active' : 'blocked' }, 'PATCH')} /></View>
            </Row>
            {editing?.id === user.id && <View>
              <Field label={c.name} value={editing.name} onChangeText={name => setEditing({ ...editing, name })} maxLength={60} disabled={busy !== null} />
              <Field label={c.email} value={editing.email} onChangeText={email => setEditing({ ...editing, email })} keyboardType="email-address" maxLength={254} disabled={busy !== null} />
              <Field label={c.phone} value={editing.phone} onChangeText={phone => setEditing({ ...editing, phone })} keyboardType="phone-pad" disabled={busy !== null} />
              <Choices items={[{ key: 'customer', label: c.customer }, { key: 'driver', label: c.driver }]} value={editing.role} onChange={next => setEditing({ ...editing, role: next })} disabled={busy !== null} />
              {editing.role === 'driver' && <View style={{ marginTop: 8 }}><Choices items={vehicles.map(key => ({ key, label: c[key] }))} value={editing.vehicle} onChange={vehicle => setEditing({ ...editing, vehicle })} disabled={busy !== null} /></View>}
              {editing.role === 'driver' && editing.vehicle !== 'bicycle' && <Field label={c.plate} value={editing.plate} onChangeText={plate => setEditing({ ...editing, plate })} placeholder={c.plateHint} maxLength={12} disabled={busy !== null} />}
              <Row style={{ marginVertical: 10 }}>
                <View style={{ flex: 1 }}><Button title={c.save} loading={busy === user.id} onPress={() => action(user, '', { name: editing.name, email: editing.email || null, phone: editing.phone, role: editing.role, vehicle: editing.vehicle, plate: editing.plate.trim() || null }, 'PATCH')} /></View>
                <View style={{ flex: 1 }}><Button title={c.cancel} variant="ghost" disabled={busy !== null} reason={c.wait_busy} onPress={() => setEditing(null)} /></View>
              </Row>
              {temp?.id === user.id ? <Txt variant="title" selectable center style={{ color: palette.clayInk }}>{fill(c.tempPassword, { password: temp.password })}</Txt>
                : <Button title={c.resetPassword} icon="key-outline" variant="ghost" disabled={busy !== null} reason={c.wait_busy} onPress={() => confirm(fill(c.resetConfirm, { name: user.name }), () => resetPassword(user), c.resetPassword, c.cancel)} />}
            </View>}
            <Button title={c.deleteAccount} icon="trash-outline" variant="ghost" disabled={busy !== null} reason={c.wait_busy}
              onPress={() => confirm(fill(c.deleteUserConfirm, { name: user.name }), () => action(user, '', undefined, 'DELETE'), c.deleteAccount, c.cancel)} />
          </View>}
        </Card>
      </Appear>)}
  </Screen>;
}
