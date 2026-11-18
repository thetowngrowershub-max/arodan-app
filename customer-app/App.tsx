import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, useFonts } from '@expo-google-fonts/sora';
import { AppProvider } from './src/store/AppContext';
import { NavProvider, useNav } from './src/nav';
import { colors } from './src/theme';
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

export default function App() {
  const [loaded] = useFonts({ Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold });
  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavProvider initial={{ name: 'welcome' }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
            <StatusBar style="dark" />
            <Screens />
          </SafeAreaView>
        </NavProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
