import { useState } from 'react';
import { View } from 'react-native';
import { api, useApi } from '../../api';
import type { Role, User } from '../../model';
import { useFormat } from '../../parts';
import {
  Appear, Badge, Button, Card, confirm, Empty, ErrorText, Field, fill, FilterChips, haptic, Header, Loading, palette, Row, Screen, tones, Txt, useCopy,
} from '../../ui';

export default function Users() {
  const { c, err } = useCopy();
  const { date } = useFormat();
  const [role, setRole] = useState<'all' | Role>('all');
  const [q, setQ] = useState('');
  const path = `/admin/users?q=${encodeURIComponent(q.trim())}${role === 'all' ? '' : `&role=${role}`}`;
  const { data, error, reload } = useApi<User[]>(path);
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [temp, setTemp] = useState<{ id: number; password: string } | null>(null);

  async function resetPassword(user: User) {
    setActionError('');
    try {
      const { password } = await api<{ password: string }>(`/admin/users/${user.id}/password`, {});
      haptic.success();
      setTemp({ id: user.id, password });
    } catch (e) {
      setActionError(err(e));
    }
  }

  async function setStatus(user: User, status: 'active' | 'blocked') {
    setBusy(user.id);
    setActionError('');
    try {
      await api(`/admin/users/${user.id}`, { status });
      haptic.success();
      await reload();
    } catch (e) {
      setActionError(err(e));
    }
    setBusy(null);
  }

  return <Screen onRefresh={reload}>
    <Header title={c.users} />
    <Field label={c.search} value={q} onChangeText={setQ} placeholder="059…" />
    <View style={{ marginBottom: 12 }}>
      <FilterChips items={(['all', 'customer', 'driver', 'admin'] as const).map(key => ({ key, label: key === 'all' ? c.all : c[key] }))} value={role} onChange={setRole} />
    </View>
    <ErrorText>{actionError || (error && err(error))}</ErrorText>
    {!data ? <Loading /> : data.length === 0 ? <Empty icon="people-outline" title={c.nothingHere} />
      : data.map((user, i) => <Appear key={user.id} index={i}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="title">{user.name}</Txt>
              <Txt variant="caption">{user.phone} · {date(user.createdAt)}</Txt>
            </View>
            <Badge label={c[user.status]} tone={user.status === 'active' ? tones.olive : user.status === 'pending' ? tones.clay : tones.error} />
          </Row>
          <Row gap={6} style={{ marginTop: 8 }}>
            <Badge label={c[user.role]} tone={tones.blue} />
            {user.vehicle && <Badge label={c[user.vehicle]} tone={tones.muted} />}
            {user.rating != null && <Badge label={`★ ${user.rating}`} tone={tones.clay} />}
          </Row>
          {user.role !== 'admin' && <View style={{ marginTop: 12, gap: 8 }}>
            {user.status === 'pending' && <Button title={c.approve} icon="checkmark-circle-outline" loading={busy === user.id} onPress={() => setStatus(user, 'active')} />}
            {user.status === 'active' && <Button title={c.block} variant="danger" loading={busy === user.id} onPress={() => setStatus(user, 'blocked')} />}
            {user.status === 'blocked' && <Button title={c.unblock} variant="soft" loading={busy === user.id} onPress={() => setStatus(user, 'active')} />}
            {temp?.id === user.id
              ? <Txt variant="title" selectable center style={{ color: palette.clay }}>{fill(c.tempPassword, { password: temp.password })}</Txt>
              : <Button title={c.resetPassword} icon="key-outline" variant="ghost"
                onPress={() => confirm(fill(c.resetConfirm, { name: user.name }), () => resetPassword(user), c.resetPassword, c.no)} />}
          </View>}
        </Card>
      </Appear>)}
  </Screen>;
}

