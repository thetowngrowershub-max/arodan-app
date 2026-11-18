import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Chip, Header, IconButton, ProductTile, Row, Stepper, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { categories, CategoryId, merchantById, Product, productById, products } from '../data/catalog';
import { naira } from '../lib/format';
import { useNav } from '../nav';
import { useApp } from '../store/AppContext';
import { priceOrder } from '../store/checkout';
import { colors, font, radius } from '../theme';
import { ORDER_STEPS } from '../api/types';

export function SearchBar({ value, onChange, onFocus }: { value?: string; onChange?: (v: string) => void; onFocus?: () => void }) {
  return (
    <Row style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 16, height: 50, gap: 10 }}>
      <Icon name="search" color={colors.muted} size={20} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        placeholder="Search rice, detergent, earbuds…"
        placeholderTextColor="#94A39B"
        style={{ flex: 1, fontFamily: font.regular, fontSize: 14.5, color: colors.ink }}
      />
    </Row>
  );
}

export function ProductCard({ p }: { p: Product }) {
  const { push } = useNav();
  const { cart, addToCart, setQty } = useApp();
  const qty = cart.find((l) => l.productId === p.id)?.qty ?? 0;
  return (
    <Pressable onPress={() => push({ name: 'product', id: p.id })} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.card, padding: 10, gap: 8 }}>
      <ProductTile emoji={p.emoji} h={128} size={58} />
      <View style={{ paddingHorizontal: 4, gap: 2 }}>
        <Txt v="h3" numberOfLines={1}>{p.name}</Txt>
        <Txt v="small" numberOfLines={1}>{p.unit}</Txt>
      </View>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 2, minHeight: 36 }}>
        <Txt v="h3" weight="bold">{naira(p.price)}</Txt>
        {qty > 0 ? (
          <Stepper qty={qty} onChange={(q) => setQty(p.id, q)} small />
        ) : (
          <Pressable onPress={() => addToCart(p.id)} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" color={colors.onPrimary} size={18} />
          </Pressable>
        )}
      </Row>
    </Pressable>
  );
}

export function Grid({ items }: { items: Product[] }) {
  const rows: Product[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r, i) => (
        <Row key={i} style={{ gap: 12, alignItems: 'stretch' }}>
          {r.map((p) => <ProductCard key={p.id} p={p} />)}
          {r.length === 1 && <View style={{ flex: 1 }} />}
        </Row>
      ))}
    </View>
  );
}

export function CartBar() {
  const { cart, cartErrands } = useApp();
  const { push } = useNav();
  if (!cart.length && !cartErrands.length) return null;
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const items = cart.reduce((s, l) => s + productById(l.productId).price * l.qty, 0);
  return (
    <Pressable onPress={() => push({ name: 'cart' })} style={{ position: 'absolute', left: 16, right: 16, bottom: 92, height: 60, borderRadius: radius.pill, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 }}>
      <Icon name="cart" color={colors.onPrimary} />
      <Txt v="h3" color={colors.onPrimary} style={{ flex: 1 }}>
        {count} item{count === 1 ? '' : 's'}{cartErrands.length ? ` + ${cartErrands.length} errand${cartErrands.length > 1 ? 's' : ''}` : ''}
      </Txt>
      <Txt v="h3" color={colors.onPrimary}>{naira(items)}</Txt>
      <Icon name="chevron" color={colors.onPrimary} size={18} />
    </Pressable>
  );
}

