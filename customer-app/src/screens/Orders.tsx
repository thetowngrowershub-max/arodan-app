import React from 'react';
import { Linking, ScrollView, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { BillCard, Button, Card, Header, Row, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { productById } from '../data/catalog';
import { naira, timeLabel } from '../lib/format';
import { useNav } from '../nav';
import { useApp } from '../store/AppContext';
import { colors, radius } from '../theme';
import { ORDER_STEPS } from '../api/types';
import { backend } from '../api';
import { statusText } from './Shop';
import { ErrandLine } from './Checkout';

const stepLabel: Record<string, string> = {
  placed: 'Order placed',
  assigned: 'Rider assigned',
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  at_gate: 'At your gate',
  delivered: 'Delivered',
};

export function OrdersTab() {
  const { orders } = useApp();
  const { push, reset } = useNav();
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 170, gap: 12 }}>
      <Txt v="h1" style={{ marginBottom: 4 }}>Orders</Txt>
      {!orders.length && (
        <View style={{ alignItems: 'center', gap: 12, marginTop: 60 }}>
          <Txt style={{ fontSize: 56 }}>📦</Txt>
          <Txt v="h3">No orders yet</Txt>
          <Button title="Browse the shop" onPress={() => reset({ name: 'tabs', tab: 'shop' })} />
        </View>
      )}
      {orders.map((o) => {
        const live = o.status !== 'delivered' && o.status !== 'cancelled';
        const what = [o.lines.length && `${o.lines.reduce((s, l) => s + l.qty, 0)} items`, o.errands.length && `${o.errands.length} errand${o.errands.length > 1 ? 's' : ''}`].filter(Boolean).join(' + ');
        return (
          <Card key={o.id} onPress={() => push({ name: 'tracking', id: o.id })} style={[{ gap: 6 }, live ? { backgroundColor: colors.tint } : {}]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label">{o.code} · {timeLabel(new Date(o.createdAt))}</Txt>
              {live && <View style={{ backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}><Txt v="small" weight="semibold" color={colors.onAccent}>Live</Txt></View>}
            </Row>
            <Txt v="h3">{statusText[o.status]}</Txt>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="small">{what}</Txt>
              <Txt weight="semibold">{naira(o.bill.total)}</Txt>
            </Row>
          </Card>
        );
      })}
    </ScrollView>
  );
}

function RouteMap({ progress }: { progress: number }) {
  // Stylised route from pickup (left) to the customer's gate (right).
  const d = 'M30 150 C 90 40, 170 200, 230 90 S 320 40, 330 60';
  const pts: [number, number][] = [[30, 150], [90, 100], [150, 130], [230, 90], [290, 55], [330, 60]];
  const i = Math.min(pts.length - 1, Math.round(progress * (pts.length - 1)));
  return (
    <View style={{ height: 200, borderRadius: radius.card, backgroundColor: colors.tint, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox="0 0 360 200">
        {[40, 90, 140].map((y) => <Path key={y} d={`M0 ${y} H360`} stroke="#CFE7DA" strokeWidth={10} />)}
        {[70, 180, 280].map((x) => <Path key={x} d={`M${x} 0 V200`} stroke="#CFE7DA" strokeWidth={10} />)}
        <Path d={d} stroke={colors.primary} strokeWidth={5} fill="none" strokeDasharray="2 10" strokeLinecap="round" />
        <Circle cx={30} cy={150} r={9} fill={colors.bg} stroke={colors.primary} strokeWidth={4} />
        <Circle cx={330} cy={60} r={11} fill={colors.primary} />
        <Circle cx={pts[i][0]} cy={pts[i][1]} r={16} fill={colors.accent} stroke={colors.bg} strokeWidth={4} />
      </Svg>
    </View>
  );
}

export function TrackingScreen({ id }: { id: string }) {
  const { pop } = useNav();
  const { orders, updateOrder } = useApp();
  const o = orders.find((x) => x.id === id);
  if (!o) return <Header title="Order not found" onBack={pop} />;
  const idx = o.status === 'cancelled' ? -1 : ORDER_STEPS.indexOf(o.status);
  const live = idx >= 0 && o.status !== 'delivered';
  const gateVisible = live && idx >= 1;
  return (
    <View style={{ flex: 1 }}>
      <Header title={`Order ${o.code}`} onBack={pop} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        {o.status !== 'cancelled' && <RouteMap progress={Math.max(0, idx - 1) / (ORDER_STEPS.length - 2)} />}
        <View style={{ gap: 2 }}>
          <Txt v="h2">{statusText[o.status]}</Txt>
          {live && <Txt color={colors.muted}>Estimated arrival {timeLabel(new Date(o.createdAt + o.etaMin * 60000))}</Txt>}
        </View>

        {gateVisible && (o.address.gateCode || o.address.gateName) ? (
          <View style={{ backgroundColor: colors.accent, borderRadius: radius.card, padding: 18, gap: 4 }}>
            <Row style={{ gap: 8 }}>
              <Icon name="key" color={colors.onAccent} />
              <Txt v="label" color={colors.onAccent}>Gate pass shared with rider</Txt>
            </Row>
            <Txt v="h1" color={colors.onAccent}>{o.address.gateCode || '—'}</Txt>
            <Txt v="small" color={colors.onAccent}>{[o.address.gateName, o.address.gateNote].filter(Boolean).join(' · ')}</Txt>
          </View>
        ) : null}

        {live && idx >= 1 && o.deliveryCode ? (
          <Card tint style={{ gap: 4 }}>
            <Row style={{ gap: 8 }}>
              <Icon name="shield" color={colors.primary} />
              <Txt v="label" color={colors.primary}>Delivery code</Txt>
            </Row>
            <Txt v="h1" style={{ letterSpacing: 8 }}>{o.deliveryCode}</Txt>
            <Txt v="small" color={colors.ink}>Give this code to your rider only when you have your package. It confirms the hand-over.</Txt>
          </Card>
        ) : null}

        {o.rider && idx >= 1 && (
          <Card style={{ gap: 12 }}>
            <Row style={{ gap: 12 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Txt v="h2" color={colors.primary}>{o.rider.name[0]}</Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="h3">{o.rider.name}</Txt>
                <Txt v="small">{o.rider.vehicle} · {o.rider.plate} · ★ {o.rider.rating} · {o.rider.trips} trips</Txt>
              </View>
              <Button title="" icon="phone" kind="soft" style={{ width: 48, height: 48, paddingHorizontal: 0 }} onPress={() => Linking.openURL('tel:' + o.rider!.phone.replace(/\s/g, ''))} />
            </Row>
            <Row style={{ gap: 8, flexWrap: 'wrap' }}>
              {o.rider.checks.map((c) => (
                <Row key={c} style={{ gap: 4, backgroundColor: colors.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Icon name="shield" size={14} color={colors.primary} />
                  <Txt v="small" color={colors.ink}>{c}</Txt>
                </Row>
              ))}
            </Row>
          </Card>
        )}

        <Card style={{ gap: 0 }}>
          {ORDER_STEPS.map((s, i) => {
            const done = idx >= i;
            const t = o.statusTimes[s];
            return (
              <Row key={s} style={{ gap: 12, alignItems: 'flex-start' }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: done ? colors.primary : colors.bg, borderWidth: 2, borderColor: done ? colors.primary : colors.line, alignItems: 'center', justifyContent: 'center' }}>
                    {done && <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={2.6} />}
                  </View>
                  {i < ORDER_STEPS.length - 1 && <View style={{ width: 2, height: 26, backgroundColor: idx > i ? colors.primary : colors.line }} />}
                </View>
                <Row style={{ flex: 1, justifyContent: 'space-between' }}>
                  <Txt weight={idx === i ? 'semibold' : 'regular'} color={done ? colors.ink : colors.muted}>{stepLabel[s]}</Txt>
                  {t ? <Txt v="small">{timeLabel(new Date(t))}</Txt> : null}
                </Row>
              </Row>
            );
          })}
        </Card>

        {(o.lines.length > 0 || o.errands.length > 0) && (
          <Card style={{ gap: 6 }}>
            <Txt v="h3">What's in this order</Txt>
            {o.lines.map((l) => {
              const p = productById(l.productId);
              return (
                <Row key={l.productId} style={{ justifyContent: 'space-between' }}>
                  <Txt style={{ flex: 1 }}>{p.emoji} {p.name} × {l.qty}</Txt>
                  <Txt>{naira(p.price * l.qty)}</Txt>
                </Row>
              );
            })}
            {o.errands.map((e) => <ErrandLine key={e.id} e={e} />)}
          </Card>
        )}

        <BillCard bill={o.bill} surge={o.quote.surge} />
        <Txt v="small" style={{ textAlign: 'center' }}>
          Paid by {o.payment === 'card' ? 'card' : o.payment === 'transfer' ? 'bank transfer' : 'pay on delivery'}
        </Txt>
        {o.status === 'placed' && (
          <Button title="Cancel order" kind="ghost" onPress={async () => { try { updateOrder(await backend.cancelOrder(o)); } catch {} }} />
        )}
      </ScrollView>
    </View>
  );
}
