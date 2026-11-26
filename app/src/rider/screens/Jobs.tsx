import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Row, Tag, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, radius } from '../../theme';
import { useNav } from '../nav';
import { useRider } from '../store/RiderContext';
import { backend } from '../api';
import type { Job, Pickup } from '../api/types';
import { km, naira } from '../lib/format';

export const STEP_LABEL: Record<string, string> = {
  assigned: 'Head to pickup',
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  at_gate: 'At the gate',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const pickupLine = (p: Pickup) => (p.kind === 'merchant' ? `${p.name}${p.area ? ' · ' + p.area : ''}` : `Errand: ${p.title} · ${p.name}`);

function OnlineSwitch() {
  const { rider, setOnline, locationDenied } = useRider();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!rider) return null;
  const on = rider.online;
  const toggle = async () => {
    setBusy(true);
    setErr('');
    try {
      await setOnline(!on);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not change your status. Try again.');
    }
    setBusy(false);
  };
  return (
    <Card tint={on} style={{ gap: 12 }}>
      <Row style={{ gap: 14 }}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: on }}
          onPress={toggle}
          disabled={busy || !rider.vetted}
          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: on ? colors.primary : colors.bg, borderWidth: on ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', opacity: rider.vetted ? 1 : 0.5 }}
        >
          {busy ? <ActivityIndicator color={on ? colors.onPrimary : colors.primary} /> : <Icon name="power" size={28} color={on ? colors.onPrimary : colors.muted} strokeWidth={2.2} />}
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h2">{on ? "You're online" : "You're offline"}</Txt>
          <Txt v="small" color={on ? colors.ink : colors.muted}>{on ? 'New jobs show up here. Your location is shared with dispatch.' : 'Tap to go online and start getting jobs.'}</Txt>
        </View>
      </Row>
      {!rider.vetted && <Txt v="small" color={colors.danger}>You can go online once your NIN, guarantor and home address checks are complete.</Txt>}
      {locationDenied && <Txt v="small" color={colors.danger}>Location is off for Arodan. Turn it on in your phone settings to go online.</Txt>}
      {err ? <Txt v="small" color={colors.danger}>{err}</Txt> : null}
    </Card>
  );
}

function Today() {
  const { rider, activeJob } = useRider();
  const [today, setToday] = useState<{ amount: number; trips: number } | null>(null);
  useEffect(() => {
    backend.earnings().then((e) => setToday(e.today)).catch(() => {});
  }, [rider?.trips, activeJob?.id]);
  return (
    <Row style={{ gap: 10 }}>
      <Card style={{ flex: 1, gap: 2, padding: 16 }}>
        <Txt v="label">Today</Txt>
        <Txt v="h2">{today ? naira(today.amount) : '—'}</Txt>
      </Card>
      <Card style={{ flex: 1, gap: 2, padding: 16 }}>
        <Txt v="label">Drops</Txt>
        <Txt v="h2">{today?.trips ?? '—'}</Txt>
      </Card>
      <Card style={{ flex: 1, gap: 2, padding: 16 }}>
        <Txt v="label">Rating</Txt>
        <Row style={{ gap: 4 }}>
          <Icon name="star" size={16} color={colors.accent} fill={colors.accent} />
          <Txt v="h2">{rider?.rating.toFixed(1)}</Txt>
        </Row>
      </Card>
    </Row>
  );
}

