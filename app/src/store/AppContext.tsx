import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Address, CartLine, Errand, Order, User } from '../api/types';
import { backend } from '../api';
import { onNotification } from '../lib/push';
import { forgetMode } from '../roles/ModeContext';

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
  /** Signs out of the whole app (shop, rider and merchant parts share one sign-in). */
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

/** Demo only: how long an order waits before moving to its next step. */
const STEP_MS = 9000;

export function AppProvider({ children, initialUser = null, initialAddress = null }: { children: React.ReactNode; initialUser?: User | null; initialAddress?: Address | null }) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [address, setAddress] = useState<Address | null>(initialAddress);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartErrands, setCartErrands] = useState<Errand[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

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

  const addOrder = useCallback((o: Order) => setOrders((os) => [o, ...os.filter((x) => x.id !== o.id)]), []);
  const updateOrder = useCallback((o: Order) => setOrders((os) => os.map((x) => (x.id === o.id ? o : x))), []);

  // Load past orders and listen for live status changes once signed in.
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return;
    backend.listOrders().then(setOrders).catch(() => {});
    const unwatch = backend.watchOrders(updateOrder);
    // Order status pushes: reload now rather than at the next poll.
    const off = onNotification((data) => {
      if (data.type === 'order') backend.listOrders().then(setOrders).catch(() => {});
    });
    return () => {
      unwatch();
      off();
    };
  }, [signedIn, updateOrder]);

  // Demo tracking: move active orders one step at a time. On the real backend this only works while
  // the server's demo_mode is on; otherwise riders move orders along from the rider app.
  useEffect(() => {
    const busy = new Set<string>();
    let demoOff = false;
    const t = setInterval(() => {
      if (demoOff) return;
      for (const o of ordersRef.current) {
        if (o.status === 'cancelled' || o.status === 'delivered' || busy.has(o.id)) continue;
        const since = Date.now() - (o.statusTimes[o.status] ?? o.createdAt);
        if (since < STEP_MS) continue;
        busy.add(o.id);
        backend
          .advanceDemo(o)
          .then((n) => {
            if (n) updateOrder(n);
            else demoOff = true;
          })
          .finally(() => busy.delete(o.id));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [updateOrder]);

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
      signOut: async () => {
        await backend.signOut();
        await forgetMode();
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
