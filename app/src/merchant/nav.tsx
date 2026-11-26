import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';

export type Tab = 'orders' | 'products' | 'sales' | 'shop';

export type Route =
  | { name: 'register' }
  | { name: 'tabs'; tab: Tab }
  | { name: 'order'; id: string }
  | { name: 'listing'; id?: string } // no id = new listing
  | { name: 'editShop' };

interface Nav {
  route: Route;
  push: (r: Route) => void;
  pop: () => void;
  reset: (r: Route) => void;
  canGoBack: boolean;
}

const NavCtx = createContext<Nav | null>(null);

/** Small stack navigator, the same as the customer app's. */
export function NavProvider({ initial, children }: { initial: Route; children: React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>([initial]);
  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback((r: Route) => setStack([r]), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const value = useMemo(() => ({ route: stack[stack.length - 1], push, pop, reset, canGoBack: stack.length > 1 }), [stack, push, pop, reset]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export const useNav = () => {
  const v = useContext(NavCtx);
  if (!v) throw new Error('useNav outside NavProvider');
  return v;
};
