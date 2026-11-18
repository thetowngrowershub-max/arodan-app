import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Address, CartLine, Errand, Order, User } from '../api/types';
import { ORDER_STEPS } from '../api/types';

interface AppState {
  user: User | null;
  address: Address | null;
  cart: CartLine[];
  cartErrands: Errand[]; // errands attached to the next shop checkout
  orders: Order[];
  setUser: (u: User | null) => void;
  setAddress: (a: Address) => void;
  addToCart: (productId: string, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  addCartErrand: (e: Errand) => void;
  removeCartErrand: (id: string) => void;
  addOrder: (o: Order) => void;
  updateOrder: (o: Order) => void;
  signOut: () => void;
}

const Ctx = createContext<AppState | null>(null);

/** Demo only: how fast a placed order moves to the next step. */
const STEP_MS = 9000;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartErrands, setCartErrands] = useState<Errand[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const addToCart = useCallback((productId: string, qty = 1) => {
    setCart((c) => {
      const f = c.find((l) => l.productId === productId);
      if (f) return c.map((l) => (l.productId === productId ? { ...l, qty: l.qty + qty } : l));
      return [...c, { productId, qty }];
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setCart((c) => (qty <= 0 ? c.filter((l) => l.productId !== productId) : c.map((l) => (l.productId === productId ? { ...l, qty } : l))));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCartErrands([]);
  }, []);

  const addOrder = useCallback((o: Order) => setOrders((os) => [o, ...os]), []);
  const updateOrder = useCallback((o: Order) => setOrders((os) => os.map((x) => (x.id === o.id ? o : x))), []);

  // Simulated live tracking: advance active orders one step at a time.
  useEffect(() => {
    const t = setInterval(() => {
      setOrders((os) => {
        let changed = false;
        const next = os.map((o) => {
          if (o.status === 'cancelled' || o.status === 'delivered') return o;
          const i = ORDER_STEPS.indexOf(o.status);
          const since = Date.now() - (o.statusTimes[o.status] ?? o.createdAt);
          if (since < STEP_MS) return o;
          changed = true;
          const status = ORDER_STEPS[i + 1];
          return { ...o, status, statusTimes: { ...o.statusTimes, [status]: Date.now() } };
        });
        return changed ? next : os;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      user,
      address,
      cart,
      cartErrands,
      orders,
      setUser,
      setAddress,
      addToCart,
      setQty,
      clearCart,
      addCartErrand: (e) => setCartErrands((x) => [...x, e]),
      removeCartErrand: (id) => setCartErrands((x) => x.filter((e) => e.id !== id)),
      addOrder,
      updateOrder,
      signOut: () => {
        setUser(null);
        setAddress(null);
        setCart([]);
        setCartErrands([]);
        setOrders([]);
      },
    }),
    [user, address, cart, cartErrands, orders, addToCart, setQty, clearCart, addOrder, updateOrder],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
};
