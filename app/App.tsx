import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, useFonts } from '@expo-google-fonts/sora';
import { AppProvider, useApp } from './src/store/AppContext';
import { NavProvider, Route, useNav } from './src/nav';
import { colors } from './src/theme';
import { backend } from './src/api';
import type { Session } from './src/api/types';
import { loadToken } from './src/lib/http';
import { Loading, Problem } from './src/components/Boot';
import { AddressScreen, OtpScreen, PhoneScreen, ProfileScreen, RoleScreen, Welcome } from './src/screens/Onboarding';
import { TabsScreen } from './src/screens/Tabs';
import { ProductScreen } from './src/screens/Shop';
import { CartScreen, CheckoutScreen } from './src/screens/Checkout';
import { ErrandFormScreen } from './src/screens/Errands';
import { TrackingScreen } from './src/screens/Orders';
import { ModeProvider, savedMode, useMode } from './src/roles/ModeContext';
import { fetchRoles } from './src/roles/api';
import { NO_ROLES, type Mode, type Roles } from './src/roles/types';
import { RiderRoot } from './src/rider/RiderRoot';
import { MerchantRoot } from './src/merchant/MerchantRoot';

function ShopScreens() {
  const { route: r } = useNav();
  switch (r.name) {
    case 'welcome': return <Welcome />;
    case 'phone': return <PhoneScreen />;
    case 'otp': return <OtpScreen phone={r.phone} />;
    case 'role': return <RoleScreen phone={r.phone} />;
    case 'profile': return <ProfileScreen phone={r.phone} />;
    case 'address': return <AddressScreen onboarding={r.onboarding} />;
    case 'tabs': return <TabsScreen tab={r.tab} category={r.category} />;
    case 'product': return <ProductScreen id={r.id} />;
    case 'cart': return <CartScreen />;
    case 'checkout': return <CheckoutScreen errand={r.errand} />;
    case 'errandForm': return <ErrandFormScreen type={r.type} attach={r.attach} />;
    case 'tracking': return <TrackingScreen id={r.id} />;
  }
}

/** The shopping part of the app (also where everyone signs in). */
function ShopRoot() {
  const { user, address } = useApp();
  const initial: Route = user?.name && address ? { name: 'tabs', tab: 'home' }
    : user?.name ? { name: 'address', onboarding: true }
    : user ? { name: 'profile', phone: user.phone }
    : { name: 'welcome' };
  return (
    <NavProvider initial={initial}>
      <ShopScreens />
    </NavProvider>
  );
}

function Modes() {
  const { mode } = useMode();
  if (mode === 'ride') return <RiderRoot />;
  if (mode === 'sell') return <MerchantRoot />;
  return <ShopRoot />;
}

type Boot = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; session: Session | null; mode: Mode; roles: Roles };

/**
 * One Arodan app for shoppers, riders and merchants. Everyone signs in the same way; riding and selling
 * are applications that Arodan approves before those parts of the app open up.
 */
export default function App() {
  const [loaded] = useFonts({ Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold });
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [run, setRun] = useState(0);

  const start = useCallback(async () => {
    setBoot({ state: 'loading' });
    try {
      await backend.loadCatalog();
      const session = await backend.restoreSession();
      const signedIn = backend.mode === 'live' && (await loadToken());
      const [mode, roles] = signedIn ? await Promise.all([savedMode(), fetchRoles()]) : ['shop' as Mode, NO_ROLES];
      setBoot({ state: 'ready', session, mode, roles });
      setRun((n) => n + 1);
    } catch (e: any) {
      setBoot({ state: 'error', message: e?.message ?? 'Could not reach Arodan.' });
    }
  }, []);
  useEffect(() => {
    start();
  }, [start]);

  if (!loaded || boot.state === 'loading') return <Loading />;
  if (boot.state === 'error') return <Problem message={boot.message} onRetry={start} />;
  const s = boot.session;
  return (
    <SafeAreaProvider>
      {/* key: signing out starts everything again from a clean state */}
      <AppProvider key={run} initialUser={s?.user ?? null} initialAddress={s?.address ?? null}>
        <ModeProvider initialMode={boot.mode} initialRoles={boot.roles} restart={start}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
            <StatusBar style="dark" />
            <Modes />
          </SafeAreaView>
        </ModeProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
