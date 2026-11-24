import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, useFonts } from '@expo-google-fonts/sora';
import { RiderProvider } from './src/store/RiderContext';
import { NavProvider, Route, useNav } from './src/nav';
import { colors } from './src/theme';
import { backend } from './src/api';
import { NotRiderError } from './src/api/types';
import type { Job, RiderProfile } from './src/api/types';
import { Button, Txt } from './src/components/ui';
import { NotRiderScreen, OtpScreen, PhoneScreen } from './src/screens/SignIn';
import { TabsScreen } from './src/screens/Tabs';
import { JobScreen } from './src/screens/Job';
import { DeliverScreen } from './src/screens/Deliver';
import { BankAccountScreen } from './src/screens/Wallet';

function Screens() {
  const { route: r } = useNav();
  switch (r.name) {
    case 'phone': return <PhoneScreen />;
    case 'otp': return <OtpScreen phone={r.phone} />;
    case 'notRider': return <NotRiderScreen message={r.message} />;
    case 'tabs': return <TabsScreen tab={r.tab} />;
    case 'job': return <JobScreen />;
    case 'deliver': return <DeliverScreen />;
    case 'bank': return <BankAccountScreen />;
  }
}

type Boot =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; rider: RiderProfile | null; job: Job | null; notRider?: string };

export default function App() {
  const [loaded] = useFonts({ Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold });
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const start = useCallback(async () => {
    setBoot({ state: 'loading' });
    try {
      const s = await backend.restoreSession();
      setBoot({ state: 'ready', rider: s?.rider ?? null, job: s?.activeJob ?? null });
    } catch (e: any) {
      if (e instanceof NotRiderError) setBoot({ state: 'ready', rider: null, job: null, notRider: e.message });
      else setBoot({ state: 'error', message: e?.message ?? 'Could not reach Arodan.' });
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
  const initial: Route = boot.notRider
    ? { name: 'notRider', message: boot.notRider }
    : !boot.rider ? { name: 'phone' } : boot.job ? { name: 'job' } : { name: 'tabs', tab: 'jobs' };
  return (
    <SafeAreaProvider>
      <RiderProvider initialRider={boot.rider} initialJob={boot.job}>
        <NavProvider initial={initial}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
            <StatusBar style="dark" />
            <Screens />
          </SafeAreaView>
        </NavProvider>
      </RiderProvider>
    </SafeAreaProvider>
  );
}