function OfferCard({ job }: { job: Job }) {
  const { setActiveJob, dismissOffer, refreshOffers } = useRider();
  const { push } = useNav();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [err, setErr] = useState('');
  const farthest = Math.max(0, ...job.pickups.map((p) => p.distanceKm));
  const accept = async () => {
    setBusy('accept');
    setErr('');
    try {
      const j = await backend.accept(job);
      setActiveJob(j);
      push({ name: 'job' });
    } catch (e: any) {
      setErr(e?.message ?? 'Could not take this job.');
      refreshOffers();
    }
    setBusy(null);
  };
  const decline = async () => {
    setBusy('decline');
    dismissOffer(job.id);
    await backend.decline(job).catch(() => {});
    setBusy(null);
  };
  return (
    <Card style={{ gap: 14 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 2 }}>
          <Txt v="label">You earn</Txt>
          <Txt v="h1" color={colors.primary}>{naira(job.payout.total)}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Tag label={job.vehicle === 'bicycle' ? 'Bicycle job' : 'Motorbike job'} icon="bike" />
          <Txt v="small">{km(farthest)} · ~{job.etaMin} min</Txt>
        </View>
      </Row>

      <View style={{ gap: 10 }}>
        {job.pickups.map((p) => (
          <Row key={p.kind + p.id} style={{ gap: 10, alignItems: 'flex-start' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: colors.primary, marginTop: 4 }} />
            <View style={{ flex: 1 }}>
              <Txt v="h3">{p.kind === 'merchant' ? p.name : p.title}</Txt>
              <Txt v="small">{p.kind === 'merchant' ? `${p.area} · ${p.items.reduce((a, i) => a + i.qty, 0)} items` : `${p.name} · about ${p.estMin} min${p.budget ? ` · budget ${naira(p.budget)}` : ''}`}</Txt>
            </View>
          </Row>
        ))}
        <Row style={{ gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colors.accent, marginTop: 4 }} />
          <View style={{ flex: 1 }}>
            <Txt v="h3">{job.dropoff.street}</Txt>
            <Txt v="small">{job.dropoff.estate} · exact address after you accept</Txt>
          </View>
        </Row>
      </View>

      <Row style={{ gap: 6, flexWrap: 'wrap' }}>
        {job.collect > 0 ? <Tag tone="accent" icon="cash" label={`Collect ${naira(job.collect)} cash`} /> : <Tag tone="primary" icon="check" label="Paid online" />}
        {job.errandBudget > 0 && <Tag icon="wallet" label={`Spend up to ${naira(job.errandBudget)}`} />}
        {job.weightKg > 0 && <Tag icon="box" label={`${Math.round(job.weightKg * 10) / 10} kg`} />}
      </Row>

      {err ? <Txt v="small" color={colors.danger}>{err}</Txt> : null}
      <Row style={{ gap: 10 }}>
        <Button title="Decline" kind="ghost" onPress={decline} loading={busy === 'decline'} disabled={!!busy} style={{ flex: 1 }} />
        <Button title="Accept" onPress={accept} loading={busy === 'accept'} disabled={!!busy} style={{ flex: 1.4 }} />
      </Row>
    </Card>
  );
}

export function JobsTab() {
  const { rider, activeJob, offers } = useRider();
  const { push } = useNav();
  const first = rider?.name.split(' ')[0] ?? '';
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 14 }}>
      <View>
        <Txt v="small">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</Txt>
        <Txt v="h1">{first}</Txt>
      </View>
      <OnlineSwitch />
      <Today />

      {activeJob ? (
        <Card onPress={() => push({ name: 'job' })} style={{ backgroundColor: colors.accent, gap: 6 }}>
          <Row style={{ gap: 8 }}>
            <Icon name="jobs" color={colors.onAccent} />
            <Txt v="label" color={colors.onAccent}>Job in progress · {activeJob.code}</Txt>
          </Row>
          <Txt v="h2" color={colors.onAccent}>{STEP_LABEL[activeJob.status]}</Txt>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="small" color={colors.onAccent}>{activeJob.dropoff.houseNo} {activeJob.dropoff.street}</Txt>
            <Row style={{ gap: 2 }}>
              <Txt v="small" weight="semibold" color={colors.onAccent}>Open</Txt>
              <Icon name="chevron" size={16} color={colors.onAccent} />
            </Row>
          </Row>
        </Card>
      ) : rider?.online ? (
        <>
          <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
            <Txt v="h3">Jobs near you</Txt>
            {offers.length > 0 && <Txt v="small">{offers.length} waiting</Txt>}
          </Row>
          {offers.length === 0 ? (
            <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 30 }}>
              <ActivityIndicator color={colors.primary} />
              <Txt color={colors.muted} style={{ textAlign: 'center' }}>Looking for jobs around Magodo Phase 2…{'\n'}Keep the app open.</Txt>
            </Card>
          ) : (
            offers.map((j) => <OfferCard key={j.id} job={j} />)
          )}
        </>
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 6 }}>
          <Txt v="h3">Before you go online</Txt>
          <Txt v="small">• Carry your Arodan bag and helmet.{'\n'}• Keep data and battery on; customers follow you live.{'\n'}• Pay-on-delivery orders: collect the exact total before completing.</Txt>
        </View>
      )}
    </ScrollView>
  );
}
