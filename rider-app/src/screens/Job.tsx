import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AmountRow, Button, Card, Divider, Header, Row, Tag, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, radius } from '../theme';
import { useNav } from '../nav';
import { useRider } from '../store/RiderContext';
import { backend } from '../api';
import type { Job, JobStatus, Pickup } from '../api/types';
import { km, naira } from '../lib/format';
import { call, dropoffQuery, navigateTo, pickupQuery } from '../lib/maps';
import { STEP_LABEL } from './Jobs';

const STEPS: JobStatus[] = ['assigned', 'picked_up', 'on_the_way', 'at_gate', 'delivered'];
const ERRAND_VERB = { buy: 'Buy', pickup: 'Pick up', laundry: 'Laundry', bills: 'Pay bill' } as const;

function Progress({ status }: { status: JobStatus }) {
  const idx = STEPS.indexOf(status);
  return (
    <View style={{ gap: 8 }}>
      <Row style={{ gap: 6 }}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= idx ? colors.primary : colors.line }} />
        ))}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        {['Pickup', 'Picked up', 'On the way', 'Gate', 'Done'].map((l, i) => (
          <Txt key={l} v="small" weight={i === idx ? 'semibold' : 'regular'} color={i === idx ? colors.primary : colors.muted}>{l}</Txt>
        ))}
      </Row>
    </View>
  );
}

function NavButton({ query, label = 'Navigate' }: { query: string; label?: string }) {
  return <Button title={label} icon="navigate" kind="soft" onPress={() => navigateTo(query)} style={{ height: 44, paddingHorizontal: 16 }} />;
}

function PickupCard({ p, ticked, onTick, showNav }: { p: Pickup; ticked: Set<string>; onTick: (k: string) => void; showNav: boolean }) {
  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={p.kind === 'merchant' ? 'shop' : 'errand'} color={colors.primary} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="label">{p.kind === 'merchant' ? 'Pickup' : `Errand · ${ERRAND_VERB[p.errandType]}`}</Txt>
          <Txt v="h3">{p.kind === 'merchant' ? p.name : p.title}</Txt>
          <Txt v="small">{p.kind === 'merchant' ? p.area : p.name} · {km(p.distanceKm)}</Txt>
        </View>
      </Row>
      {p.kind === 'merchant' ? (
        <View style={{ gap: 6 }}>
          {p.items.map((it, i) => {
            const k = `${p.id}:${i}`;
            const on = ticked.has(k);
            return (
              <Pressable key={k} onPress={() => onTick(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: on ? colors.primary : colors.bg, borderWidth: on ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Icon name="check" size={16} color={colors.onPrimary} strokeWidth={2.4} />}
                </View>
                <Txt style={{ flex: 1, textDecorationLine: on ? 'line-through' : 'none' }} color={on ? colors.muted : colors.ink}>{it.qty} × {it.name}</Txt>
                <Txt v="small">{naira(it.unitPrice * it.qty)}</Txt>
              </Pressable>
            );
          })}
          <Txt v="small">Already paid to the shop by Arodan. Check the items match before you leave.</Txt>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {p.details ? <Txt>{p.details}</Txt> : null}
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            <Tag icon="clock" label={`About ${p.estMin} min`} />
            {p.budget > 0 && <Tag tone="accent" icon="wallet" label={`Spend up to ${naira(p.budget)}`} />}
          </Row>
          {p.budget > 0 && <Txt v="small">Keep the receipt. Unspent money is refunded to the customer.</Txt>}
        </View>
      )}
      {showNav && <NavButton query={pickupQuery(p)} />}
    </Card>
  );
}

