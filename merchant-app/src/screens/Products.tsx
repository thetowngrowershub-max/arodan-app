import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Chip, Empty, ErrorText, Field, Header, IconButton, Pill, Row, Thumb, ToggleRow, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, font, radius } from '../theme';
import { useNav } from '../nav';
import { useApp } from '../store/AppContext';
import { backend } from '../api';
import { naira } from '../lib/format';
import { pickPhoto } from '../lib/photo';
import type { Listing, ListingInput } from '../api/types';

export const LOW_STOCK = 5;

type Filter = 'all' | 'low' | 'out' | 'hidden';

function stockPill(l: Listing) {
  if (!l.active) return <Pill label="Hidden" />;
  if (l.stock === null) return <Pill label="In stock" tone="tint" />;
  if (l.stock === 0) return <Pill label="Sold out" tone="danger" />;
  if (l.stock <= LOW_STOCK) return <Pill label={`${l.stock} left`} tone="accent" />;
  return <Pill label={`${l.stock} in stock`} tone="tint" />;
}

export function ProductsTab() {
  const { push } = useNav();
  const { listings, refreshListings, categories } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const counts = useMemo(() => ({
    low: listings.filter((l) => l.active && l.stock !== null && l.stock > 0 && l.stock <= LOW_STOCK).length,
    out: listings.filter((l) => l.active && l.stock === 0).length,
    hidden: listings.filter((l) => !l.active).length,
  }), [listings]);
  const shown = listings.filter((l) => {
    if (q && !l.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'low') return l.active && l.stock !== null && l.stock > 0 && l.stock <= LOW_STOCK;
    if (filter === 'out') return l.active && l.stock === 0;
    if (filter === 'hidden') return !l.active;
    return true;
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 170, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={async () => { setRefreshing(true); await refreshListings().catch(() => {}); setRefreshing(false); }} />}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Txt v="h1">Products</Txt>
            <Txt v="small">{listings.filter((l) => l.active).length} showing to customers</Txt>
          </View>
          <IconButton name="plus" bg={colors.tint} onPress={() => push({ name: 'listing' })} />
        </Row>
        {listings.length > 0 && (
          <>
            <Row style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 16, height: 48, gap: 10 }}>
              <Icon name="search" color={colors.muted} size={20} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search your products" placeholderTextColor="#94A39B"
                style={{ flex: 1, fontFamily: font.regular, fontSize: 14.5, color: colors.ink }} />
            </Row>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label={`Low stock${counts.low ? ` · ${counts.low}` : ''}`} active={filter === 'low'} onPress={() => setFilter('low')} />
              <Chip label={`Sold out${counts.out ? ` · ${counts.out}` : ''}`} active={filter === 'out'} onPress={() => setFilter('out')} />
              <Chip label={`Hidden${counts.hidden ? ` · ${counts.hidden}` : ''}`} active={filter === 'hidden'} onPress={() => setFilter('hidden')} />
            </ScrollView>
          </>
        )}
        {listings.length === 0 ? (
          <Empty emoji="🧺" title="Add your first product" text="Take a clear photo, set the price and how many you have. Customers see it as soon as your shop is approved.">
            <Button title="Add product" icon="plus" onPress={() => push({ name: 'listing' })} style={{ marginTop: 10, alignSelf: 'stretch' }} />
          </Empty>
        ) : shown.length === 0 ? (
          <Empty emoji="🔎" title="Nothing matches" />
        ) : (
          <View style={{ gap: 10 }}>
            {shown.map((l) => (
              <Card key={l.id} onPress={() => push({ name: 'listing', id: l.id })} style={{ padding: 12, opacity: l.active ? 1 : 0.7 }}>
                <Row style={{ gap: 12 }}>
                  <Thumb uri={backend.imageSrc(l.imageUrl)} emoji={l.emoji} size={64} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt v="h3" numberOfLines={1}>{l.name}</Txt>
                    <Txt v="small" numberOfLines={1}>{[l.unit, catName(l.category)].filter(Boolean).join(' · ')}</Txt>
                    <Row style={{ gap: 8, marginTop: 4 }}>
                      <Txt weight="bold">{naira(l.price)}</Txt>
                      {stockPill(l)}
                    </Row>
                  </View>
                  <Icon name="chevron" color={colors.muted} size={18} />
                </Row>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
      {listings.length > 0 && (
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: 96 }}>
          <Button title="Add product" icon="plus" onPress={() => push({ name: 'listing' })} />
        </View>
      )}
    </View>
  );
}

const EMOJIS = ['📦', '🍚', '🥚', '🍅', '🍞', '🫙', '🧴', '🧻', '🧺', '🥤', '💧', '🧃', '📺', '🌀', '🔌', '🔋', '🎧', '⌚', '📱', '🍼', '🧷'];

type Form = { name: string; category: string; price: string; unit: string; tracked: boolean; stock: string; weightKg: string; longestSideCm: string; description: string; emoji: string; imageUrl: string | null; active: boolean };

const toForm = (l?: Listing, firstCat = ''): Form => ({
  name: l?.name ?? '', category: l?.category ?? firstCat, price: l ? String(l.price) : '', unit: l?.unit ?? '',
  tracked: l ? l.stock !== null : true, stock: l?.stock != null ? String(l.stock) : '', weightKg: l ? String(l.weightKg) : '1',
  longestSideCm: l?.longestSideCm ? String(l.longestSideCm) : '', description: l?.description ?? '', emoji: l?.emoji ?? '📦',
  imageUrl: l?.imageUrl ?? null, active: l?.active ?? true,
});

export function ListingScreen({ id }: { id?: string }) {
  const { pop } = useNav();
  const { listings, categories, merchant, saveListing } = useApp();
  const existing = id ? listings.find((l) => l.id === id) : undefined;
  const [f, setF] = useState<Form>(() => toForm(existing, merchant?.categories[0] ?? categories[0]?.id));
  const [preview, setPreview] = useState<string | undefined>(backend.imageSrc(existing?.imageUrl ?? null));
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const stockN = parseInt(f.stock || '0', 10) || 0;

  const photo = async (source: 'camera' | 'library') => {
    setErr('');
    try {
      const p = await pickPhoto(source);
      if (!p) return;
      setPreview(p.uri);
      setUploading(true);
      const url = await backend.uploadImage(p.base64);
      set('imageUrl')(url);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not add the photo');
      setPreview(backend.imageSrc(f.imageUrl));
    } finally {
      setUploading(false);
    }
  };

  const problem =
    f.name.trim().length < 2 ? 'Enter the product name'
    : !f.category ? 'Choose a category'
    : !/^\d+$/.test(f.price) || Number(f.price) < 1 ? 'Enter the price in Naira, e.g. 4500'
    : f.tracked && !/^\d+$/.test(f.stock) ? 'Enter how many you have (0 if sold out)'
    : !(Number(f.weightKg) > 0) ? 'Enter the weight in kg (riders need it)'
    : f.longestSideCm && !/^\d+$/.test(f.longestSideCm) ? 'Longest side in whole cm, or leave it empty'
    : '';

  const save = async () => {
    if (problem) return setErr(problem);
    setBusy(true);
    setErr('');
    const input: ListingInput = {
      name: f.name.trim(), category: f.category, price: Number(f.price), unit: f.unit.trim(), stock: f.tracked ? Number(f.stock) : null,
      weightKg: Number(f.weightKg), longestSideCm: f.longestSideCm ? Number(f.longestSideCm) : null, description: f.description.trim(),
      emoji: f.emoji, imageUrl: f.imageUrl, active: f.active,
    };
    try {
      await saveListing(id, input);
      pop();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title={existing ? 'Edit product' : 'New product'} onBack={pop} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 6, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 12 }}>
          <Thumb uri={preview} emoji={f.emoji} h={220} size={110} />
          {uploading && (
            <View style={{ position: 'absolute', bottom: 12, left: 12 }}><Pill label="Uploading photo…" tone="accent" /></View>
          )}
        </View>
        <Row style={{ gap: 10, marginBottom: 6 }}>
          <Button title="Take photo" icon="camera" kind="soft" onPress={() => photo('camera')} style={{ flex: 1, height: 46 }} />
          <Button title="Gallery" icon="image" kind="soft" onPress={() => photo('library')} style={{ flex: 1, height: 46 }} />
        </Row>
        <Txt v="small" style={{ marginBottom: 16 }}>Tip: a clear photo on a plain background sells best. Without a photo, customers see the icon below.</Txt>
        {!f.imageUrl && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 16 }}>
            {EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => set('emoji')(e)} style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: f.emoji === e ? colors.tint : colors.surface, borderWidth: 2, borderColor: f.emoji === e ? colors.primary : 'transparent' }}>
                <Txt style={{ fontSize: 20 }}>{e}</Txt>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {f.imageUrl && <Button title="Remove photo" kind="ghost" icon="trash" onPress={() => { set('imageUrl')(null); setPreview(undefined); }} style={{ height: 42, marginBottom: 16 }} />}

        <Field label="Product name" value={f.name} onChangeText={set('name')} placeholder="e.g. Ofada rice" />
        <Txt v="label" style={{ marginBottom: 8 }}>Category</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {categories.map((c) => <Chip key={c.id} label={c.name} emoji={c.emoji} active={f.category === c.id} onPress={() => set('category')(c.id)} />)}
        </View>
        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}><Field label="Price (₦)" value={f.price} onChangeText={(v) => set('price')(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="4500" /></View>
          <View style={{ flex: 1 }}><Field label="Size / pack" value={f.unit} onChangeText={set('unit')} placeholder="5 kg bag" /></View>
        </Row>

        <Card style={{ gap: 8, marginBottom: 14 }}>
          <ToggleRow label="Track stock" hint="We stop selling it when it runs out." value={f.tracked} onChange={set('tracked')} />
          {f.tracked && (
            <Row style={{ gap: 10 }}>
              <IconButton name="minus" bg={colors.bg} onPress={() => set('stock')(String(Math.max(0, stockN - 1)))} />
              <TextInput value={f.stock} onChangeText={(v) => set('stock')(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#94A39B"
                accessibilityLabel="Units in stock"
                style={{ flex: 1, height: 48, borderRadius: radius.small, backgroundColor: colors.bg, textAlign: 'center', fontFamily: font.bold, fontSize: 20, color: colors.ink }} />
              <IconButton name="plus" bg={colors.bg} onPress={() => set('stock')(String(stockN + 1))} />
            </Row>
          )}
        </Card>

        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}><Field label="Weight (kg)" value={f.weightKg} onChangeText={(v) => set('weightKg')(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="1" /></View>
          <View style={{ flex: 1 }}><Field label="Longest side (cm)" value={f.longestSideCm} onChangeText={(v) => set('longestSideCm')(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Only if big" /></View>
        </Row>
        <Txt v="small" style={{ marginTop: -6, marginBottom: 14 }}>Weight and size set the delivery fee. Items over 80 cm need a car or van.</Txt>
        <Field label="Description (optional)" value={f.description} onChangeText={set('description')} multiline placeholder="Brand, what's included, expiry…" />
        <Card style={{ marginBottom: 8 }}>
          <ToggleRow label="Show to customers" hint={f.active ? 'Listed in the Arodan app' : 'Hidden. You can show it again any time.'} value={f.active} onChange={set('active')} />
        </Card>
        <ErrorText text={err} />
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Button title={existing ? 'Save changes' : 'Add product'} onPress={save} loading={busy} disabled={uploading} />
      </View>
    </View>
  );
}
