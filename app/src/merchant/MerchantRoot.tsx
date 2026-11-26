import React, { useCallback, useEffect, useState } from 'react';
import { AppProvider } from './store/AppContext';
import { NavProvider, Route, useNav } from './nav';
import { backend } from './api';
import type { Area, Category, Session } from './api/types';
import { ShopForm } from './screens/Onboarding';
import { TabsScreen } from './screens/Tabs';
import { OrderScreen } from './screens/Orders';
import { ListingScreen } from './screens/Products';
import { useApp as useShopper } from '../store/AppContext';
import { Loading, Problem } from '../components/Boot';

function Screens() {
  const { route: r } = useNav();
  switch (r.name) {
    case 'register': return <ShopForm />;
    case 'editShop': return <ShopForm edit />;
    case 'tabs': return <TabsScreen tab={r.tab} />;
    case 'order': return <OrderScreen id={r.id} />;
    case 'listing': return <ListingScreen id={r.id} />;
  }
}

type Boot =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; session: Session | null; categories: Category[]; areas: Area[] };

/**
 * The merchant part of the app. A new shop starts as "Waiting for approval": the owner can add
 * products, but customers only see the shop once Arodan has approved it.
 */
export function MerchantRoot() {
  const { user } = useShopper();
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const start = useCallback(async () => {
    setBoot({ state: 'loading' });
    try {
      const [ref, session] = await Promise.all([backend.loadReference(), backend.restoreSession()]);
      setBoot({ state: 'ready', session, ...ref });
    } catch (e: any) {
      setBoot({ state: 'error', message: e?.message ?? 'Could not reach Arodan.' });
    }
  }, []);
  useEffect(() => {
    start();
  }, [start]);

  if (boot.state === 'loading') return <Loading />;
  if (boot.state === 'error') return <Problem message={boot.message} onRetry={start} />;
  const s = boot.session;
  const initial: Route = s?.merchant ? { name: 'tabs', tab: 'orders' } : { name: 'register' };
  const owner = s?.owner?.name ? s.owner : user ? { phone: user.phone, name: user.name } : s?.owner ?? null;
  return (
    <AppProvider initial={{ owner, merchant: s?.merchant ?? null }} categories={boot.categories} areas={boot.areas}>
      <NavProvider initial={initial}>
        <Screens />
      </NavProvider>
    </AppProvider>
  );
}