function DropoffCard({ job }: { job: Job }) {
  const d = job.dropoff;
  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pin" color={colors.primary} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="label">Drop-off{d.label ? ` · ${d.label}` : ''}</Txt>
          <Txt v="h3">{d.houseNo} {d.street}</Txt>
          <Txt v="small">{d.estate}{d.landmark ? ` · ${d.landmark}` : ''}</Txt>
        </View>
      </Row>
      {(d.gateCode || d.gateName) && (
        <View style={{ backgroundColor: colors.accent, borderRadius: radius.small + 4, padding: 14, gap: 2 }}>
          <Row style={{ gap: 6 }}>
            <Icon name="key" size={18} color={colors.onAccent} />
            <Txt v="label" color={colors.onAccent}>Gate pass{d.gateName ? ` · ${d.gateName}` : ''}</Txt>
          </Row>
          {d.gateCode ? <Txt v="h1" color={colors.onAccent} style={{ letterSpacing: 4 }}>{d.gateCode}</Txt> : null}
          {d.gateNote ? <Txt v="small" color={colors.onAccent}>{d.gateNote}</Txt> : null}
        </View>
      )}
      {job.customer && (
        <Row style={{ gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="h3" color={colors.primary}>{job.customer.name[0]}</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="h3">{job.customer.name}</Txt>
            <Txt v="small">{job.customer.phone}</Txt>
          </View>
          <Button title="" icon="phone" kind="soft" onPress={() => call(job.customer!.phone)} style={{ width: 48, height: 48, paddingHorizontal: 0 }} />
        </Row>
      )}
      <NavButton query={dropoffQuery(d)} label="Navigate to drop-off" />
    </Card>
  );
}

export function JobScreen() {
  const { activeJob: job, setActiveJob } = useRider();
  const { reset, push } = useNav();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirmRelease, setConfirmRelease] = useState(false);
  const back = () => reset({ name: 'tabs', tab: 'jobs' });

  if (!job) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="No job in progress" onBack={back} />
        <View style={{ padding: 20, gap: 12 }}>
          <Txt color={colors.muted}>This job was closed. If you think that's wrong, call Arodan support.</Txt>
          <Button title="Back to jobs" onPress={back} />
        </View>
      </View>
    );
  }

  const step = async (status: 'picked_up' | 'on_the_way' | 'at_gate') => {
    setBusy(true);
    setErr('');
    try {
      setActiveJob(await backend.advance(job, status));
    } catch (e: any) {
      setErr(e?.message ?? 'Could not update the job. Try again.');
    }
    setBusy(false);
  };
  const release = async () => {
    setBusy(true);
    try {
      await backend.release(job);
      setActiveJob(null);
      back();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not hand back the job.');
      setBusy(false);
    }
  };
  const toggle = (k: string) => setTicked((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  const allItems = job.pickups.flatMap((p) => (p.kind === 'merchant' ? p.items.map((_, i) => `${p.id}:${i}`) : []));
  const atPickup = job.status === 'assigned';
  const action = {
    assigned: { title: 'Picked up everything', hint: allItems.length && ticked.size < allItems.length ? `Tick each item as you collect it (${ticked.size}/${allItems.length})` : 'Confirm once every pickup and errand is done.', run: () => step('picked_up') },
    picked_up: { title: 'Start trip to customer', hint: 'The customer is told you are on the way.', run: () => step('on_the_way') },
    on_the_way: { title: "I'm at the gate", hint: 'Show the gate pass to estate security.', run: () => step('at_gate') },
    at_gate: { title: 'Hand over package', hint: "Get the customer's 4-digit delivery code, or take a photo.", run: () => push({ name: 'deliver' }) },
  }[job.status as 'assigned' | 'picked_up' | 'on_the_way' | 'at_gate'];

  return (
    <View style={{ flex: 1 }}>
      <Header title={`Job ${job.code}`} onBack={back} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 6, gap: 14, paddingBottom: 200 }}>
        <Progress status={job.status} />
        <Txt v="h2">{STEP_LABEL[job.status]}</Txt>

        {job.collect > 0 ? (
          <Card style={{ backgroundColor: colors.accent, gap: 2 }}>
            <Row style={{ gap: 8 }}>
              <Icon name="cash" color={colors.onAccent} />
              <Txt v="label" color={colors.onAccent}>Pay on delivery</Txt>
            </Row>
            <Txt v="h1" color={colors.onAccent}>Collect {naira(job.collect)}</Txt>
            <Txt v="small" color={colors.onAccent}>Cash or transfer to Arodan, before you hand over.</Txt>
          </Card>
        ) : (
          <Tag tone="primary" icon="check" label="Paid online. Nothing to collect." />
        )}

        {job.pickups.map((p) => <PickupCard key={p.kind + p.id} p={p} ticked={ticked} onTick={toggle} showNav={atPickup} />)}
        <DropoffCard job={job} />

        <Card style={{ gap: 2 }}>
          <Txt v="label" style={{ marginBottom: 4 }}>Your earnings for this job</Txt>
          <AmountRow label="Delivery share" value={naira(job.payout.delivery)} />
          {job.payout.errand > 0 && <AmountRow label="Errand share" value={naira(job.payout.errand)} />}
          {job.payout.topUp > 0 && <AmountRow label="Minimum drop top-up" value={naira(job.payout.topUp)} />}
          <Divider />
          <AmountRow label="Total" value={naira(job.payout.total)} strong />
        </Card>

        {atPickup && (
          confirmRelease ? (
            <Card style={{ gap: 10 }}>
              <Txt v="h3">Hand this job back?</Txt>
              <Txt v="small">It goes to another rider. Do this only if you really can't do it (bike trouble, emergency).</Txt>
              <Row style={{ gap: 10 }}>
                <Button title="Keep it" kind="ghost" onPress={() => setConfirmRelease(false)} style={{ flex: 1 }} />
                <Button title="Hand back" kind="soft" onPress={release} loading={busy} style={{ flex: 1 }} />
              </Row>
            </Card>
          ) : (
            <Button title="I can't do this job" kind="ghost" onPress={() => setConfirmRelease(true)} />
          )
        )}
      </ScrollView>

      {action && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 20, backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.line, gap: 8 }}>
          {err ? <Txt v="small" color={colors.danger}>{err}</Txt> : <Txt v="small" style={{ textAlign: 'center' }}>{action.hint}</Txt>}
          <Button title={action.title} onPress={action.run} loading={busy} />
          {job.status === 'on_the_way' && <Button title="No gate here, hand over now" kind="ghost" onPress={() => push({ name: 'deliver' })} style={{ height: 44 }} />}
        </View>
      )}
    </View>
  );
}
