import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Card, Chip, Field, Header, Row, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors } from '../../theme';
import { useNav } from '../nav';
import { useRider } from '../store/RiderContext';
import { backend } from '../api';
import type { RiderProfile, Vehicle } from '../api/types';
import { call } from '../lib/maps';
import { useMode } from '../../roles/ModeContext';
import { useApp } from '../../store/AppContext';

export const SUPPORT_PHONE = '0800 000 0000'; // TODO: Arodan rider support line

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  </KeyboardAvoidingView>
);

const isPhone = (p: string) => /^(0|234)?[789][01]\d{8}$/.test(p.replace(/\D/g, ''));

/** Application to ride. Nothing is unlocked until Arodan has done the checks. */
export function ApplyScreen() {
  const { reset } = useNav();
  const { setRider } = useRider();
  const { back, refreshRoles } = useMode();
  const { user, setUser } = useApp();
  const [f, setF] = useState({ name: user?.name ?? '', plate: '', homeAddress: '', guarantorName: '', guarantorPhone: '' });
  const [vehicle, setVehicle] = useState<Vehicle>('motorbike');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const valid = f.name.trim().length >= 2 && f.homeAddress.trim().length >= 5 && f.guarantorName.trim().length >= 2 && isPhone(f.guarantorPhone)
    && (vehicle === 'bicycle' || f.plate.trim().length >= 4);

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await backend.apply({ ...f, vehicle, plate: f.plate.trim() });
      setRider(r);
      setUser({ phone: user?.phone ?? r.phone, name: f.name.trim() });
      const roles = await refreshRoles();
      reset(roles.rider === 'approved' ? { name: 'tabs', tab: 'jobs' } : { name: 'pending' });
    } catch (e: any) {
      setErr(e?.message ?? 'Could not send your application. Try again.');
    }
    setBusy(false);
  };

  return (
    <>
      <Header onBack={back} />
      <Wrap>
        <Txt v="h1" style={{ marginBottom: 8 }}>Ride with Arodan</Txt>
        <Txt color={colors.muted} style={{ marginBottom: 20 }}>
          Tell us about you and your bike. Our team will call you to check your NIN, meet your guarantor and visit your home address. You can take jobs once all three are done.
        </Txt>
        <Field label="Full name" value={f.name} onChangeText={set('name')} placeholder="As on your NIN slip" />
        <Txt v="label" style={{ marginBottom: 6 }}>Vehicle</Txt>
        <Row style={{ gap: 8, marginBottom: 14 }}>
          <Chip label="Motorbike" emoji="🛵" active={vehicle === 'motorbike'} onPress={() => setVehicle('motorbike')} />
          <Chip label="Bicycle" emoji="🚲" active={vehicle === 'bicycle'} onPress={() => setVehicle('bicycle')} />
        </Row>
        <Field label={vehicle === 'bicycle' ? 'Plate or bike number (optional)' : 'Plate number'} value={f.plate} onChangeText={set('plate')} placeholder="e.g. LSR 214 QA" autoCapitalize="characters" />
        <Field label="Home address" value={f.homeAddress} onChangeText={set('homeAddress')} placeholder="House number, street, area" hint="We visit this address before your first trip." />
        <Field label="Guarantor's name" value={f.guarantorName} onChangeText={set('guarantorName')} placeholder="Someone who can vouch for you" />
        <Field label="Guarantor's phone" value={f.guarantorPhone} onChangeText={set('guarantorPhone')} keyboardType="phone-pad" placeholder="0803 123 4567" />
        {err ? <Txt v="small" color={colors.danger} style={{ marginBottom: 10 }}>{err}</Txt> : null}
        <View style={{ flex: 1, minHeight: 12 }} />
        <Button title="Send application" onPress={submit} loading={busy} disabled={!valid} />
        <Txt v="small" style={{ textAlign: 'center', marginTop: 10 }}>Bring your NIN slip and rider's permit when we call.</Txt>
      </Wrap>
    </>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Row style={{ gap: 10 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: ok ? colors.primary : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ok ? 'check' : 'clock'} size={16} color={ok ? colors.onPrimary : colors.muted} />
      </View>
      <Txt color={colors.ink} style={{ flex: 1 }}>{label}</Txt>
      <Txt v="small" color={ok ? colors.primary : colors.muted}>{ok ? 'Done' : 'To do'}</Txt>
    </Row>
  );
}

/** Shown to applicants until Arodan approves them (and to paused riders). */
export function PendingScreen({ paused }: { paused?: boolean }) {
  const { rider, setRider } = useRider();
  const { reset } = useNav();
  const { setMode, refreshRoles, roles, restart } = useMode();
  const { signOut } = useApp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const check = async () => {
    setBusy(true);
    setNote('');
    try {
      const r = await refreshRoles();
      if (r.rider === 'approved') {
        const s = await backend.restoreSession();
        if (s) setRider(s.rider);
        return reset({ name: 'tabs', tab: 'jobs' });
      }
      const s = await backend.restoreSession().catch(() => null);
      if (s) setRider(s.rider);
      setNote('Still in review. We will call you when the next check is done.');
    } catch {
      setNote('Could not check. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const c: RiderProfile['checks'] = rider?.checks ?? { nin: false, guarantor: false, address: false };
  const isPaused = paused || roles.rider === 'paused';

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 36, gap: 16, flexGrow: 1 }}>
      <Card tint style={{ gap: 10, padding: 22 }}>
        <Icon name="shield" color={colors.primary} size={30} />
        <Txt v="h1">{isPaused ? 'Your rider account is paused' : 'Application received'}</Txt>
        <Txt color={colors.ink}>
          {isPaused
            ? 'Arodan has paused riding on this account. Call rider support to sort it out.'
            : "Thanks for applying. Our team will call you to arrange the checks below. Riding opens as soon as they're all done."}
        </Txt>
      </Card>
      {!isPaused && (
        <Card style={{ gap: 12 }}>
          <CheckRow ok={c.nin} label="NIN verified" />
          <CheckRow ok={c.guarantor} label="Guarantor confirmed" />
          <CheckRow ok={c.address} label="Home address visited" />
        </Card>
      )}
      {note ? <Txt v="small" style={{ textAlign: 'center' }}>{note}</Txt> : null}
      <View style={{ flex: 1 }} />
      <Button title="Check again" onPress={check} loading={busy} />
      <Button title="Call rider support" icon="phone" kind="soft" onPress={() => call(SUPPORT_PHONE)} />
      <Button title="Shop while you wait" kind="ghost" onPress={() => setMode('shop')} />
      <Button title="Sign out" kind="ghost" onPress={async () => { await signOut(); restart(); }} style={{ borderWidth: 0 }} />
    </ScrollView>
  );
}
