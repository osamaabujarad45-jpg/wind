import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from '../../motion';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApi } from '../../api';
import { PushRow } from '../../parts';
import { pushSupported } from '../../push';
import type { OrderStatus } from '../../model';
import { useSession } from '../../session';
import { Appear, Badge, Card, ErrorText, fill, Header, ListGroup, Loading, palette, Press, Rail, Row, Screen, Stat, Txt, useCopy } from '../../ui';

type Stats = {
  gmv: number; commission: number; subscriptions: number; discounts: number; profit: number; completed: number; activeSubscriptions: number;
  statuses: Partial<Record<OrderStatus, number>>; users: Record<string, number>;
  pendingDrivers: number; pendingSubscriptions: number; openIncidents: number;
  daily: { date: string; commission: number; subscriptions: number }[];
};

// Validated with the dataviz palette checker (CVD-safe on the paper surface);
// both series hold ≥3:1 against the white card.
const SERIES = { commission: '#2F6DB5', subscriptions: '#C77420' };

export default function Dashboard() {
  const { me } = useSession();
  const { c, money, err } = useCopy();
  const { data, error, reload } = useApi<Stats>('/admin/stats', 30_000);

  return <Screen onRefresh={reload}>
    <Header title={c.dashboard} />
    <Txt style={{ marginTop: -12, marginBottom: 14 }}>{fill(c.hello, { name: me?.user.name ?? '' })}</Txt>
    {pushSupported() && <ListGroup><PushRow /></ListGroup>}
    <ErrorText>{error && err(error)}</ErrorText>
    {!data ? <Loading failed={!!error} onRetry={reload} /> : <>
      {data.openIncidents > 0 && <Shortcut label={c.safetyIncidents} count={data.openIncidents}
        onPress={() => router.navigate({ pathname: '/admin/orders', params: { filter: 'safety' } })} />}
      <Row gap={10} style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        <Stat index={0} tone="olive" label={c.profit} value={money(data.profit)} />
        <Stat index={1} label={c.commissionRevenue} value={money(data.commission)} />
        <Stat index={2} label={c.subscriptionRevenue} value={money(data.subscriptions)} />
        <Stat index={3} label={c.promoCost} value={money(data.discounts)} />
        <Stat index={4} label={c.gmv} value={money(data.gmv)} />
        <Stat index={5} label={c.completedCount} value={String(data.completed)} />
        <Stat index={6} label={c.activeSubs} value={String(data.activeSubscriptions)} />
      </Row>

      <Appear index={7}><ProfitChart daily={data.daily} /></Appear>

      {(data.pendingDrivers > 0 || data.pendingSubscriptions > 0) && <Appear index={8}>
        {data.pendingDrivers > 0 && <Shortcut label={c.pendingDrivers} count={data.pendingDrivers} onPress={() => router.navigate('/admin/users')} />}
        {data.pendingSubscriptions > 0 && <Shortcut label={c.pendingSubs} count={data.pendingSubscriptions} onPress={() => router.navigate('/admin/subscriptions')} />}
      </Appear>}

      <Appear index={9}>
        <Card>
          <Txt variant="title" header style={{ marginBottom: 10 }}>{c.allOrders}</Txt>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {(['searching', 'assigned', 'at_pickup', 'in_transit', 'on_hold', 'returning', 'completed', 'returned', 'cancelled'] as const).map(s =>
              // empty statuses say nothing; only the counts that exist show
              data.statuses[s] ? <Badge key={s} status={s} label={`${c[s]}, ${data.statuses[s]}`} /> : null)}
          </Row>
          {!Object.values(data.statuses).some(Boolean) && <Txt variant="caption">{c.noOrders}</Txt>}
          <Txt variant="title" header style={{ marginVertical: 10 }}>{c.users}</Txt>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {(['customer', 'driver', 'admin'] as const).map(r => <Badge key={r} tone={{ bg: palette.muted, fg: palette.ink }} label={`${c[r]}, ${data.users[r] ?? 0}`} />)}
          </Row>
        </Card>
      </Appear>
    </>}
  </Screen>;
}

function Shortcut({ label, count, onPress }: { label: string; count: number; onPress: () => void }) {
  const { rtl } = useCopy();
  return <Press accessibilityLabel={`${label}: ${count}`} onPress={onPress}>
    <Card tone="clay">
      <Row>
        <View style={styles.count}><Txt variant="title" style={{ color: palette.onFill }} center>{count}</Txt></View>
        <Txt variant="title" style={{ flex: 1 }}>{label}</Txt>
        <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={palette.clayInk} />
      </Row>
    </Card>
  </Press>;
}

