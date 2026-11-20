import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Chip, ErrorText, Field, Header, Row, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, font, radius } from '../theme';
import { useNav } from '../nav';
import { useApp } from '../store/AppContext';
import { backend } from '../api';
import type { MerchantInput } from '../api/types';

export const Wrap = ({ children }: { children: React.ReactNode }) => (
  <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  </KeyboardAvoidingView>
);

export function Welcome() {
  const { push } = useNav();
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
      <Row style={{ gap: 10, marginTop: 24 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="h2" color={colors.onPrimary}>A</Txt>
        </View>
        <View>
          <Txt v="h2">Arodan</Txt>
          <Txt v="small" weight="semibold" color={colors.primary}>for Merchants</Txt>
        </View>
      </Row>
      <View style={{ gap: 18 }}>
        <Card tint style={{ padding: 24, gap: 14 }}>
          <Txt style={{ fontSize: 52, lineHeight: 64 }}>🛍️</Txt>
          <Txt v="h1">Sell to homes in Magodo, delivered by Arodan riders.</Txt>
          <Txt color={colors.muted}>List your products with photos, prices and stock. Get orders on your phone, pack them, and a vetted rider collects from your shop.</Txt>
        </Card>
        <Row style={{ gap: 10 }}>
          {['No delivery to arrange', 'Live stock control', 'Daily sales summary'].map((x) => (
            <View key={x} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.small, padding: 12, gap: 6 }}>
              <Icon name="check" size={18} color={colors.primary} />
              <Txt v="small" color={colors.ink}>{x}</Txt>
            </View>
          ))}
        </Row>
      </View>
      <View style={{ gap: 10 }}>
        <Button title="Sign in or register your shop" onPress={() => push({ name: 'phone' })} />
        <Txt v="small" style={{ textAlign: 'center' }}>{backend.mode === 'mock' ? 'Demo mode · pretend orders, nothing is saved' : 'Use the number your shop will answer'}</Txt>
      </View>
    </View>
  );
}

export function PhoneScreen() {
  const { push, pop } = useNav();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    const clean = phone.replace(/\D/g, '');
    if (!/^(0|234)?[789][01]\d{8}$/.test(clean)) return setErr('Enter a valid Nigerian mobile number, e.g. 0803 123 4567');
    setBusy(true);
    setErr('');
    const r = await backend.sendOtp(clean);
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? 'Could not send the code. Try again.');
    push({ name: 'otp', phone: clean });
  };
  return (
    <>
      <Header onBack={pop} />
      <Wrap>
        <Txt v="h1" style={{ marginBottom: 8 }}>Your phone number</Txt>
        <Txt color={colors.muted} style={{ marginBottom: 24 }}>We'll text you a sign-in code. Arodan staff and riders use this number to reach the shop.</Txt>
        <Row style={{ gap: 10 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.small, height: 56, paddingHorizontal: 14, justifyContent: 'center' }}>
            <Txt v="h3">🇳🇬 +234</Txt>
          </View>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0803 123 4567" placeholderTextColor="#94A39B" autoFocus
            style={{ flex: 1, height: 56, backgroundColor: colors.surface, borderRadius: radius.small, paddingHorizontal: 16, fontFamily: font.semibold, fontSize: 17, color: colors.ink }} />
        </Row>
        <ErrorText text={err} />
        <View style={{ flex: 1 }} />
        <Button title="Send code" onPress={go} loading={busy} disabled={phone.replace(/\D/g, '').length < 10} style={{ marginTop: 24 }} />
      </Wrap>
    </>
  );
}

export function OtpScreen({ phone }: { phone: string }) {
  const { pop, reset } = useNav();
  const { setSession } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const len = backend.otpLength;
  const go = async (c = code) => {
    setBusy(true);
    const r = await backend.verifyOtp(phone, c);
    if (!r.ok) {
      setBusy(false);
      return setErr(r.error ?? 'That code is not right. Try again.');
    }
    const s = await backend.restoreSession().catch(() => null);
    setBusy(false);
    setSession(s?.owner ?? { phone, name: '' }, s?.merchant ?? null);
    reset(s?.merchant ? { name: 'tabs', tab: 'orders' } : { name: 'register' });
  };
  return (
    <>
      <Header onBack={pop} />
      <Wrap>
        <Txt v="h1" style={{ marginBottom: 8 }}>Enter the {len}-digit code</Txt>
        <Txt color={colors.muted} style={{ marginBottom: 24 }}>Sent to {phone}.{backend.demoOtp ? ` Demo code: ${backend.demoOtp}` : ''}</Txt>
        <View>
          <Row style={{ gap: len > 4 ? 8 : 12 }}>
            {Array.from({ length: len }, (_, i) => i).map((i) => (
              <View key={i} style={{ flex: 1, height: 64, borderRadius: radius.small, backgroundColor: colors.surface, borderWidth: 2, borderColor: code.length === i ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Txt v="h1">{code[i] ?? ''}</Txt>
              </View>
            ))}
          </Row>
          <TextInput value={code} keyboardType="number-pad" autoFocus maxLength={len}
            onChangeText={(v) => {
              const c = v.replace(/\D/g, '').slice(0, len);
              setCode(c);
              setErr('');
              if (c.length === len) go(c);
            }}
            style={{ position: 'absolute', inset: 0, opacity: 0.02, color: 'transparent' } as any} />
        </View>
        <ErrorText text={err} />
        <View style={{ flex: 1 }} />
        <Button title="Continue" onPress={() => go()} loading={busy} disabled={code.length !== len} style={{ marginTop: 24 }} />
      </Wrap>
    </>
  );
}

/** Sign-up form, also used to edit the shop's details later. */
export function ShopForm({ edit }: { edit?: boolean }) {
  const { pop, reset } = useNav();
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
      <Header title={edit ? 'Shop details' : undefined} onBack={edit ? pop : undefined} />
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
