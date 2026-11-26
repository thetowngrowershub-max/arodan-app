import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { backend } from '../api';
import type { Area, Category, Listing, ListingInput, Merchant, MerchantOrder, OrderAction, Owner } from '../api/types';
import { onNotification } from '../../lib/push';

const POLL_MS = 8000;

interface AppState {
  owner: Owner | null;
  merchant: Merchant | null;
  categories: Category[];
  areas: Area[];
  listings: Listing[];
  orders: MerchantOrder[];
  ordersError: string;
  setSession: (owner: Owner | null, merchant: Merchant | null) => void;
  setMerchant: (m: Merchant) => void;
  refreshOrders: () => Promise<void>;
  refreshListings: () => Promise<void>;
  saveListing: (id: string | undefined, input: Partial<ListingInput>) => Promise<Listing>;
  actOnOrder: (id: string, action: OrderAction, reason?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ initial, categories, areas, children }: { initial: { owner: Owner | null; merchant: Merchant | null }; categories: Category[]; areas: Area[]; children: React.ReactNode }) {
  const [owner, setOwner] = useState(initial.owner);
  const [merchant, setMerchantState] = useState(initial.merchant);
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [ordersError, setOrdersError] = useState('');
  const seenNew = useRef<Set<string> | null>(null);

  const refreshOrders = useCallback(async () => {
    try {
      const list = await backend.listOrders();
      setOrdersError('');
      // Buzz when an order arrives that we haven't seen before (not on first load).
      const fresh = list.filter((o) => o.status === 'new').map((o) => o.id);
      if (seenNew.current && fresh.some((id) => !seenNew.current!.has(id))) Vibration.vibrate([0, 300, 150, 300]);
      seenNew.current = new Set([...(seenNew.current ?? []), ...fresh]);
      setOrders(list);
    } catch (e: any) {
      setOrdersError(e?.message ?? 'Could not load orders');
    }
  }, []);

  const refreshListings = useCallback(async () => {
    setListings(await backend.listListings());
  }, []);

  const live = !!merchant;
  useEffect(() => {
    if (!live) return;
    refreshOrders();
    refreshListings().catch(() => {});
    const t = setInterval(refreshOrders, POLL_MS);
    // New order / rider coming / cancelled: refresh now rather than at the next poll.
    const off = onNotification((data) => {
      if (data.type === 'order') refreshOrders();
    });
    return () => {
      clearInterval(t);
      off();
    };
  }, [live, refreshOrders, refreshListings]);

  const saveListing = useCallback(async (id: string | undefined, input: Partial<ListingInput>) => {
    const saved = id ? await backend.updateListing(id, input) : await backend.createListing(input as ListingInput);
    setListings((ls) => (id ? ls.map((l) => (l.id === id ? saved : l)) : [saved, ...ls]));
    return saved;
  }, []);

  const actOnOrder = useCallback(async (id: string, action: OrderAction, reason?: string) => {
    const o = await backend.orderAction(id, action, reason);
    setOrders((os) => os.map((x) => (x.id === id ? o : x)));
    if (action === 'decline') refreshListings().catch(() => {}); // stock goes back
  }, [refreshListings]);

  const signOut = useCallback(async () => {
    await backend.signOut();
    setOwner(null);
    setMerchantState(null);
    setListings([]);
    setOrders([]);
    seenNew.current = null;
  }, []);

  const value = useMemo<AppState>(() => ({
    owner, merchant, categories, areas, listings, orders, ordersError,
    setSession: (o, m) => { setOwner(o); setMerchantState(m); },
    setMerchant: setMerchantState,
    refreshOrders, refreshListings, saveListing, actOnOrder, signOut,
  }), [owner, merchant, categories, areas, listings, orders, ordersError, refreshOrders, refreshListings, saveListing, actOnOrder, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
};
