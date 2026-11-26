import React, { useCallback, useEffect, useState } from 'react';
import { RiderProvider } from './store/RiderContext';
import { NavProvider, Route, useNav } from './nav';
import { backend } from './api';
import { NotRiderError } from './api/types';
import type { Job, RiderProfile } from './api/types';
import { ApplyScreen, PendingScreen } from './screens/Apply';
import { TabsScreen } from './screens/Tabs';
import { JobScreen } from './screens/Job';
import { DeliverScreen } from './screens/Deliver';
import { BankAccountScreen } from './screens/Wallet';
import { useMode } from '../roles/ModeContext';
import { Loading, Problem } from '../components/Boot';

function Screens() {
  const { route: r } = useNav();
  switch (r.name) {
    case 'apply': return <ApplyScreen />;
    case 'pending': return <PendingScreen />;
    case 'tabs': return <TabsScreen tab={r.tab} />;
    case 'job': return <JobScreen />;
    case 'deliver': return <DeliverScreen />;
    case 'bank': return <BankAccountScreen />;
  }
}

type Boot = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; initial: Route; rider: RiderProfile | null; job: Job | null };

/** The rider part of the app. Only riders Arodan has approved get past the application screens. */
export function RiderRoot() {
  const { refreshRoles } = useMode();
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const start = useCallback(async () => {
    setBoot({ state: 'loading' });
    try {
      const roles = await refreshRoles();
      if (roles.rider === 'none') return setBoot({ state: 'ready', initial: { name: 'apply' }, rider: null, job: null });
      if (roles.rider === 'paused') return setBoot({ state: 'ready', initial: { name: 'pending' }, rider: null, job: null });
      const s = await backend.restoreSession();
      const rider = s?.rider ?? null;
      const job = s?.activeJob ?? null;
      const initial: Route = roles.rider !== 'approved' ? { name: 'pending' } : job ? { name: 'job' } : { name: 'tabs', tab: 'jobs' };
      setBoot({ state: 'ready', initial, rider, job });
    } catch (e: any) {
      if (e instanceof NotRiderError) setBoot({ state: 'ready', initial: { name: 'apply' }, rider: null, job: null });
      else setBoot({ state: 'error', message: e?.message ?? 'Could not reach Arodan.' });
    }
  }, [refreshRoles]);
  useEffect(() => {
    start();
  }, [start]);

  if (boot.state === 'loading') return <Loading />;
  if (boot.state === 'error') return <Problem message={boot.message} onRetry={start} />;
  return (
    <RiderProvider initialRider={boot.rider} initialJob={boot.job}>
      <NavProvider initial={boot.initial}>
        <Screens />
      </NavProvider>
    </RiderProvider>
  );
}
