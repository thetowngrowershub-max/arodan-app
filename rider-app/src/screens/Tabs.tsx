import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Button, Card, Row, Tag, Txt } from '../components/ui';
import { Icon, IconName } from '../components/Icon';
import { useNav, Tab } from '../nav';
import { useRider } from '../store/RiderContext';
import { colors, radius } from '../theme';
import { backend } from '../api';
import type { Earnings } from '../api/types';
import { naira } from '../lib/format';
import { call } from '../lib/maps';
import { JobsTab } from './Jobs';

const SUPPORT_PHONE = '0800 000 0000'; // TODO: Arodan rider support line

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'jobs', label: 'Jobs', icon: 'jobs' },
  { id: 'earnings', label: 'Earnings', icon: 'wallet' },
  { id: 'account', label: 'Account', icon: 'user' },
];

const dayLabel = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString([], { weekday: 'short' });

function WeekChart({ days }: { days: Earnings['days'] }) {
  const max = Math.max(1, ...days.map((d) => d.amount));
  return (
    <Row style={{ alignItems: 'flex-end', gap: 8, height: 130 }}>
      {days.map((d, i) => {
        const today = i === days.length - 1;
        return (
          <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ width: '100%', height: Math.max(4, (d.amount / max) * 96), borderRadius: 8, backgroundColor: today ? colors.primary : colors.tint }} />
            <Txt v="small" weight={today ? 'semibold' : 'regular'} color={today ? colors.primary : colors.muted}>{dayLabel(d.day)}</Txt>
          </View>
        );
      })}
    </Row>
  );
}

function EarningsTab() {
  const { rider } = useRider();
  const [e, setE] = useState<Earnings | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setE(await backend.earnings());
      setErr('');
    } catch (x: any) {
      setErr(x?.message ?? 'Could not load earnings.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, rider?.trips]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Txt v="h1">Earnings</Txt>
      {!e ? (
        err ? <Txt color={colors.danger}>{err}</Txt> : <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Card tint style={{ gap: 4 }}>
            <Txt v="label" color={colors.primary}>Today</Txt>
            <Txt v="h1" style={{ fontSize: 36, lineHeight: 42 }}>{naira(e.today.amount)}</Txt>
            <Txt v="small" color={colors.ink}>{e.today.trips} {e.today.trips === 1 ? 'drop' : 'drops'}</Txt>
          </Card>
          <Row style={{ gap: 10 }}>
            <Card style={{ flex: 1, gap: 2, padding: 16 }}>
              <Txt v="label">Last 7 days</Txt>
              <Txt v="h2">{naira(e.week.amount)}</Txt>
              <Txt v="small">{e.week.trips} drops</Txt>
            </Card>
            <Card style={{ flex: 1, gap: 2, padding: 16 }}>
              <Txt v="label">All time</Txt>
              <Txt v="h2">{naira(e.total.amount)}</Txt>
              <Txt v="small">{e.total.trips} drops</Txt>
            </Card>
          </Row>
          <Card style={{ gap: 12 }}>
            <Txt v="h3">This week</Txt>
            <WeekChart days={e.days} />
          </Card>
          <Txt v="h3" style={{ marginTop: 4 }}>Recent drops</Txt>
          {e.recent.length === 0 ? (
            <Txt color={colors.muted}>Your completed deliveries will show here.</Txt>
          ) : (
            <Card style={{ gap: 0, paddingVertical: 6 }}>
              {e.recent.map((r, i) => (
                <Row key={r.orderId} style={{ gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="h3">{r.code}</Txt>
                    <Txt v="small">{new Date(r.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {r.estate}{r.topUp ? ' · incl. minimum top-up' : ''}</Txt>
                  </View>
                  <Txt v="h3">{naira(r.amount)}</Txt>
                </Row>
              ))}
            </Card>
          )}
          <Txt v="small" style={{ textAlign: 'center' }}>You keep 80% of the delivery fee and errand fee, at least ₦800 a drop. Payouts to your bank are handled by Arodan.</Txt>
        </>
      )}
    </ScrollView>
  );
}

function AccountTab() {
  const { rider, signOut } = useRider();
  const { reset } = useNav();
  if (!rider) return null;
  const checks: [boolean, string][] = [[rider.checks.nin, 'NIN verified'], [rider.checks.guarantor, 'Guarantor confirmed'], [rider.checks.address, 'Home address visited']];
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 14 }}>
      <Txt v="h1">Account</Txt>
      <Card style={{ gap: 12 }}>
        <Row style={{ gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="h2" color={colors.primary}>{rider.name[0]}</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="h2">{rider.name}</Txt>
            <Txt v="small">{rider.phone}</Txt>
          </View>
        </Row>
        <Row style={{ gap: 6, flexWrap: 'wrap' }}>
          <Tag icon="bike" label={`${rider.vehicle === 'bicycle' ? 'Bicycle' : 'Motorbike'} · ${rider.plate || 'no plate'}`} />
          <Tag icon="star" label={`${rider.rating.toFixed(1)} rating`} />
          <Tag icon="check" label={`${rider.trips} trips`} />
        </Row>
      </Card>
      <Card tint style={{ gap: 10 }}>
        <Row style={{ gap: 8 }}>
          <Icon name="shield" color={colors.primary} />
          <Txt v="h3">Vetting</Txt>
        </Row>
        {checks.map(([ok, label]) => (
          <Row key={label} style={{ gap: 8 }}>
            <Icon name={ok ? 'check' : 'clock'} size={18} color={ok ? colors.primary : colors.danger} />
            <Txt color={colors.ink}>{label}{ok ? '' : ' (pending)'}</Txt>
          </Row>
        ))}
        <Txt v="small" color={colors.ink}>Customers see these checks on their order. To change your vehicle or plate, call Arodan.</Txt>
      </Card>
      <Button title="Call rider support" icon="phone" kind="soft" onPress={() => call(SUPPORT_PHONE)} />
      <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>{backend.mode === 'mock' ? 'Demo mode · sample jobs, delivery code 2580' : 'Connected to Arodan'}</Txt>
      <Button title="Sign out" kind="ghost" onPress={async () => { await signOut(); reset({ name: 'phone' }); }} />
    </ScrollView>
  );
}

export function TabsScreen({ tab }: { tab: Tab }) {
  const { reset } = useNav();
  const { rider, activeJob } = useRider();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'jobs' && <JobsTab />}
        {tab === 'earnings' && <EarningsTab />}
        {tab === 'account' && <AccountTab />}
      </View>
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 18, height: 66, borderRadius: radius.pill, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6, borderWidth: 1, borderColor: colors.line, shadowColor: '#0D1B15', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable key={t.id} onPress={() => reset({ name: 'tabs', tab: t.id })} style={{ alignItems: 'center', justifyContent: 'center', height: 52, paddingHorizontal: on ? 18 : 12, borderRadius: radius.pill, backgroundColor: on ? colors.tint : 'transparent', flexDirection: 'row', gap: 6 }}>
              <View>
                <Icon name={t.icon} color={on ? colors.primary : colors.muted} size={22} />
                {t.id === 'jobs' && (activeJob || rider?.online) && <View style={{ position: 'absolute', top: -2, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: activeJob ? colors.accent : colors.primary }} />}
              </View>
              {on && <Txt v="small" weight="semibold" color={colors.primary}>{t.label}</Txt>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
