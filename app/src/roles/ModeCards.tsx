import React from 'react';
import { View } from 'react-native';
import { Card, Row, Txt } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { colors, radius } from '../theme';
import { useMode } from './ModeContext';
import type { Mode, RoleStatus } from './types';

const INFO: Record<Mode, { title: string; icon: IconName; blurb: string }> = {
  shop: { title: 'Shop on Arodan', icon: 'shop', blurb: 'Groceries, household items, gadgets and errands to your gate.' },
  ride: { title: 'Ride with Arodan', icon: 'bike', blurb: 'Deliver orders and run errands around Magodo. Get paid per drop.' },
  sell: { title: 'Sell on Arodan', icon: 'errand', blurb: 'List your shop, get orders from nearby customers.' },
};

const LABEL: Record<RoleStatus, string> = { none: 'Apply', pending: 'Application in review', approved: 'Open', paused: 'Paused by Arodan' };

/**
 * "Switch to…" cards for the Account screens. Shows the other two modes with their approval status.
 * `beforeSwitch` can refuse a switch (e.g. a rider in the middle of a job) by returning an error message.
 */
export function ModeCards({ beforeSwitch }: { beforeSwitch?: () => Promise<string | null> }) {
  const { mode, setMode, roles } = useMode();
  const [err, setErr] = React.useState('');
  const status = (m: Mode): RoleStatus => (m === 'shop' ? 'approved' : m === 'ride' ? roles.rider : roles.merchant);
  const go = async (m: Mode) => {
    setErr('');
    const problem = beforeSwitch ? await beforeSwitch() : null;
    if (problem) return setErr(problem);
    setMode(m);
  };
  return (
    <View style={{ gap: 10 }}>
      <Txt v="label">Use Arodan another way</Txt>
      {(['shop', 'ride', 'sell'] as Mode[]).filter((m) => m !== mode).map((m) => {
        const s = status(m);
        return (
          <Card key={m} onPress={() => go(m)} style={{ gap: 4 }}>
            <Row style={{ gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={INFO[m].icon} color={colors.primary} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="h3">{m === 'shop' ? 'Switch to shopping' : INFO[m].title}</Txt>
                <Txt v="small">{m === 'shop' ? INFO.shop.blurb : s === 'none' ? INFO[m].blurb : LABEL[s]}</Txt>
              </View>
              {m !== 'shop' && s !== 'approved' ? (
                <View style={{ backgroundColor: s === 'pending' ? colors.accent : colors.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Txt v="small" weight="semibold" color={s === 'pending' ? colors.onAccent : colors.primary}>{s === 'none' ? 'Apply' : s === 'pending' ? 'Pending' : 'Paused'}</Txt>
                </View>
              ) : (
                <Icon name="chevron" color={colors.muted} size={18} />
              )}
            </Row>
          </Card>
        );
      })}
      {err ? <Txt v="small" color={colors.danger}>{err}</Txt> : null}
    </View>
  );
}

/** First question after signing in for the first time. */
export const MODE_INFO = INFO;
