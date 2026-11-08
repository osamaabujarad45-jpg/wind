import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { freightFieldProblem, type FreightDraft, type FreightFieldKey } from './freight-scope';
import type { Order } from './model';
import { useFormat } from './parts';
import { Card, ErrorText, Field, fill, palette, Press, Row, Txt, useCopy } from './ui';

export function FreightScopeForm({ draft, onChange, disabled, invalid }: { draft: FreightDraft; onChange: (draft: FreightDraft) => void; disabled: boolean; invalid: boolean }) {
  const { c } = useCopy();
  // Validate on blur, not while the customer is still entering a number.
  const [touched, setTouched] = useState<Partial<Record<FreightFieldKey, boolean>>>({});
  const fields = [ ['pieces', c.freightPieces, c.freightPiecesInvalid], ['lengthCm', c.freightLength, c.freightDimensionInvalid],
    ['widthCm', c.freightWidth, c.freightDimensionInvalid], ['heightCm', c.freightHeight, c.freightDimensionInvalid],
    ['massKg', c.freightMass, c.freightMassInvalid], ['crew', c.freightCrew, c.freightCrewInvalid], ['value', c.freightValue, c.freightValueInvalid] ] as const;
  return <View style={{ gap: 10, marginTop: 12 }}>
    <Txt variant="title">{c.freightScopeTitle}</Txt>
    <Txt variant="caption">{c.freightScopeHint}</Txt>
    {fields.map(([key, label, message]) => {
      const decimal = key !== 'pieces' && key !== 'crew';
      const problem = touched[key] ? freightFieldProblem(draft, key) : null;
      return <Field key={key} label={label} value={draft[key]} keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        maxLength={16} disabled={disabled} error={problem === 'required' ? c.fieldRequired : problem === 'invalid' ? message : undefined}
        onBlur={() => setTouched(previous => ({ ...previous, [key]: true }))}
        onChangeText={text => { setTouched(previous => ({ ...previous, [key]: false })); onChange({ ...draft, [key]: text }); }} />;
    })}
    {invalid && fields.every(([key]) => freightFieldProblem(draft, key) === null) && <ErrorText>{c.freightScopeTooLarge}</ErrorText>}
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
