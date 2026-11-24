import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Card, Chip, Empty, ErrorText, Row, Txt } from '../components/ui';
import { colors, radius } from '../theme';
import { useApp } from '../store/AppContext';
import { backend } from '../api';
import { naira, nairaShort } from '../lib/format';
import type { Sales } from '../api/types';

const PERIODS = [7, 30] as const;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={{ flex: 1, gap: 4, padding: 16 }}>
      <Txt v="small">{label}</Txt>
      <Txt v="h3" weight="bold" style={{ fontSize: 17 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Txt>
      {sub ? <Txt v="small">{sub}</Txt> : null}
    </Card>
  );
}

const dayLabel = (iso: string, long = false) => {
  const d = new Date(iso + 'T12:00:00');
  return long ? d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : d.toLocaleDateString([], { weekday: 'narrow' });
};

/** One series of daily sales: thin emerald bars on a quiet baseline. Tap a bar to read its day. */
function DailyBars({ daily }: { daily: Sales['daily'] }) {
  const [sel, setSel] = useState(daily.length - 1);
  useEffect(() => setSel(daily.length - 1), [daily.length]);
  const max = Math.max(1, ...daily.map((d) => d.sales));
  const H = 140;
  const few = daily.length <= 10;
  const d = daily[sel] ?? daily[daily.length - 1];
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <Txt v="small">{dayLabel(d.date, true)}</Txt>
          <Txt v="h3">{naira(d.sales)} · {d.orders} order{d.orders === 1 ? '' : 's'}</Txt>
        </View>
        <Txt v="small">Top {nairaShort(max)}</Txt>
      </Row>
      <View style={{ height: H, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderBottomColor: colors.line }}
        accessibilityLabel={`Daily sales chart, ${daily.length} days`}>
        {daily.map((x, i) => (
          <Pressable key={x.date} onPress={() => setSel(i)} style={{ flex: 1, height: H, justifyContent: 'flex-end', alignItems: 'center' }}
            accessibilityLabel={`${dayLabel(x.date, true)}: ${naira(x.sales)}`}>
            <View style={{
              width: few ? '62%' : '80%', maxWidth: 28,
              height: x.sales ? Math.max(4, (x.sales / max) * (H - 8)) : 2,
              borderTopLeftRadius: 4, borderTopRightRadius: 4,
              backgroundColor: x.sales ? colors.primary : colors.line, opacity: i === sel ? 1 : 0.55,
            }} />
          </Pressable>
        ))}
      </View>
      {few && (
        <Row style={{ gap: 2 }}>
          {daily.map((x, i) => <Txt key={x.date} v="small" style={{ flex: 1, textAlign: 'center' }} weight={i === sel ? 'semibold' : 'regular'}>{dayLabel(x.date)}</Txt>)}
        </Row>
      )}
    </View>
  );
}

export function SalesTab() {
  const { merchant, orders } = useApp();
  const [days, setDays] = useState<number>(7);
  const [s, setS] = useState<Sales | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setS(await backend.sales(days));
      setErr('');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not load sales');
    }
  }, [days]);
  // Reload when the period changes and whenever orders change.
  const orderKey = orders.map((o) => o.id + o.status).join();
  useEffect(() => { load(); }, [load, orderKey]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 150, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <View>
        <Txt v="small" weight="semibold" color={colors.primary}>{merchant?.name}</Txt>
        <Txt v="h1">Sales</Txt>
      </View>
      <Row style={{ gap: 8 }}>
        {PERIODS.map((p) => <Chip key={p} label={`Last ${p} days`} active={days === p} onPress={() => setDays(p)} />)}
      </Row>
      <ErrorText text={err} />
      {!s ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <Card tint style={{ gap: 4, padding: 20 }}>
            <Txt v="small" color={colors.ink}>Sales, last {s.days} days</Txt>
            <Txt v="h1" style={{ fontSize: 34, lineHeight: 40 }}>{naira(s.sales)}</Txt>
            <Txt v="small" color={colors.ink}>Today so far: {naira(s.today.sales)} from {s.today.orders} order{s.today.orders === 1 ? '' : 's'}</Txt>
          </Card>
          <Row style={{ gap: 10 }}>
            <Stat label="Orders" value={String(s.orders)} />
            <Stat label="Average order" value={naira(s.avgOrder)} />
            <Stat label="Items sold" value={String(s.itemsSold)} />
          </Row>
          <Card style={{ gap: 6 }}>
            <Txt v="h3">Daily sales</Txt>
            <DailyBars daily={s.daily} />
          </Card>
          <Card style={{ gap: 10 }}>
            <Txt v="h3">Best sellers</Txt>
            {s.topProducts.length === 0 ? (
              <Empty emoji="📈" title="No sales yet" text="Your best-selling products will show here." />
            ) : s.topProducts.map((t, i) => (
              <Row key={t.productId} style={{ gap: 12 }}>
                <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}>
                  <Txt v="small" weight="bold" color={colors.ink}>{i + 1}</Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight="semibold" numberOfLines={1}>{t.name}</Txt>
                  <Txt v="small">{t.qty} sold</Txt>
                </View>
                <Txt weight="semibold">{naira(t.sales)}</Txt>
              </Row>
            ))}
          </Card>
          <Txt v="small" style={{ textAlign: 'center' }}>Item prices only. Declined and cancelled orders aren't counted.{backend.mode === 'mock' ? ' Demo figures.' : ''}</Txt>
        </>
      )}
    </ScrollView>
  );
}
