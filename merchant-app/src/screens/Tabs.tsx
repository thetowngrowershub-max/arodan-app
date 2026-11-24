import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, Card, ErrorText, Pill, Row, ToggleRow, Txt } from '../components/ui';
import { Icon, IconName } from '../components/Icon';
import { useNav, Tab } from '../nav';
import { useApp } from '../store/AppContext';
import { backend } from '../api';
import { colors, radius } from '../theme';
import { OrdersTab } from './Orders';
import { ProductsTab } from './Products';
import { SalesTab } from './Sales';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'orders', label: 'Orders', icon: 'orders' },
  { id: 'products', label: 'Products', icon: 'box' },
  { id: 'sales', label: 'Sales', icon: 'chart' },
  { id: 'shop', label: 'Shop', icon: 'store' },
];

function ShopTab() {
  const { owner, merchant, setMerchant, categories, signOut } = useApp();
  const { push, reset } = useNav();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!merchant) return null;
  const toggleOpen = async (isOpen: boolean) => {
    setBusy(true);
    setErr('');
    try {
      setMerchant(await backend.updateMerchant({ isOpen }));
    } catch (e: any) {
      setErr(e?.message ?? 'Could not change that');
    } finally {
      setBusy(false);
    }
  };
  const status = { pending: ['Waiting for approval', 'accent'], live: ['Approved', 'tint'], suspended: ['Paused by Arodan', 'danger'] }[merchant.status] as [string, 'accent' | 'tint' | 'danger'];
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 150, gap: 14 }}>
      <Txt v="h1">Shop</Txt>
      <Card style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h2" style={{ flex: 1 }} numberOfLines={1}>{merchant.name}</Txt>
          <Pill label={status[0]} tone={status[1]} />
        </Row>
        <Txt v="small">{merchant.address}, {merchant.area}</Txt>
        <Txt v="small">{merchant.phone}</Txt>
      </Card>
      <Card>
        <ToggleRow label="Shop is open" hint={merchant.isOpen ? 'Customers can order from you now.' : 'Closed. Your products are hidden until you open again.'}
          value={merchant.isOpen} onChange={toggleOpen} disabled={busy} />
        <ErrorText text={err} />
      </Card>
      <Card onPress={() => push({ name: 'editShop' })} style={{ gap: 4 }}>
        <Row style={{ gap: 8 }}>
          <Icon name="edit" color={colors.primary} />
          <Txt v="h3" style={{ flex: 1 }}>Shop details & payout account</Txt>
          <Icon name="chevron" color={colors.muted} size={18} />
        </Row>
        <Txt v="small">Sells: {merchant.categories.map((c) => categories.find((x) => x.id === c)?.name ?? c).join(', ') || 'not set'}</Txt>
        <Txt v="small">Payouts: {merchant.accountNumber ? `${merchant.bankName} ···${merchant.accountNumber.slice(-4)}` : 'No account added yet'}</Txt>
      </Card>
      <Card tint style={{ gap: 6 }}>
        <Row style={{ gap: 8 }}>
          <Icon name="shield" color={colors.primary} />
          <Txt v="h3">How handover works</Txt>
        </Row>
        <Txt v="small" color={colors.ink}>Accept an order, pack it, then mark it ready. The rider can only collect after that. Check the order code with the rider before you hand it over. Arodan collects payment from the customer.</Txt>
      </Card>
      {owner?.name ? <Txt v="small" style={{ textAlign: 'center' }}>Signed in as {owner.name}{owner.phone ? ` · ${owner.phone}` : ''}</Txt> : null}
      <Button title="Sign out" kind="ghost" onPress={async () => { await signOut(); reset({ name: 'welcome' }); }} />
    </ScrollView>
  );
}

export function TabsScreen({ tab }: { tab: Tab }) {
  const { reset } = useNav();
  const { orders } = useApp();
  const fresh = orders.filter((o) => o.status === 'new').length;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'orders' && <OrdersTab />}
        {tab === 'products' && <ProductsTab />}
        {tab === 'sales' && <SalesTab />}
        {tab === 'shop' && <ShopTab />}
      </View>
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 18, height: 66, borderRadius: radius.pill, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6, borderWidth: 1, borderColor: colors.line, shadowColor: '#0D1B15', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable key={t.id} onPress={() => reset({ name: 'tabs', tab: t.id })} accessibilityRole="tab" accessibilityLabel={t.label}
              style={{ alignItems: 'center', justifyContent: 'center', height: 52, paddingHorizontal: on ? 16 : 10, borderRadius: radius.pill, backgroundColor: on ? colors.tint : 'transparent', flexDirection: 'row', gap: t.id === 'orders' && fresh > 0 ? 12 : 6 }}>
              <View>
                <Icon name={t.icon} color={on ? colors.primary : colors.muted} size={22} />
                {t.id === 'orders' && fresh > 0 && (
                  <View style={{ position: 'absolute', top: -6, right: -9, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt v="small" weight="bold" color={colors.onAccent} style={{ fontSize: 10.5, lineHeight: 13 }}>{fresh}</Txt>
                  </View>
                )}
              </View>
              {on && <Txt v="small" weight="semibold" color={colors.primary}>{t.label}</Txt>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
