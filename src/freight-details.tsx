import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FreightDraft } from './freight-scope';
import type { Order } from './model';
import { useFormat } from './parts';
import { Card, Field, fill, palette, Press, Row, Txt, useCopy } from './ui';

export function FreightScopeForm({ draft, onChange, disabled }: { draft: FreightDraft; onChange: (draft: FreightDraft) => void; disabled: boolean }) {
  const { c } = useCopy();
  const fields = [ ['pieces', c.freightPieces], ['lengthCm', c.freightLength], ['widthCm', c.freightWidth], ['heightCm', c.freightHeight],
    ['massKg', c.freightMass], ['crew', c.freightCrew], ['value', c.freightValue] ] as const;
  return <View style={{ gap: 10, marginTop: 12 }}>
    <Txt variant="title">{c.freightScopeTitle}</Txt>
    <Txt variant="caption">{c.freightScopeHint}</Txt>
    {fields.map(([key, label]) => <Field key={key} label={label} value={draft[key]} keyboardType={key === 'pieces' || key === 'crew' ? 'number-pad' : 'decimal-pad'}
      maxLength={16} disabled={disabled} onChangeText={text => onChange({ ...draft, [key]: text })} />)}
    <Txt variant="label">{c.freightEquipment}</Txt>
    {([['straps', c.freightStraps], ['refrigeration', c.freightCold]] as const).map(([key, label]) => <Press key={key}
      accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: draft.equipment.includes(key) }} disabled={disabled}
      style={{ padding: 14, minHeight: 48, borderWidth: 1, borderColor: palette.olive, borderRadius: 12 }}
      onPress={() => onChange({ ...draft, equipment: draft.equipment.includes(key) ? draft.equipment.filter(x => x !== key) : [...draft.equipment, key] })}>
      <Row gap={10}><Ionicons name={draft.equipment.includes(key) ? 'checkbox-outline' : 'square-outline'} size={22} color={palette.olive} /><Txt>{label}</Txt></Row>
    </Press>)}
  </View>;
}

export function FreightDetails({ order }: { order: Pick<Order, 'service' | 'declaredScope' | 'measuredScope'> }) {
  const { c } = useCopy(), { time } = useFormat();
  const s = order.declaredScope, m = order.measuredScope;
  if (order.service !== 'freight' || !s && !m) return null;
  const equipmentName = (token: string) => token === 'straps' ? c.freightStraps : token === 'refrigeration' ? c.freightCold : token.replaceAll('_', ' ');
  return <Card tone="muted">
    <Txt variant="title">{c.freightScopeTitle}</Txt>
    {s && <View style={{ gap: 6, marginTop: 8 }}>
      <Txt>{fill(c.freightLoadSummary, { n: s.itemCount ?? '—', kg: s.massGrams == null ? '—' : s.massGrams / 1000, crew: s.crewCount ?? '—' })}</Txt>
      {s.lengthMm != null && s.widthMm != null && s.heightMm != null && <Txt variant="caption">{fill(c.freightDimensions, { l: s.lengthMm / 10, w: s.widthMm / 10, h: s.heightMm / 10 })}</Txt>}
      {!!s.equipment.length && <Txt variant="caption">{c.freightEquipment}: {s.equipment.map(equipmentName).join(' · ')}</Txt>}
      {s.loadingAfter != null && s.loadingBefore != null && <Txt variant="caption">{fill(c.freightWindow, { from: time(s.loadingAfter), to: time(s.loadingBefore) })}</Txt>}
    </View>}
    {m && <Txt variant="label" style={{ marginTop: 8 }}>{fill(c.freightInspected, { n: m.pieces, kg: m.grams / 1000, seats: m.seats })}</Txt>}
  </Card>;
}
