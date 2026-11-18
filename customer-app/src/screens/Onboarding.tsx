import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Field, Header, Row, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, font, radius } from '../theme';
import { useNav } from '../nav';
import { useApp } from '../store/AppContext';
import { DEMO_OTP, saveProfile, sendOtp, verifyOtp } from '../api/mock';
import type { Address } from '../api/types';

const Wrap = ({ children }: { children: React.ReactNode }) => (
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
      <View style={{ marginTop: 24 }}>
        <Row style={{ gap: 10 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="h2" color={colors.onPrimary}>A</Txt>
          </View>
          <Txt v="h2">Arodan</Txt>
        </Row>
      </View>
      <View style={{ gap: 18 }}>
        <Card tint style={{ padding: 24, gap: 14 }}>
          <Txt style={{ fontSize: 56 }}>🛵</Txt>
          <Txt v="h1">Shop, send and run errands without leaving your gate.</Txt>
          <Txt color={colors.muted}>Groceries, household items and gadgets from vetted merchants, plus riders who can pick up, drop off and queue for you.</Txt>
        </Card>
        <Row style={{ gap: 10 }}>
          {['Vetted riders', 'Gate-code delivery', 'Pay on delivery'].map((x) => (
            <View key={x} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.small, padding: 12, gap: 6 }}>
              <Icon name="check" size={18} color={colors.primary} />
              <Txt v="small" color={colors.ink}>{x}</Txt>
            </View>
          ))}
        </Row>
      </View>
      <View style={{ gap: 10 }}>
        <Button title="Get started" onPress={() => push({ name: 'phone' })} />
        <Txt v="small" style={{ textAlign: 'center' }}>Now serving Magodo Phase 2, Lagos</Txt>
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
    setBusy(true);
    setErr('');
    const clean = phone.replace(/\s/g, '');
    const r = await sendOtp(clean);
    setBusy(false);
    if (!r.ok) return setErr('Enter a valid Nigerian mobile number, e.g. 0803 123 4567');
    push({ name: 'otp', phone: clean });
  };
  return (
    <>
      <Header onBack={pop} />
      <Wrap>
        <Txt v="h1" style={{ marginBottom: 8 }}>What's your phone number?</Txt>
        <Txt color={colors.muted} style={{ marginBottom: 24 }}>We'll text you a code. Riders also use this number to reach you at the gate.</Txt>
        <Row style={{ gap: 10 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.small, height: 56, paddingHorizontal: 14, justifyContent: 'center' }}>
            <Txt v="h3">🇳🇬 +234</Txt>
          </View>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="0803 123 4567"
            placeholderTextColor="#94A39B"
            autoFocus
            style={{ flex: 1, height: 56, backgroundColor: colors.surface, borderRadius: radius.small, paddingHorizontal: 16, fontFamily: font.semibold, fontSize: 17, color: colors.ink }}
          />
        </Row>
        {err ? <Txt v="small" color={colors.danger} style={{ marginTop: 8 }}>{err}</Txt> : null}
        <View style={{ flex: 1 }} />
        <Button title="Send code" onPress={go} loading={busy} disabled={phone.replace(/\D/g, '').length < 10} style={{ marginTop: 24 }} />
      </Wrap>
    </>
  );
}

export function OtpScreen({ phone }: { phone: string }) {
  const { push, pop } = useNav();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (c = code) => {
    setBusy(true);
    const r = await verifyOtp(phone, c);
    setBusy(false);
    if (!r.ok) return setErr('That code is not right. Try again.');
    push({ name: 'profile', phone });
  };
  return (
    <>
      <Header onBack={pop} />
      <Wrap>
        <Txt v="h1" style={{ marginBottom: 8 }}>Enter the 4-digit code</Txt>
        <Txt color={colors.muted} style={{ marginBottom: 24 }}>Sent to {phone}. Demo code: {DEMO_OTP}</Txt>
        <View>
          <Row style={{ gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flex: 1, height: 64, borderRadius: radius.small, backgroundColor: colors.surface, borderWidth: 2, borderColor: code.length === i ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Txt v="h1">{code[i] ?? ''}</Txt>
              </View>
            ))}
          </Row>
          <TextInput
            value={code}
            onChangeText={(v) => {
              const c = v.replace(/\D/g, '').slice(0, 4);
              setCode(c);
              setErr('');
              if (c.length === 4) go(c);
            }}
            keyboardType="number-pad"
            autoFocus
            maxLength={4}
            style={{ position: 'absolute', inset: 0, opacity: 0.02, color: 'transparent' } as any}
          />
        </View>
        {err ? <Txt v="small" color={colors.danger} style={{ marginTop: 10 }}>{err}</Txt> : null}
        <View style={{ flex: 1 }} />
        <Button title="Verify" onPress={() => go()} loading={busy} disabled={code.length < 4} style={{ marginTop: 24 }} />
      </Wrap>
    </>
  );
}

