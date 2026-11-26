import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { BillCard, Button, Card, Header, ProductTile, Row, Stepper, Txt } from '../components/ui';
import { Icon, IconName } from '../components/Icon';
import { errandTypes, productById } from '../data/catalog';
import { spotById } from '../data/places';
import { naira } from '../lib/format';
import { errandFee } from '../lib/pricing';
import { useNav } from '../nav';
import { useApp } from '../store/AppContext';
import { priceOrder } from '../store/checkout';
import { colors, radius } from '../theme';
import { backend } from '../api';
import type { Errand, PaymentMethod } from '../api/types';

export function ErrandLine({ e, onRemove }: { e: Errand; onRemove?: () => void }) {
  const t = errandTypes.find((x) => x.id === e.type)!;
  return (
    <Row style={{ gap: 12, paddingVertical: 6 }}>
      <View style={{ width: 56, height: 56, borderRadius: radius.small, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
        <Txt style={{ fontSize: 26 }}>{t.emoji}</Txt>
      </View>
      <View style={{ flex: 1 }}>
        <Txt v="h3" numberOfLines={1}>{e.title}</Txt>
        <Txt v="small" numberOfLines={1}>{spotById(e.pickupSpotId).name} · ~{e.estMin} min</Txt>
        <Txt v="small" color={colors.ink}>Fee {naira(errandFee(e.estMin))}{e.budget ? ` · budget ${naira(e.budget)}` : ''}</Txt>
      </View>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8}><Icon name="trash" color={colors.muted} size={20} /></Pressable>
      )}
    </Row>
  );
}

export function CartScreen() {
  const { pop, push, reset } = useNav();
  const { cart, cartErrands, setQty, removeCartErrand } = useApp();
  const empty = !cart.length && !cartErrands.length;
  const { bill, quote } = priceOrder(cart, cartErrands);
  return (
    <View style={{ flex: 1 }}>
      <Header title="Your cart" onBack={pop} />
      {empty ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 }}>
          <Txt style={{ fontSize: 64 }}>🧺</Txt>
          <Txt v="h2">Your cart is empty</Txt>
          <Button title="Start shopping" onPress={() => reset({ name: 'tabs', tab: 'shop' })} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 130 }}>
            {cart.length > 0 && (
              <Card style={{ gap: 4 }}>
                {cart.map((l) => {
                  const p = productById(l.productId);
                  return (
                    <Row key={l.productId} style={{ gap: 12, paddingVertical: 6 }}>
                      <View style={{ width: 56 }}><ProductTile emoji={p.emoji} imageUrl={p.imageUrl} h={56} size={28} /></View>
                      <View style={{ flex: 1 }}>
                        <Txt v="h3" numberOfLines={1}>{p.name}</Txt>
                        <Txt v="small">{p.unit}</Txt>
                        <Txt weight="semibold">{naira(p.price * l.qty)}</Txt>
                      </View>
                      <Stepper small qty={l.qty} onChange={(q) => setQty(l.productId, q)} />
                    </Row>
                  );
                })}
              </Card>
            )}
            <Card tint style={{ gap: 6 }}>
              <Row style={{ gap: 8 }}>
                <Icon name="bike" color={colors.primary} />
                <Txt v="h3" style={{ flex: 1 }}>Add an errand to this delivery</Txt>
              </Row>
              <Txt v="small">The same rider can collect laundry, drop a parcel or buy something we don't stock on the way.</Txt>
              {cartErrands.map((e) => <ErrandLine key={e.id} e={e} onRemove={() => removeCartErrand(e.id)} />)}
              <Button title="Add errand" kind="ghost" icon="plus" onPress={() => push({ name: 'errandForm', attach: true })} style={{ height: 44, alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.bg }} />
            </Card>
            <BillCard bill={bill} surge={quote.surge} />
            {quote.needsVanQuote && (
              <Card style={{ backgroundColor: '#FFF4DD' }}>
                <Txt v="small" color={colors.ink}>One or more items are too large for a motorbike. You can still order; we will confirm a car/van fee by phone before dispatch.</Txt>
              </Card>
            )}
          </ScrollView>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line }}>
            <Button title={`Checkout · ${naira(bill.total)}`} onPress={() => push({ name: 'checkout' })} />
          </View>
        </>
      )}
    </View>
  );
}

