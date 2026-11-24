import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Header, Row, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, font, radius } from '../theme';
import { useNav } from '../nav';
import { useRider } from '../store/RiderContext';
import { backend } from '../api';
import { NotRiderError } from '../api/types';
import { call } from '../lib/maps';

const SUPPORT_PHONE = '0800 000 0000'; // TODO: Arodan rider support line

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  </KeyboardAvoidingView>
);

function Brand() {
  return (
    <Row style={{ gap: 10 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Txt v="h2" color={colors.onPrimary}>A</Txt>
      </View>
      <View>
        <Txt v="h2">Arodan</Txt>
        <Txt v="label" color={colors.primary}>Rider</Txt>
      </View>
    </Row>
  );
}

export function PhoneScreen() {
  const { push } = useNav();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    const clean = phone.replace(/\D/g, '');
    if (!/^(0|234)?[789][01]\d{8}$/.test(clean)) return setErr('Enter a valid Nigerian mobile number, e.g. 0803 123 4567');
    setBusy(true);
    const r = await backend.sendOtp(clean);
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? 'Could not send the code. Try again.');
    push({ name: 'otp', phone: clean });
  };
  return (
    <Wrap>
      <View style={{ marginTop: 12, marginBottom: 28 }}><Brand /></View>
      <Card tint style={{ padding: 22, gap: 10, marginBottom: 24 }}>
        <Txt style={{ fontSize: 44 }}>🛵</Txt>
        <Txt v="h1">Ride with Arodan</Txt>
        <Txt color={colors.muted}>Deliveries and errands around Magodo Phase 2. Get paid for every drop.</Txt>
      </Card>
      <Txt v="h3" style={{ marginBottom: 10 }}>Sign in with your registered number</Txt>
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
          style={{ flex: 1, height: 56, backgroundColor: colors.surface, borderRadius: radius.small, paddingHorizontal: 16, fontFamily: font.semibold, fontSize: 17, color: colors.ink }}
        />
      </Row>
      {err ? <Txt v="small" color={colors.danger} style={{ marginTop: 8 }}>{err}</Txt> : null}
      <View style={{ flex: 1, minHeight: 24 }} />
      <Button title="Send code" onPress={go} loading={busy} disabled={phone.replace(/\D/g, '').length < 10} />
      <Txt v="small" style={{ textAlign: 'center', marginTop: 12 }}>New rider? Arodan sets up your account after your NIN, guarantor and address checks.</Txt>
    </Wrap>
  );
}

export function OtpScreen({ phone }: { phone: string }) {
  const { pop, reset } = useNav();
  const { setRider, setActiveJob } = useRider();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const len = backend.otpLength;
  const go = async (c = code) => {
    setBusy(true);
    setErr('');
    const r = await backend.verifyOtp(phone, c);
    if (!r.ok) {
      setBusy(false);
      return setErr(r.error ?? 'That code is not right. Try again.');
    }
    try {
      const s = await backend.restoreSession();
      setBusy(false);
      if (!s) return setErr('Could not sign you in. Try again.');
      setRider(s.rider);
      setActiveJob(s.activeJob);
      reset(s.activeJob ? { name: 'job' } : { name: 'tabs', tab: 'jobs' });
    } catch (e: any) {
      setBusy(false);
      if (e instanceof NotRiderError) return reset({ name: 'notRider', message: e.message });
      setErr(e?.message ?? 'Could not sign you in. Try again.');
    }
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
          <TextInput
            value={code}
            onChangeText={(v) => {
              const c = v.replace(/\D/g, '').slice(0, len);
              setCode(c);
              setErr('');
              if (c.length === len) go(c);
            }}
            keyboardType="number-pad"
            autoFocus
            maxLength={len}
            style={{ position: 'absolute', inset: 0, opacity: 0.02, color: 'transparent' } as any}
          />
        </View>
        {err ? <Txt v="small" color={colors.danger} style={{ marginTop: 10 }}>{err}</Txt> : null}
        <View style={{ flex: 1, minHeight: 24 }} />
        <Button title="Sign in" onPress={() => go()} loading={busy} disabled={code.length < len} />
      </Wrap>
    </>
  );
}

export function NotRiderScreen({ message }: { message: string }) {
  const { reset } = useNav();
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 16 }}>
      <Card tint style={{ gap: 10, padding: 22 }}>
        <Icon name="shield" color={colors.primary} size={30} />
        <Txt v="h2">You're not set up as a rider yet</Txt>
        <Txt color={colors.ink}>{message}.</Txt>
        <Txt color={colors.muted}>Arodan riders are registered by our team after a NIN check, a guarantor and a home address visit. Call us to start, or sign in with the number you registered.</Txt>
      </Card>
      <Button title="Call Arodan" icon="phone" onPress={() => call(SUPPORT_PHONE)} />
      <Button title="Use another number" kind="ghost" onPress={async () => { await backend.signOut(); reset({ name: 'phone' }); }} />
    </View>
  );
}
