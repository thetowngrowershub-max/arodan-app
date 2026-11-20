import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Button, Card, Chip, Empty, ErrorText, Header, Pill, Row, Segments, Thumb, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors } from '../theme';
import { useNav } from '../nav';
import { useApp } from '../store/AppContext';
import { backend } from '../api';
import { ago, naira, timeLabel } from '../lib/format';
import type { MerchantOrder, OrderAction, PartStatus } from '../api/types';

type Seg = 'new' | 'preparing' | 'ready' | 'past';
const segOf = (s: PartStatus): Seg => (s === 'new' || s === 'preparing' || s === 'ready' ? s : 'past');

export const STATUS: Record<PartStatus, { label: string; tone: 'accent' | 'tint' | 'primary' | 'neutral' | 'danger' }> = {
  new: { label: 'New order', tone: 'accent' },
  preparing: { label: 'Preparing', tone: 'tint' },
  ready: { label: 'Ready for pickup', tone: 'primary' },
  picked_up: { label: 'Collected by rider', tone: 'neutral' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

const NEXT: Partial<Record<PartStatus, { action: OrderAction; title: string }>> = {
  new: { action: 'accept', title: 'Accept and start packing' },
  preparing: { action: 'ready', title: 'Mark ready for pickup' },
};

/** Ticks every 30 s so "4 min ago" stays current. */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function OrderCard({ o, now }: { o: MerchantOrder; now: number }) {
  const { push } = useNav();
  const { actOnOrder } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const next = NEXT[o.status];
  const units = o.items.reduce((s, i) => s + i.qty, 0);
  return (
    <Card onPress={() => push({ name: 'order', id: o.id })} style={[{ gap: 12 }, o.status === 'new' ? { borderWidth: 2, borderColor: colors.accent } : {}]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Txt v="h3">{o.code}</Txt>
          <Txt v="small">{o.customerName} · {ago(o.createdAt, now)}</Txt>
        </View>
        <Pill {...STATUS[o.status]} />
      </Row>
      <Row style={{ gap: 8 }}>
        {o.items.slice(0, 4).map((i) => <Thumb key={i.productId} uri={backend.imageSrc(i.imageUrl)} emoji={i.emoji} size={44} />)}
        <View style={{ flex: 1, marginLeft: 4 }}>
          <Txt numberOfLines={1}>{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</Txt>
          <Txt v="small">{units} item{units === 1 ? '' : 's'} · {naira(o.itemsTotal)}</Txt>
        </View>
      </Row>
      {o.status === 'ready' && (
        <Row style={{ gap: 8 }}>
          <Icon name="bike" color={colors.primary} size={18} />
          <Txt v="small" color={colors.ink} style={{ flex: 1 }}>{o.rider ? `${o.rider.name} is coming to collect` : 'Finding a rider to collect'}</Txt>
        </Row>
      )}
      {next && (
        <Button title={next.title} kind={o.status === 'new' ? 'primary' : 'soft'} loading={busy} style={{ height: 46 }}
          onPress={async () => {
            setBusy(true);
            setErr('');
            try { await actOnOrder(o.id, next.action); } catch (e: any) { setErr(e?.message); } finally { setBusy(false); }
          }} />
      )}
      <ErrorText text={err} />
    </Card>
  );
}

export function OrdersTab() {
  const { merchant, orders, ordersError, refreshOrders } = useApp();
  const [seg, setSeg] = useState<Seg>('new');
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow();
  const counts = useMemo(() => {
    const c: Record<Seg, number> = { new: 0, preparing: 0, ready: 0, past: 0 };
    orders.forEach((o) => c[segOf(o.status)]++);
    return c;
  }, [orders]);
  const shown = orders.filter((o) => segOf(o.status) === seg);
  const empty = {
    new: { emoji: '🛎️', title: 'No new orders', text: 'New orders appear here and your phone buzzes. Keep the app open while the shop is open.' },
    preparing: { emoji: '📦', title: 'Nothing being packed', text: 'Orders you accept move here while you pack them.' },
    ready: { emoji: '🛵', title: 'Nothing waiting for a rider', text: 'Packed orders wait here until the rider collects.' },
    past: { emoji: '🧾', title: 'No past orders yet', text: 'Collected, declined and cancelled orders show here.' },
  }[seg];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 150, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={async () => { setRefreshing(true); await refreshOrders(); setRefreshing(false); }} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt v="small" weight="semibold" color={colors.primary}>{merchant?.name}</Txt>
          <Txt v="h1">Orders</Txt>
        </View>
        <Pill label={merchant?.isOpen ? 'Open' : 'Closed'} tone={merchant?.isOpen ? 'tint' : 'danger'} />
      </Row>
      {merchant?.status === 'pending' && (
        <Card tint style={{ gap: 6 }}>
          <Row style={{ gap: 8 }}><Icon name="clock" color={colors.primary} /><Txt v="h3">Waiting for approval</Txt></Row>
          <Txt v="small" color={colors.ink}>Arodan is checking your shop. Customers will see your products once you're approved, usually within a day. Add your products now so you're ready.</Txt>
        </Card>
      )}
      {merchant?.status === 'suspended' && (
        <Card style={{ gap: 6, backgroundColor: '#FDECE4' }}>
          <Txt v="h3" color={colors.danger}>Shop paused by Arodan</Txt>
          <Txt v="small" color={colors.ink}>Customers can't see your products right now. Please call Arodan support.</Txt>
        </Card>
      )}
      <Segments value={seg} onChange={setSeg} items={[
        { id: 'new', label: 'New', count: counts.new },
        { id: 'preparing', label: 'Packing', count: counts.preparing },
        { id: 'ready', label: 'Ready', count: counts.ready },
        { id: 'past', label: 'Past' },
      ]} />
      <ErrorText text={ordersError} />
      {shown.length ? shown.map((o) => <OrderCard key={o.id} o={o} now={now} />) : <Empty {...empty} />}
    </ScrollView>
  );
}

const DECLINE_REASONS = ['Out of stock', 'Item damaged', 'Shop closing', 'Price changed'];

export function OrderScreen({ id }: { id: string }) {
  const { pop } = useNav();
  const { orders, actOnOrder } = useApp();
  const o = orders.find((x) => x.id === id);
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [err, setErr] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  if (!o) {
    return (
      <>
        <Header onBack={pop} />
        <Empty emoji="🔎" title="Order not found" />
      </>
    );
  }
  const next = NEXT[o.status];
  const act = async (a: OrderAction, r?: string) => {
    setBusy(a);
    setErr('');
    try {
      await actOnOrder(o.id, a, r);
      setDeclining(false);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not update the order');
    } finally {
      setBusy(null);
    }
  };
  const canDecline = o.status === 'new' || o.status === 'preparing';
  const steps: { s: PartStatus; label: string; at?: number | null }[] = [
    { s: 'new', label: 'Order received', at: o.createdAt },
    { s: 'preparing', label: 'Packing' },
    { s: 'ready', label: 'Ready for pickup', at: o.readyAt },
    { s: 'picked_up', label: 'Collected by rider' },
  ];
  const reached = ['new', 'preparing', 'ready', 'picked_up'].indexOf(o.status);

  return (
    <View style={{ flex: 1 }}>
      <Header title={o.code} onBack={pop} right={<Pill {...STATUS[o.status]} />} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 6, gap: 14, paddingBottom: 160 }}>
        <Txt color={colors.muted}>For {o.customerName} · placed {timeLabel(o.createdAt)}</Txt>

        {reached >= 0 && (
          <Card style={{ gap: 10 }}>
            {steps.map((st, i) => (
              <Row key={st.s} style={{ gap: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: i <= reached ? colors.primary : colors.line, alignItems: 'center', justifyContent: 'center' }}>
                  {i <= reached && <Icon name="check" color={colors.onPrimary} size={14} strokeWidth={2.4} />}
                </View>
                <Txt style={{ flex: 1 }} weight={i === reached ? 'semibold' : 'regular'} color={i <= reached ? colors.ink : colors.muted}>{st.label}</Txt>
                {st.at && i <= reached ? <Txt v="small">{timeLabel(st.at)}</Txt> : null}
              </Row>
            ))}
          </Card>
        )}
        {(o.status === 'declined' || o.status === 'cancelled') && (
          <Card style={{ backgroundColor: '#FDECE4', gap: 4 }}>
            <Txt v="h3" color={colors.danger}>{o.status === 'declined' ? 'You declined this order' : 'The customer cancelled this order'}</Txt>
            <Txt v="small" color={colors.ink}>{o.declineReason ? `Reason: ${o.declineReason}. ` : ''}Stock has been put back. The customer is not charged.</Txt>
          </Card>
        )}

        <Txt v="label">Pack these items</Txt>
        <Card style={{ gap: 12 }}>
          {o.items.map((i) => (
            <Row key={i.productId} style={{ gap: 12 }}>
              <Thumb uri={backend.imageSrc(i.imageUrl)} emoji={i.emoji} size={52} />
              <View style={{ flex: 1 }}>
                <Txt weight="semibold">{i.name}</Txt>
                <Txt v="small">{i.unit ? `${i.unit} · ` : ''}{naira(i.unitPrice)} each</Txt>
              </View>
              <Txt v="h2">×{i.qty}</Txt>
            </Row>
          ))}
          <View style={{ height: 1, backgroundColor: colors.line }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3">Your sale</Txt>
            <Txt v="h2">{naira(o.itemsTotal)}</Txt>
          </Row>
          <Txt v="small">Arodan collects payment from the customer, so don't take money from the rider or customer.</Txt>
        </Card>

        <Txt v="label">Pickup</Txt>
        <Card style={{ gap: 10 }}>
          {o.rider ? (
            <>
              <Row style={{ gap: 12 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bike" color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight="semibold">{o.rider.name}</Txt>
                  <Txt v="small">{o.rider.vehicle === 'bicycle' ? 'Bicycle' : 'Motorbike'} · {o.rider.plate}</Txt>
                </View>
                <Pressable onPress={() => Linking.openURL(`tel:${o.rider!.phone.replace(/\s/g, '')}`)} accessibilityLabel={`Call ${o.rider.name}`}
                  style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="phone" color={colors.onPrimary} size={20} />
                </Pressable>
              </Row>
              <Txt v="small" color={colors.ink}>Check the order code <Txt v="small" weight="bold" color={colors.ink}>{o.code}</Txt> with the rider before handing over.</Txt>
            </>
          ) : (
            <Row style={{ gap: 10 }}>
              <Icon name="clock" color={colors.muted} size={20} />
              <Txt v="small" color={colors.ink} style={{ flex: 1 }}>A rider will be assigned shortly. They can only collect once you mark the order ready.</Txt>
            </Row>
          )}
        </Card>

        {declining && (
          <Card style={{ gap: 10 }}>
            <Txt v="h3">Why can't you fill this order?</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DECLINE_REASONS.map((r) => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}
            </View>
            <Txt v="small">For now, declining cancels the customer's whole order, so only decline if you really can't fill it. If you're short on one item, call Arodan support instead.</Txt>
            <Row style={{ gap: 10 }}>
              <Button title="Keep order" kind="ghost" onPress={() => setDeclining(false)} style={{ flex: 1 }} />
              <Button title="Decline" kind="accent" loading={busy === 'decline'} onPress={() => act('decline', reason)} style={{ flex: 1 }} />
            </Row>
          </Card>
        )}
        <ErrorText text={err} />
      </ScrollView>
      {(next || canDecline) && !declining && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 }}>
          {next && <Button title={next.title} icon={o.status === 'new' ? 'check' : 'box'} loading={busy === next.action} onPress={() => act(next.action)} />}
          {canDecline && <Button title="Can't fill this order" kind="ghost" onPress={() => setDeclining(true)} style={{ height: 46 }} />}
        </View>
      )}
    </View>
  );
}
