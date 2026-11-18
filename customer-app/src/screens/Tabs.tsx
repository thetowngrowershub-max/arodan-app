import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Card, Row, Txt } from '../components/ui';
import { Icon, IconName } from '../components/Icon';
import { useNav, Tab } from '../nav';
import { useApp } from '../store/AppContext';
import { colors, radius } from '../theme';
import type { CategoryId } from '../data/catalog';
import { CartBar, HomeTab, ShopTab } from './Shop';
import { ErrandsTab } from './Errands';
import { OrdersTab } from './Orders';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'shop', label: 'Shop', icon: 'shop' },
  { id: 'errands', label: 'Errands', icon: 'errand' },
  { id: 'orders', label: 'Orders', icon: 'orders' },
  { id: 'account', label: 'Account', icon: 'user' },
];

function AccountTab() {
  const { user, address, signOut } = useApp();
  const { push, reset } = useNav();
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 170, gap: 14 }}>
      <Txt v="h1">Account</Txt>
      <Card style={{ gap: 4 }}>
        <Txt v="h2">{user?.name}</Txt>
        <Txt color={colors.muted}>{user?.phone}</Txt>
      </Card>
      <Card onPress={() => push({ name: 'address' })} style={{ gap: 4 }}>
        <Row style={{ gap: 8 }}>
          <Icon name="pin" color={colors.primary} />
          <Txt v="h3" style={{ flex: 1 }}>Address & gate access</Txt>
          <Icon name="chevron" color={colors.muted} size={18} />
        </Row>
        <Txt v="small">{address ? `${address.houseNo} ${address.street}, ${address.estate}` : 'Not set'}</Txt>
        <Txt v="small">{address?.gateName ? `Gate: ${address.gateName}` : 'No gate details yet'}</Txt>
      </Card>
      <Card tint style={{ gap: 6 }}>
        <Row style={{ gap: 8 }}>
          <Icon name="shield" color={colors.primary} />
          <Txt v="h3">How we vet riders</Txt>
        </Row>
        <Txt v="small" color={colors.ink}>Every rider passes a NIN check, provides a guarantor, and has their home address visited before their first trip.</Txt>
      </Card>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 8 }}>Prototype build · mock data, no real payments</Txt>
      <Button title="Sign out" kind="ghost" onPress={() => { signOut(); reset({ name: 'welcome' }); }} />
    </ScrollView>
  );
}

export function TabsScreen({ tab, category }: { tab: Tab; category?: CategoryId }) {
  const { reset } = useNav();
  const { orders } = useApp();
  const live = orders.some((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && <HomeTab />}
        {tab === 'shop' && <ShopTab key={category ?? 'all'} initialCategory={category} />}
        {tab === 'errands' && <ErrandsTab />}
        {tab === 'orders' && <OrdersTab />}
        {tab === 'account' && <AccountTab />}
      </View>
      {(tab === 'home' || tab === 'shop') && <CartBar />}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 18, height: 66, borderRadius: radius.pill, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6, borderWidth: 1, borderColor: colors.line, shadowColor: '#0D1B15', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable key={t.id} onPress={() => reset({ name: 'tabs', tab: t.id })} style={{ alignItems: 'center', justifyContent: 'center', height: 52, paddingHorizontal: on ? 16 : 10, borderRadius: radius.pill, backgroundColor: on ? colors.tint : 'transparent', flexDirection: 'row', gap: 6 }}>
              <View>
                <Icon name={t.icon} color={on ? colors.primary : colors.muted} size={22} />
                {t.id === 'orders' && live && <View style={{ position: 'absolute', top: -2, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent }} />}
              </View>
              {on && <Txt v="small" weight="semibold" color={colors.primary}>{t.label}</Txt>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