export function ProfileScreen({ phone }: { phone: string }) {
  const { push, pop } = useNav();
  const { setUser } = useApp();
  const [name, setName] = useState('');
  return (
    <>
      <Header onBack={pop} />
      <Wrap>
        <Txt v="h1" style={{ marginBottom: 8 }}>What should we call you?</Txt>
        <Txt color={colors.muted} style={{ marginBottom: 24 }}>Your rider will see this name.</Txt>
        <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Rotimi Bello" autoFocus />
        <View style={{ flex: 1 }} />
        <Button
          title="Continue"
          disabled={name.trim().length < 2}
          onPress={() => {
            setUser({ phone, name: name.trim() });
            push({ name: 'address', onboarding: true });
          }}
        />
      </Wrap>
    </>
  );
}

const ESTATES = ['Magodo Phase 2', 'Magodo Phase 1 (Isheri)', 'Shangisha'];

export function AddressScreen({ onboarding }: { onboarding?: boolean }) {
  const { reset, pop } = useNav();
  const { address, setAddress, user } = useApp();
  const [a, setA] = useState<Address>(
    address ?? { label: 'Home', estate: ESTATES[0], street: '', houseNo: '', landmark: '', gateName: '', gateCode: '', gateNote: '' },
  );
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Address) => (v: string) => setA((x) => ({ ...x, [k]: v }));
  const valid = a.street.trim() && a.houseNo.trim();
  return (
    <>
      <Header title={onboarding ? undefined : 'Address & gate'} onBack={pop} />
      <Wrap>
        {onboarding && (
          <>
            <Txt v="h1" style={{ marginBottom: 8 }}>Where should we deliver?</Txt>
            <Txt color={colors.muted} style={{ marginBottom: 20 }}>Gate details help riders get past estate security without calling you.</Txt>
          </>
        )}
        <Txt v="label" style={{ marginBottom: 8 }}>Estate / area</Txt>
        <Row style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {ESTATES.map((e) => (
            <Button key={e} title={e} kind={a.estate === e ? 'primary' : 'soft'} onPress={() => set('estate')(e)} style={{ height: 40, paddingHorizontal: 14 }} />
          ))}
        </Row>
        <Row style={{ gap: 10 }}>
          <View style={{ flex: 2 }}><Field label="Street" value={a.street} onChangeText={set('street')} placeholder="e.g. Oluwole Oke St" /></View>
          <View style={{ flex: 1 }}><Field label="House no." value={a.houseNo} onChangeText={set('houseNo')} placeholder="14B" /></View>
        </Row>
        <Field label="Landmark" value={a.landmark} onChangeText={set('landmark')} placeholder="e.g. Opposite the blue church" />

        <Card tint style={{ marginTop: 6, marginBottom: 16, gap: 4 }}>
          <Row style={{ gap: 8, marginBottom: 6 }}>
            <Icon name="key" color={colors.primary} />
            <Txt v="h3">Gate access</Txt>
          </Row>
          <Txt v="small" style={{ marginBottom: 10 }}>Shared only with the rider on your order, and hidden once it's delivered.</Txt>
          <Field label="Gate to use" value={a.gateName} onChangeText={set('gateName')} placeholder="e.g. CMD Road gate" style={{ backgroundColor: colors.bg }} />
          <Field label="Visitor / gate code (optional)" value={a.gateCode} onChangeText={set('gateCode')} placeholder="e.g. 4821" keyboardType="number-pad" style={{ backgroundColor: colors.bg }} />
          <Field label="Note for security / rider" value={a.gateNote} onChangeText={set('gateNote')} placeholder="e.g. Tell the guard you're going to 14B, Mrs Bello" multiline style={{ backgroundColor: colors.bg }} />
        </Card>
        <Button
          title={onboarding ? 'Save and start shopping' : 'Save address'}
          disabled={!valid}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await saveProfile(user!, a);
            setAddress(a);
            setBusy(false);
            if (onboarding) reset({ name: 'tabs', tab: 'home' });
            else pop();
          }}
        />
      </Wrap>
    </>
  );
}
