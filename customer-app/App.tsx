import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, useFonts } from '@expo-google-fonts/sora';
import { AppProvider } from './src/store/AppContext';
import { NavProvider, useNav } from './src/nav';
import { colors } from './src/theme';
import { backend } from './src/api';
import type { Session } from './src/api/types';
import { Button, Txt } from './src/components/ui';
import { AddressScreen, OtpScreen, PhoneScreen, ProfileScreen, Welcome } from './src/screens/Onboarding';
import { TabsScreen } from './src/screens/Tabs';
import { ProductScreen } from './src/screens/Shop';
import { CartScreen, CheckoutScreen } from './src/screens/Checkout';
import { ErrandFormScreen } from './src/screens/Errands';
import { TrackingScreen } from './src/screens/Orders';

function Screens() {
  const { route: r } = useNav();
  switch (r.name) {
    case 'welcome': return <Welcome />;
    case 'phone': return <PhoneScreen />;
    case 'otp': return <OtpScreen phone={r.phone} />;
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

type Boot = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; session: Session | null };

export default function App() {
  const [loaded] = useFonts({ Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold });
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const start = useCallback(async () => {
    setBoot({ state: 'loading' });
    try {
      await backend.loadCatalog();
      const session = await backend.restoreSession();
      setBoot({ state: 'ready', session });
    } catch (e: any) {
      setBoot({ state: 'error', message: e?.message ?? 'Could not reach Arodan.' });
    }
  }, []);
  useEffect(() => {
    start();
  }, [start]);

  if (!loaded || boot.state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (boot.state === 'error') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 30, gap: 14 }}>
        <Txt v="h2">Can't connect</Txt>
        <Txt style={{ textAlign: 'center' }} color={colors.muted}>Check your internet connection and try again. ({boot.message})</Txt>
        <Button title="Try again" onPress={start} />
      </View>
    );
  }
  const s = boot.session;
  const initial = s?.user && s.address ? { name: 'tabs' as const, tab: 'home' as const } : s?.user ? { name: 'address' as const, onboarding: true } : { name: 'welcome' as const };
  return (
    <SafeAreaProvider>
      <AppProvider initialUser={s?.user ?? null} initialAddress={s?.address ?? null}>
        <NavProvider initial={initial}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
            <StatusBar style="dark" />
            <Screens />
          </SafeAreaView>
        </NavProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
