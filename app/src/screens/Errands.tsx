import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Field, Header, Row, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { ErrandTypeId, errandTypes } from '../data/catalog';
import { spots } from '../data/places';
import { naira } from '../lib/format';
import { errandFee, PRICING } from '../lib/pricing';
import { useNav } from '../nav';
import { useApp } from '../store/AppContext';
import { priceOrder } from '../store/checkout';
import { colors, radius } from '../theme';
import type { Errand } from '../api/types';

export function ErrandsTab() {
  const { push } = useNav();
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 170, gap: 16 }}>
      <Txt v="h1">Errands</Txt>
      <Txt color={colors.muted}>Tell us what you need. A vetted rider runs it and brings it to your gate.</Txt>
      <View style={{ gap: 12 }}>
        {errandTypes.map((t) => (
          <Card key={t.id} onPress={() => push({ name: 'errandForm', type: t.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
              <Txt style={{ fontSize: 30 }}>{t.emoji}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="h3">{t.name}</Txt>
              <Txt v="small">{t.hint}</Txt>
            </View>
            <Icon name="chevron" color={colors.muted} size={18} />
          </Card>
        ))}
      </View>
      <Card tint style={{ gap: 6 }}>
        <Txt v="h3">How errand pricing works</Txt>
        <Txt v="small" color={colors.ink}>
          Errand fee {naira(PRICING.errand.firstBlockFee)} covers the first {PRICING.errand.firstBlockMin} minutes, then {naira(PRICING.errand.perExtraMin)} per extra minute. A {PRICING.serviceChargeRate * 100}% service charge applies to the errand fee and anything the rider buys for you. Delivery is priced by distance, like any order.
        </Txt>
      </Card>
    </ScrollView>
  );
}

const MINUTES = [15, 30, 45, 60, 90];

export function ErrandFormScreen({ type: initialType, attach }: { type?: ErrandTypeId; attach?: boolean }) {
  const { pop, push } = useNav();
  const { addCartErrand } = useApp();
  const [type, setType] = useState<ErrandTypeId>(initialType ?? 'buy');
  const t = errandTypes.find((x) => x.id === type)!;
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [spot, setSpot] = useState(spots[0].id);
  const [estMin, setEstMin] = useState<number>(t.defaultMin);
  const [budget, setBudget] = useState('');

  const errand: Errand = {
    id: 'e' + Date.now(),
    type,
    title: title.trim() || t.name,
    details: details.trim(),
    pickupSpotId: spot,
    estMin,
    budget: t.needsBudget ? Number(budget.replace(/\D/g, '')) || 0 : 0,
  };
  const preview = priceOrder([], [errand]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={attach ? 'Add an errand' : 'New errand'} onBack={pop} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Txt v="label" style={{ marginBottom: 8 }}>Type</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 18 }}>
          {errandTypes.map((x) => (
            <Pressable key={x.id} onPress={() => { setType(x.id); setEstMin(x.defaultMin); }} style={{ paddingHorizontal: 14, height: 42, borderRadius: radius.pill, backgroundColor: type === x.id ? colors.primary : colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Txt>{x.emoji}</Txt>
              <Txt weight="medium" color={type === x.id ? colors.onPrimary : colors.ink}>{x.name}</Txt>
            </Pressable>
          ))}
        </ScrollView>

        <Field label="What should the rider do?" value={title} onChangeText={setTitle} placeholder={type === 'buy' ? 'e.g. Buy 2 paint buckets of garri' : type === 'pickup' ? 'e.g. Collect parcel from my sister' : type === 'laundry' ? 'e.g. Collect 5 shirts from the dry cleaner' : 'e.g. Pay LAWMA bill at the office'} />
        <Field label="Details (optional)" value={details} onChangeText={setDetails} placeholder="Brand, size, contact person, receipt number…" multiline />

        <Txt v="label" style={{ marginBottom: 8 }}>Where</Txt>
        <View style={{ gap: 8, marginBottom: 18 }}>
          {spots.map((s) => (
            <Pressable key={s.id} onPress={() => setSpot(s.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.small, backgroundColor: spot === s.id ? colors.tint : colors.surface, borderWidth: 2, borderColor: spot === s.id ? colors.primary : 'transparent' }}>
              <Icon name="pin" color={spot === s.id ? colors.primary : colors.muted} size={20} />
              <Txt style={{ flex: 1 }}>{s.name}</Txt>
              <Txt v="small">{s.distanceKm} km</Txt>
            </Pressable>
          ))}
        </View>

        <Txt v="label" style={{ marginBottom: 8 }}>How long will it take there?</Txt>
        <Row style={{ gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {MINUTES.map((m) => (
            <Pressable key={m} onPress={() => setEstMin(m)} style={{ paddingHorizontal: 16, height: 40, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: estMin === m ? colors.primary : colors.surface }}>
              <Txt weight="medium" color={estMin === m ? colors.onPrimary : colors.ink}>{m} min</Txt>
            </Pressable>
          ))}
        </Row>

        {t.needsBudget && (
          <Field label="Budget for items (₦)" value={budget} onChangeText={setBudget} keyboardType="number-pad" placeholder="e.g. 8000" hint="The rider shows you the receipt. Any change is refunded to you." />
        )}

        <Card tint style={{ gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt>Errand fee</Txt>
            <Txt weight="semibold">{naira(errandFee(estMin))}</Txt>
          </Row>
          {!attach && (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt>Delivery</Txt>
                <Txt weight="semibold">{naira(preview.quote.total)}</Txt>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt>Estimated total</Txt>
                <Txt weight="bold">{naira(preview.bill.total)}</Txt>
              </Row>
            </>
          )}
          {attach && <Txt v="small">Added to your shop delivery as an extra stop ({naira(PRICING.extraStop)}).</Txt>}
        </Card>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 28, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Button
          title={attach ? 'Add to cart' : 'Continue to checkout'}
          disabled={!title.trim() || (t.needsBudget && !errand.budget)}
          onPress={() => {
            if (attach) {
              addCartErrand(errand);
              pop();
            } else push({ name: 'checkout', errand });
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
