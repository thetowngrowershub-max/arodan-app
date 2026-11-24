import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, useFonts } from '@expo-google-fonts/sora';
import { AppProvider } from './src/store/AppContext';
import { NavProvider, Route, useNav } from './src/nav';
import { colors } from './src/theme';
import { backend } from './src/api';
import type { Area, Category, Session } from './src/api/types';
import { Button, Txt } from './src/components/ui';
import { OtpScreen, PhoneScreen, ShopForm, Welcome } from './src/screens/Onboarding';
import { TabsScreen } from './src/screens/Tabs';
import { OrderScreen } from './src/screens/Orders';
import { ListingScreen } from './src/screens/Products';

function Screens() {
  const { route: r } = useNav();
  switch (r.name) {
    case 'welcome': return <Welcome />;
    case 'phone': return <PhoneScreen />;
    case 'otp': return <OtpScreen phone={r.phone} />;
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

export default function App() {
  const [loaded] = useFonts({ Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold });
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
  const initial: Route = s?.merchant ? { name: 'tabs', tab: 'orders' } : s ? { name: 'register' } : { name: 'welcome' };
  return (
    <SafeAreaProvider>
      <AppProvider initial={{ owner: s?.owner ?? null, merchant: s?.merchant ?? null }} categories={boot.categories} areas={boot.areas}>
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
