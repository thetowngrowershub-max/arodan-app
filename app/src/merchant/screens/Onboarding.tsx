import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Chip, ErrorText, Field, Header, Row, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, font, radius } from '../../theme';
import { useNav } from '../nav';
import { useApp } from '../store/AppContext';
import { backend } from '../api';
import { useMode } from '../../roles/ModeContext';
import { useApp as useShopper } from '../../store/AppContext';
import type { MerchantInput } from '../api/types';

export const Wrap = ({ children }: { children: React.ReactNode }) => (
  <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  </KeyboardAvoidingView>
);

export function ShopForm({ edit }: { edit?: boolean }) {
  const { pop, reset } = useNav();
  const { back, refreshRoles } = useMode();
  const { user: shopper, setUser: setShopper } = useShopper();
  const { owner, merchant, areas, categories, setMerchant, setSession } = useApp();
  const m = edit ? merchant : null;
  const [f, setF] = useState<MerchantInput>({
    ownerName: owner?.name ?? '', name: m?.name ?? '', phone: m?.phone ?? owner?.phone ?? '', address: m?.address ?? '',
    areaId: m?.areaId ?? '', categories: m?.categories ?? [], bankName: m?.bankName ?? '', accountNumber: m?.accountNumber ?? '', accountName: m?.accountName ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof MerchantInput) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const toggleCat = (id: string) => setF((x) => ({ ...x, categories: x.categories.includes(id) ? x.categories.filter((c) => c !== id) : [...x.categories, id] }));

  const problem =
    !edit && (f.ownerName ?? '').trim().length < 2 ? 'Enter your name'
    : f.name.trim().length < 2 ? 'Enter your business name'
    : f.phone.replace(/\D/g, '').length < 10 ? 'Enter the shop phone number'
    : !f.areaId ? 'Choose your area'
    : f.address.trim().length < 4 ? 'Enter the shop address'
    : f.accountNumber && f.accountNumber.replace(/\D/g, '').length !== 10 ? 'Account numbers have 10 digits (NUBAN)'
    : '';

  const save = async () => {
    if (problem) return setErr(problem);
    setBusy(true);
    setErr('');
    try {
      if (edit) {
        const { ownerName, ...rest } = f;
        setMerchant(await backend.updateMerchant(rest));
        pop();
      } else {
        const saved = await backend.register(f);
        setSession({ phone: owner?.phone ?? '', name: f.ownerName ?? '' }, saved);
        setShopper({ phone: shopper?.phone ?? owner?.phone ?? '', name: (f.ownerName ?? '').trim() });
        await refreshRoles();
        reset({ name: 'tabs', tab: 'products' });
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title={edit ? 'Shop details' : undefined} onBack={edit ? pop : back} />
      <Wrap>
        {!edit && (
          <>
            <Txt v="h1" style={{ marginBottom: 8 }}>Register your shop</Txt>
            <Txt color={colors.muted} style={{ marginBottom: 20 }}>Arodan checks every merchant before customers can see their products. You can add products while you wait.</Txt>
            <Field label="Your name" value={f.ownerName} onChangeText={set('ownerName')} placeholder="e.g. Bisi Adeyemi" autoComplete="name" />
          </>
        )}
        <Field label="Business name" value={f.name} onChangeText={set('name')} placeholder="e.g. Bisi Provisions" />
        <Field label="Shop phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="0803 123 4567" hint="Riders call this number when they arrive to collect." />
        <Txt v="label" style={{ marginBottom: 8 }}>Area</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {areas.map((a) => <Chip key={a.id} label={a.name} active={f.areaId === a.id} onPress={() => set('areaId')(a.id)} />)}
        </View>
        <Field label="Shop address" value={f.address} onChangeText={set('address')} placeholder="Shop 4, 12 Ikosi Road" hint="Where riders collect orders. Add a landmark if it's hard to find." />
        <Txt v="label" style={{ marginBottom: 8 }}>What do you sell?</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {categories.map((c) => <Chip key={c.id} label={c.name} emoji={c.emoji} active={f.categories.includes(c.id)} onPress={() => toggleCat(c.id)} />)}
        </View>
        <Card tint style={{ gap: 4, marginBottom: 14 }}>
          <Row style={{ gap: 8 }}>
            <Icon name="bank" color={colors.primary} size={20} />
            <Txt v="h3">Where we pay you</Txt>
          </Row>
          <Txt v="small" color={colors.ink}>Arodan pays out your sales to this account. You can add it later.</Txt>
        </Card>
        <Field label="Bank" value={f.bankName} onChangeText={set('bankName')} placeholder="e.g. GTBank" />
        <Field label="Account number" value={f.accountNumber} onChangeText={(v) => set('accountNumber')(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" placeholder="10 digits" />
        <Field label="Account name" value={f.accountName} onChangeText={set('accountName')} placeholder="As shown by your bank" />
        <ErrorText text={err} />
        <Button title={edit ? 'Save changes' : 'Register shop'} onPress={save} loading={busy} style={{ marginTop: 16 }} />
      </Wrap>
    </>
  );
}