// Stacked bars, one per day. Tap a bar for its values (the mobile stand-in for hover).
function ProfitChart({ daily }: { daily: Stats['daily'] }) {
  const { c, money, row, language } = useCopy();
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState(daily.length - 1);
  const max = Math.max(1, ...daily.map(d => d.commission + d.subscriptions));
  const day = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(language === 'ar' ? 'ar-PS-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
  const pick = daily[selected];

  return <Card>
    <Txt variant="title" header>{c.last14}</Txt>
    <Row style={{ justifyContent: 'space-between', marginVertical: 8 }}>
      <Row gap={14}>
        {([['commission', c.commissionRevenue], ['subscriptions', c.subscriptionRevenue]] as const).map(([key, label]) =>
          <Row key={key} gap={6}><View style={[styles.swatch, { backgroundColor: SERIES[key] }]} /><Txt variant="caption">{label}</Txt></Row>)}
      </Row>
      <Txt variant="caption" accessibilityLabel={fill(c.chartMaxLabel, { v: money(Math.round(max)) })}>{money(Math.round(max))} ↑</Txt>
    </Row>
    {/* The day that is selected, one line per series with its own colour key: no run of dots to decode. */}
    <Txt variant="title">{day(pick.date)}</Txt>
    <Row gap={6} style={{ marginTop: 4 }}><View style={[styles.swatch, { backgroundColor: SERIES.commission }]} />
      <Txt variant="caption" style={{ color: palette.ink }}>{`${c.commissionRevenue} ${money(pick.commission)}`}</Txt></Row>
    <Row gap={6} style={{ marginTop: 2 }}><View style={[styles.swatch, { backgroundColor: SERIES.subscriptions }]} />
      <Txt variant="caption" style={{ color: palette.ink }}>{`${c.subscriptionRevenue} ${money(pick.subscriptions)}`}</Txt></Row>
    {/* Fourteen days do not fit a 360 dp phone: the plot scrolls sideways and every day keeps a 44pt tap target. */}
    <Rail gap={0} style={{ marginTop: 10 }}>
      <View style={styles.plot}>
        <View style={[styles.grid, { top: 0 }]} />
        <View style={styles.baseline} />
        <View style={[styles.bars, { flexDirection: row }]}>
          {daily.map((d, i) => {
            const total = d.commission + d.subscriptions;
            return <Pressable key={d.date} style={styles.hit} onPress={() => setSelected(i)}
              accessibilityRole="button" accessibilityLabel={`${day(d.date)}: ${money(d.commission)} + ${money(d.subscriptions)}`}>
              <View style={styles.barArea}>
                <Animated.View style={[styles.column, { height: `${Math.max(total / max * 100, total ? 3 : 0)}%`, opacity: i === selected ? 1 : 0.75 },
                  !reduced && { animationName: GROW, animationDuration: '450ms', animationDelay: `${i * 25}ms`, animationTimingFunction: EASE_OUT, animationFillMode: 'backwards' }]}>
                  {d.subscriptions > 0 && <View style={[styles.segment, styles.top, { flex: d.subscriptions, backgroundColor: SERIES.subscriptions }]} />}
                  {d.commission > 0 && <View style={[styles.segment, !d.subscriptions && styles.top, { flex: d.commission, backgroundColor: SERIES.commission }]} />}
                </Animated.View>
              </View>
              <Txt variant="micro" center>{day(d.date)}</Txt>
            </Pressable>;
          })}
        </View>
      </View>
    </Rail>
  </Card>;
}

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
const GROW = { from: { transform: [{ scaleY: 0.1 }], opacity: 0 }, to: { transform: [{ scaleY: 1 }], opacity: 1 } };

const styles = StyleSheet.create({
  count: { minWidth: 30, minHeight: 30, borderRadius: 15, backgroundColor: palette.clayInk, justifyContent: 'center', paddingHorizontal: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  plot: { height: 166, position: 'relative' },
  grid: { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: palette.muted },
  baseline: { position: 'absolute', left: 0, right: 0, bottom: 16, height: 1, backgroundColor: palette.line },
  bars: { flex: 1, alignItems: 'flex-end' },
  hit: { width: 48, alignItems: 'center', justifyContent: 'flex-end' },
  barArea: { width: 24, height: 150, justifyContent: 'flex-end' },
  column: { width: '100%', gap: 2, transformOrigin: 'bottom' },
  segment: { minHeight: 2 },
  top: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
});