const PAY: { id: PaymentMethod; label: string; sub: string; icon: IconName }[] = [
  { id: 'card', label: 'Card', sub: 'Visa, Mastercard, Verve', icon: 'card' },
  { id: 'transfer', label: 'Bank transfer', sub: 'Pay into a one-time account', icon: 'bank' },
  { id: 'pod', label: 'Pay on delivery', sub: 'Cash or transfer to the rider', icon: 'cash' },
];

/** Checkout for the cart, or for a standalone errand when `errand` is given. */
export function CheckoutScreen({ errand }: { errand?: Errand }) {
  const { pop, reset, push } = useNav();
  const { cart, cartErrands, address, addOrder, clearCart } = useApp();
  const lines = errand ? [] : cart;
  const errands = errand ? [errand] : cartErrands;
  const { bill, quote, etaMin } = priceOrder(lines, errands);
  const [pay, setPay] = useState<PaymentMethod>('card');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!address) return;
    setBusy(true);
    setErr('');
    let placed;
    try {
      placed = await backend.placeOrder({ lines, errands, address, payment: pay });
    } catch (e: any) {
      setBusy(false);
      return setErr(e?.message ?? 'Could not place the order. Try again.');
    }
    addOrder(placed);
    if (!errand) clearCart();
    setBusy(false);
    reset({ name: 'tabs', tab: 'orders' });
    push({ name: 'tracking', id: placed.id });
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title="Checkout" onBack={pop} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 130 }}>
        <Card onPress={() => push({ name: 'address' })} style={{ gap: 6 }}>
          <Row style={{ gap: 8 }}>
            <Icon name="pin" color={colors.primary} />
            <Txt v="h3" style={{ flex: 1 }}>Deliver to {address?.label}</Txt>
            <Txt weight="semibold" color={colors.primary}>Change</Txt>
          </Row>
          <Txt color={colors.muted}>{address?.houseNo} {address?.street}, {address?.estate}</Txt>
          {address?.gateName || address?.gateCode ? (
            <Row style={{ gap: 8, marginTop: 4 }}>
              <Icon name="key" color={colors.muted} size={18} />
              <Txt v="small" style={{ flex: 1 }}>{[address.gateName, address.gateCode && `code ${address.gateCode}`].filter(Boolean).join(' · ')}</Txt>
            </Row>
          ) : (
            <Txt v="small" color={colors.danger}>No gate details yet. Add them so the rider isn't stopped at the gate.</Txt>
          )}
        </Card>

        <Card style={{ gap: 4 }}>
          <Row style={{ gap: 8 }}>
            <Icon name="clock" color={colors.primary} />
            <Txt v="h3">Arrives in about {etaMin} min</Txt>
          </Row>
          <Txt v="small">{quote.vehicle === 'bicycle' ? 'Bicycle rider' : 'Motorbike rider'} · {lines.length ? `${lines.reduce((s, l) => s + l.qty, 0)} item${lines.reduce((s, l) => s + l.qty, 0) === 1 ? '' : 's'}` : ''}{lines.length && errands.length ? ' + ' : ''}{errands.length ? `${errands.length} errand${errands.length > 1 ? 's' : ''}` : ''}</Txt>
          {errands.map((e) => <ErrandLine key={e.id} e={e} />)}
        </Card>

        <View style={{ gap: 10 }}>
          <Txt v="h3">Payment</Txt>
          {PAY.map((m) => (
            <Pressable key={m.id} onPress={() => setPay(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.small + 4, backgroundColor: pay === m.id ? colors.tint : colors.surface, borderWidth: 2, borderColor: pay === m.id ? colors.primary : 'transparent' }}>
              <Icon name={m.icon} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Txt v="h3">{m.label}</Txt>
                <Txt v="small">{m.sub}</Txt>
              </View>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: pay === m.id ? colors.primary : colors.line, alignItems: 'center', justifyContent: 'center' }}>
                {pay === m.id && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary }} />}
              </View>
            </Pressable>
          ))}
        </View>

        <BillCard bill={bill} surge={quote.surge} />
        <Row style={{ gap: 8, paddingHorizontal: 4 }}>
          <Icon name="shield" color={colors.primary} size={18} />
          <Txt v="small" style={{ flex: 1 }}>Every Arodan rider is ID-checked, has a guarantor and a verified home address.</Txt>
        </Row>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line }}>
        {err ? <Txt v="small" color={colors.danger} style={{ marginBottom: 8 }}>{err}</Txt> : null}
        <Button title={`${pay === 'pod' ? 'Place order' : 'Pay'} · ${naira(bill.total)}`} onPress={submit} loading={busy} disabled={!address} />
      </View>
    </View>
  );
}
