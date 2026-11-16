// The shop's catalogue (DLV-01, MER-02): sections, items, prices in shekels (stored as agorot), sold by weight, and the
// out-of-stock switch, which is the edit a busy shop makes most often.
import { useState } from 'react';
import { View } from 'react-native';
import { api, errorCode, useApi } from '../../api';
import { minorFromText, type MerchantItem } from '../../model';
import { Button, Card, Choices, Empty, ErrorText, Field, fill, Header, Loading, palette, Row, Screen, Section, Txt, useCopy } from '../../ui';

export default function MerchantCatalogue() {
  const { c, language, money } = useCopy();
  const { data, error, reload } = useApi<{ items: MerchantItem[] }>('/merchant/catalogue');
  const [editing, setEditing] = useState<MerchantItem | 'new' | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  if (!data) return <Screen><Header title={c.merchantCatalogue} back /><Loading failed={!!error} onRetry={reload} /></Screen>;
  async function toggle(item: MerchantItem) {
    setBusy(item.id); setActionError('');
    try { await api(`/merchant/items/${item.id}`, { available: !item.available }); await reload(); }
    catch (e) { setActionError(c[`err_${errorCode(e)}` as keyof typeof c] ?? c.err_generic); }
    finally { setBusy(null); }
  }
  const sections = [...new Set(data.items.map(i => i.section))];
  return <Screen onRefresh={reload} footer={!editing ? <Button title={c.merchantAddItem} icon="add" onPress={() => setEditing('new')} /> : undefined}>
    <Header title={c.merchantCatalogue} back />
    {editing && <ItemForm item={editing === 'new' ? null : editing} onDone={async () => { setEditing(null); await reload(); }} />}
    {!data.items.length && !editing && <Empty icon="pricetags-outline" title={c.merchantNoItems} body={c.merchantNoItemsBody} />}
    <ErrorText>{actionError}</ErrorText>
    {sections.map(section => <Card key={section}>
      <Section title={section} />
      {data.items.filter(i => i.section === section).map(i => <View key={i.id} style={{ borderTopWidth: 1, borderTopColor: palette.line, paddingVertical: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt style={{ flex: 1, opacity: i.available ? 1 : 0.6 }}>{language === 'ar' ? i.nameAr : i.nameEn}</Txt>
          <Txt style={{ writingDirection: 'ltr' }}>{i.byWeight ? fill(c.shopPerKg, { r: money(i.priceAgorot / 100) }) : money(i.priceAgorot / 100)}</Txt>
        </Row>
        <Row style={{ marginTop: 4 }}>
          <Button size="sm" variant={i.available ? 'outline' : 'soft'} loading={busy === i.id} title={i.available ? c.merchantMarkOut : c.merchantMarkIn}
            label={fill(i.available ? c.merchantMarkOutOf : c.merchantMarkInOf, { item: language === 'ar' ? i.nameAr : i.nameEn })} onPress={() => toggle(i)} />
          <Button size="sm" variant="ghost" title={c.edit} onPress={() => setEditing(i)} />
        </Row>
        {!i.available && <Txt variant="caption">{c.merchantOutOfStock}</Txt>}
      </View>)}
    </Card>)}
  </Screen>;
}

function ItemForm({ item, onDone }: { item: MerchantItem | null; onDone: () => void }) {
  const { c } = useCopy();
  const [section, setSection] = useState(item?.section ?? '');
  const [nameAr, setNameAr] = useState(item?.nameAr ?? '');
  const [nameEn, setNameEn] = useState(item?.nameEn ?? '');
  const [price, setPrice] = useState(item ? String(item.priceAgorot / 100) : '');
  const [byWeight, setByWeight] = useState(item?.byWeight ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const priceAgorot = minorFromText(price);
  const reason = !section.trim() ? c.merchantSectionNeeded : !nameAr.trim() || !nameEn.trim() ? c.merchantNamesNeeded
    : !(Number.isSafeInteger(priceAgorot) && priceAgorot >= 1) ? c.merchantPriceNeeded : '';
  async function save() {
    setBusy(true); setError('');
    try {
      await api(item ? `/merchant/items/${item.id}` : '/merchant/items', { section: section.trim(), nameAr: nameAr.trim(), nameEn: nameEn.trim(), priceAgorot, byWeight, available: item?.available ?? true });
      onDone();
    } catch (e) { setError(c[`err_${errorCode(e)}` as keyof typeof c] ?? c.err_generic); }
    finally { setBusy(false); }
  }
  return <Card>
    <Section title={item ? c.merchantEditItem : c.merchantAddItem} />
    <Field label={c.merchantSection} value={section} onChangeText={setSection} maxLength={40} />
    <Field label={c.merchantNameAr} value={nameAr} onChangeText={setNameAr} maxLength={80} />
    <Field label={c.merchantNameEn} value={nameEn} onChangeText={setNameEn} maxLength={80} />
    <Choices label={c.merchantSoldBy} value={byWeight ? 'kg' : 'each'} onChange={k => setByWeight(k === 'kg')} items={[{ key: 'each', label: c.merchantSoldEach }, { key: 'kg', label: c.merchantSoldKg }]} />
    <Field label={byWeight ? c.merchantPricePerKg : c.merchantPrice} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
    <Row>
      <Button title={c.save} loading={busy} disabled={!!reason} reason={reason || undefined} onPress={save} />
      <Button title={c.cancel} variant="ghost" onPress={onDone} />
    </Row>
    <ErrorText>{error}</ErrorText>
  </Card>;
}
