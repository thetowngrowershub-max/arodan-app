import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Field, Header, Row, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, font, radius } from '../../theme';
import { useNav } from '../nav';
import { useRider } from '../store/RiderContext';
import { backend } from '../api';
import { naira } from '../lib/format';
import { takeProofPhoto } from '../lib/photo';
import { call } from '../lib/maps';

type Method = 'code' | 'photo';

function Segment({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  const opt = (m: Method, label: string) => (
    <Pressable onPress={() => onChange(m)} style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: value === m ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Txt v="h3" color={value === m ? colors.onPrimary : colors.ink}>{label}</Txt>
    </Pressable>
  );
  return (
    <Row style={{ backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4 }}>
      {opt('code', 'Delivery code')}
      {opt('photo', 'Photo')}
    </Row>
  );
}

export function DeliverScreen() {
  const { activeJob: job, setActiveJob, setRider, rider, position } = useRider();
  const { pop, reset } = useNav();
  const [method, setMethod] = useState<Method>('code');
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [note, setNote] = useState('');
  const [cashOk, setCashOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [earned, setEarned] = useState<number | null>(null);

  if (earned !== null) {
    return (
      <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 18 }}>
        <Card tint style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={38} color={colors.onPrimary} strokeWidth={2.6} />
          </View>
          <Txt v="h1">Delivered</Txt>
          <Txt color={colors.muted}>You earned</Txt>
          <Txt v="h1" color={colors.primary} style={{ fontSize: 40, lineHeight: 46 }}>{naira(earned)}</Txt>
        </Card>
        <Button title={rider?.online ? 'Find the next job' : 'Back to home'} onPress={() => reset({ name: 'tabs', tab: 'jobs' })} />
      </View>
    );
  }
  if (!job) return <Header title="No job in progress" onBack={() => reset({ name: 'tabs', tab: 'jobs' })} />;

  const needsCash = job.collect > 0;
  const ready = (method === 'code' ? code.length === 4 : !!photo) && (!needsCash || cashOk);

  const snap = async () => {
    setErr('');
    try {
      const r = await takeProofPhoto();
      if (r && 'error' in r) setErr(r.error);
      else if (r) setPhoto(r);
    } catch {
      setErr('Could not open the camera. Try again.');
    }
  };

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const proof = method === 'code' ? { method, code } as const : { method, photo: photo!.base64, note } as const;
      const r = await backend.deliver(job, proof, { cashCollected: needsCash ? job.collect : undefined, pos: position });
      setActiveJob(null);
      if (rider) setRider({ ...rider, trips: rider.trips + 1 });
      setEarned(r.earned);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not complete the delivery. Try again.');
      if (method === 'code') setCode('');
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Hand over" onBack={pop} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 6, gap: 16, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Txt color={colors.muted}>Confirm you gave the package to {job.customer?.name ?? 'the customer'}. Use their delivery code, or take a photo if they're not available to read it.</Txt>
        <Segment value={method} onChange={(m) => { setMethod(m); setErr(''); }} />

        {method === 'code' ? (
          <View style={{ gap: 10 }}>
            <Txt v="label">Customer's 4-digit code</Txt>
            <View>
              <Row style={{ gap: 12 }}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={{ flex: 1, height: 68, borderRadius: radius.small, backgroundColor: colors.surface, borderWidth: 2, borderColor: code.length === i ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    <Txt v="h1">{code[i] ?? ''}</Txt>
                  </View>
                ))}
              </Row>
              <TextInput
                value={code}
                onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 4)); setErr(''); }}
                keyboardType="number-pad"
                maxLength={4}
                autoFocus
                style={{ position: 'absolute', inset: 0, opacity: 0.02, color: 'transparent', fontFamily: font.regular } as any}
              />
            </View>
            <Txt v="small">The customer sees it on their order screen in the Arodan app.</Txt>
            {job.customer && <Button title={`Call ${job.customer.name.split(' ')[0]}`} icon="phone" kind="ghost" onPress={() => call(job.customer!.phone)} style={{ height: 46 }} />}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {photo ? (
              <View style={{ gap: 10 }}>
                <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.card, backgroundColor: colors.surface }} resizeMode="cover" />
                <Button title="Retake photo" icon="camera" kind="ghost" onPress={snap} style={{ height: 46 }} />
              </View>
            ) : (
              <Pressable onPress={snap} style={{ height: 220, borderRadius: radius.card, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <Icon name="camera" size={40} color={colors.primary} />
                <Txt v="h3" color={colors.primary}>Take a photo</Txt>
                <Txt v="small">Package at the door or with the person who received it</Txt>
              </Pressable>
            )}
            <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Left with the security man, Musa" maxLength={300} />
          </View>
        )}

        {needsCash && (
          <Pressable onPress={() => setCashOk((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accent, borderRadius: radius.card, padding: 16 }}>
            <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: cashOk ? colors.ink : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
              {cashOk && <Icon name="check" size={18} color={colors.accent} strokeWidth={2.6} />}
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="h3" color={colors.onAccent}>I collected {naira(job.collect)}</Txt>
              <Txt v="small" color={colors.onAccent}>Pay-on-delivery order. Count it before you tick.</Txt>
            </View>
          </Pressable>
        )}

        <View style={{ flex: 1 }} />
        {err ? <Txt v="small" color={colors.danger}>{err}</Txt> : null}
        <Button title="Complete delivery" onPress={submit} loading={busy} disabled={!ready} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