export function HomeTab() {
  const { user, address, orders, cart } = useApp();
  const { push, reset } = useNav();
  const active = orders.find((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const popular = products.filter((p) => p.popular);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 170, gap: 18 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt v="small">Good day, {user?.name.split(' ')[0]}</Txt>
          <Pressable onPress={() => push({ name: 'address' })}>
            <Row style={{ gap: 4 }}>
              <Icon name="pin" size={16} color={colors.primary} />
              <Txt v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                {address ? `${address.houseNo} ${address.street}, ${address.estate}` : 'Set address'}
              </Txt>
            </Row>
          </Pressable>
        </View>
        <IconButton name="cart" badge={cart.reduce((s, l) => s + l.qty, 0)} onPress={() => push({ name: 'cart' })} />
      </Row>
      <Pressable onPress={() => reset({ name: 'tabs', tab: 'shop' })}>
        <View pointerEvents="none"><SearchBar /></View>
      </Pressable>

      {active && (
        <Pressable onPress={() => push({ name: 'tracking', id: active.id })} style={{ backgroundColor: colors.accent, borderRadius: radius.card, padding: 18, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="label" color={colors.onAccent}>Active order · {active.id}</Txt>
            <Icon name="chevron" color={colors.onAccent} size={18} />
          </Row>
          <Txt v="h2" color={colors.onAccent}>{statusText[active.status]}</Txt>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(13,27,21,0.15)', marginTop: 6 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.ink, width: `${((ORDER_STEPS.indexOf(active.status as any) + 1) / ORDER_STEPS.length) * 100}%` }} />
          </View>
        </Pressable>
      )}

      <Card tint style={{ padding: 22, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Txt v="h2">Need something run?</Txt>
          <Txt v="small" color={colors.muted}>Market runs, parcel drop-offs, laundry, bill payments. A vetted rider handles it.</Txt>
          <Button title="Send a rider" kind="primary" icon="bike" onPress={() => push({ name: 'errandForm' })} style={{ alignSelf: 'flex-start', height: 44, marginTop: 8 }} />
        </View>
        <Txt style={{ fontSize: 64 }}>🛵</Txt>
      </Card>

      <View style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h2">Categories</Txt>
          <Pressable onPress={() => reset({ name: 'tabs', tab: 'shop' })}><Txt v="body" weight="semibold" color={colors.primary}>See all</Txt></Pressable>
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {categories.map((c) => (
            <Pressable key={c.id} onPress={() => reset({ name: 'tabs', tab: 'shop', category: c.id })} style={{ alignItems: 'center', gap: 6, width: 76 }}>
              <View style={{ width: 68, height: 68, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Txt style={{ fontSize: 30 }}>{c.emoji}</Txt>
              </View>
              <Txt v="small" color={colors.ink} numberOfLines={1}>{c.name}</Txt>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ gap: 12 }}>
        <Txt v="h2">Popular in Magodo</Txt>
        <Grid items={popular} />
      </View>
    </ScrollView>
  );
}

export const statusText: Record<string, string> = {
  placed: 'Order placed, finding a rider',
  assigned: 'Rider assigned and heading to pickup',
  picked_up: 'Rider has your items',
  on_the_way: 'On the way to you',
  at_gate: 'Rider is at your estate gate',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function ShopTab({ initialCategory }: { initialCategory?: CategoryId }) {
  const [cat, setCat] = useState<CategoryId | 'all'>(initialCategory ?? 'all');
  const [q, setQ] = useState('');
  const list = useMemo(
    () => products.filter((p) => (cat === 'all' || p.category === cat) && p.name.toLowerCase().includes(q.trim().toLowerCase())),
    [cat, q],
  );
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 14 }}>
        <Txt v="h1">Shop</Txt>
        <SearchBar value={q} onChange={setQ} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 14 }}>
        <Chip label="All" active={cat === 'all'} onPress={() => setCat('all')} />
        {categories.map((c) => <Chip key={c.id} label={c.name} emoji={c.emoji} active={cat === c.id} onPress={() => setCat(c.id)} />)}
      </ScrollView>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 170 }}>
        {list.length ? <Grid items={list} /> : <Txt color={colors.muted} style={{ textAlign: 'center', marginTop: 40 }}>No items match "{q}". Try an errand instead: a rider can buy it for you.</Txt>}
      </ScrollView>
    </View>
  );
}

export function ProductScreen({ id }: { id: string }) {
  const { pop, push } = useNav();
  const { addToCart, cart, setQty } = useApp();
  const p = productById(id);
  const m = merchantById(p.merchantId);
  const qty = cart.find((l) => l.productId === id)?.qty ?? 0;
  const est = priceOrder([{ productId: id, qty: 1 }], []).quote;
  return (
    <View style={{ flex: 1 }}>
      <Header onBack={pop} right={<IconButton name="cart" badge={cart.reduce((s, l) => s + l.qty, 0)} onPress={() => push({ name: 'cart' })} />} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
        <ProductTile emoji={p.emoji} h={260} size={130} />
        <View style={{ gap: 4 }}>
          <Txt v="h1">{p.name}</Txt>
          <Txt color={colors.muted}>{p.unit}</Txt>
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h1" color={colors.primary}>{naira(p.price)}</Txt>
          <Row style={{ gap: 4 }}>
            <Icon name="star" size={16} color={colors.accent} fill={colors.accent} />
            <Txt weight="semibold">{p.rating}</Txt>
          </Row>
        </Row>
        <Txt color={colors.muted}>{p.description}</Txt>
        <Card style={{ gap: 10 }}>
          <Row style={{ gap: 10 }}>
            <Icon name="shop" color={colors.primary} size={20} />
            <Txt style={{ flex: 1 }}>Sold by <Txt weight="semibold">{m.name}</Txt>, {m.area}</Txt>
          </Row>
          <Row style={{ gap: 10 }}>
            <Icon name="bike" color={colors.primary} size={20} />
            <Txt style={{ flex: 1 }}>
              {est.needsVanQuote ? 'Too large for a bike. We will call you with a car/van quote.' : `Delivery from about ${naira(est.total)} · ${m.distanceKm} km away`}
            </Txt>
          </Row>
        </Card>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 28, backgroundColor: colors.bg, flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line }}>
        {qty > 0 ? (
          <>
            <Stepper qty={qty} onChange={(q) => setQty(id, q)} />
            <Button title="View cart" onPress={() => push({ name: 'cart' })} style={{ flex: 1 }} />
          </>
        ) : (
          <Button title={`Add to cart · ${naira(p.price)}`} icon="cart" onPress={() => addToCart(id)} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}
