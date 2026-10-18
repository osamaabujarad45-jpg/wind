// Receipt for a finished order (requirement U7): what was moved, where, by whom, what it cost, and how it was handed over.
import { Platform, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApi } from '../../api';
import { city, commissionOn, ltr, orderCode, type Order } from '../../model';
import { statusText, useFormat } from '../../parts';
import { useSession } from '../../session';
import { Appear, Badge, Button, ErrorText, Header, Loading, Logo, palette, Row, Screen, Txt, useCopy } from '../../ui';

export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const { c, language, money, err, rtl } = useCopy();
  const { time } = useFormat();
  const { data: order, error, reload } = useApi<Order>(`/orders/${id}`);

  if (!order || !me) return <Screen><Header title={c.receipt} back /><ErrorText>{error && err(error)}</ErrorText><Loading failed={!!error} onRetry={reload} /></Screen>;

  const role = me.user.role;
  const rate = me.plan === 'pro' ? me.settings.proCommission : me.settings.commission;
  const commission = order.commission ?? commissionOn(order.price, rate);
  const from = city(order.pickupCity)[language], to = city(order.dropoffCity)[language];
  const arrow = rtl ? '←' : '→';
  const done = order.status === 'completed';
  const cash = order.price - order.discount; // promo discounts are paid by Wind, not in cash

  const lines: [string, string][] = [
    [c.receiptNo, ltr(orderCode(order.id))],
    [c.issued, time(order.updatedAt)],
    [c.service, `${c[order.service]}${order.shared ? ` · ${c.shared}` : ''}`], // same rule as OrderRow: only shared, the exception, is marked
    [c.route, `${from} ${arrow} ${to}`],
    [order.service === 'ride' ? c.passengers : c.size, order.service === 'ride' ? order.option : c[order.option as 'small']],
    ...(order.loadingHelp ? [[c.loadingHelp, c.yes] as [string, string]] : []),
    ...(order.driverName ? [[c.driver, `${order.driverName}${order.driverVehicle ? ` · ${c[order.driverVehicle]}` : ''}`] as [string, string]] : []),
    ...(order.discount > 0 ? [[c.fare, money(order.price)], [c.promoDiscount, money(-order.discount)]] as [string, string][] : []),
    [c.payWith, c.cash],
    [c.payment, c.paymentUnconfirmed],
    ...(done ? [[c.proof, order.service === 'ride' ? c.proofRide : c.proofCode] as [string, string]] : []),
  ];

  async function share() {
    const text = [`${c.brand} · ${c.receipt}`, ...lines.map(([k, v]) => `${k}: ${v}`), `${c.total}: ${money(cash)}`].join('\n');
    try { await Share.share({ message: text }); } catch { /* dismissed or unsupported */ }
  }

  return <Screen>
    <Header title={c.receipt} back />
    <Appear>
      <View style={styles.paper}>
        <View style={{ alignItems: 'center', gap: 8, paddingBottom: 16 }}>
          <Logo size={44} />
          <Txt variant="h2" center>{c.brand}</Txt>
          <View style={{ flexDirection: 'row' /* ltr: one centred badge, direction unused */ }}><Badge label={statusText(c, order)} status={order.status} /></View>
        </View>
        <View style={styles.tear} />
        {lines.map(([label, value]) => <Row key={label} gap={12} style={styles.line}>
          <Txt variant="caption" style={{ width: 104 }}>{label}</Txt>
          <Txt variant="title" style={{ flex: 1, fontSize: 14 }}>{value}</Txt>
        </Row>)}
        <View style={styles.tear} />
        <Row style={{ justifyContent: 'space-between', paddingTop: 14 }}>
          <Txt variant="title">{c.total}</Txt>
          <Txt variant="h1" style={{ color: palette.olive }}>{money(cash)}</Txt>
        </Row>
        {role === 'driver' && <Row style={styles.sub}>
          <Txt>{c.commission}</Txt><Txt variant="title">{money(-commission)}</Txt>
        </Row>}
        {role === 'driver' && order.discount > 0 && <Row style={styles.sub}>
          <Txt>{c.promoCredit}</Txt><Txt variant="title">{`+${money(order.discount)}`}</Txt>
        </Row>}
        {role === 'driver' && <Row style={styles.sub}>
          <Txt>{c.youEarn}</Txt><Txt variant="title" style={{ color: palette.olive }}>{money(order.price - commission)}</Txt>
        </Row>}
        {role === 'admin' && order.commission != null && <Row style={styles.sub}>
          <Txt>{c.commission}</Txt><Txt variant="title">{money(order.commission)}</Txt>
        </Row>}
        <Txt variant="caption" center style={{ marginTop: 16 }}>{c.thankYou}</Txt>
      </View>
    </Appear>
    {/* Web has no reliable share sheet; the page itself can be printed or screenshotted. */}
    {Platform.OS !== 'web' && <Button title={c.shareReceipt} icon="share-outline" variant="soft" onPress={share} />}
  </Screen>;
}

const styles = StyleSheet.create({
  paper: { backgroundColor: palette.card, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: palette.line, marginBottom: 16 },
  tear: { borderBottomWidth: 2, borderStyle: 'dashed', borderColor: palette.line, marginVertical: 4 },
  line: { paddingVertical: 9, alignItems: 'flex-start' },
  sub: { justifyContent: 'space-between', paddingTop: 8 },
});
