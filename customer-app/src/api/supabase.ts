/**
 * Real backend on Supabase (Postgres + phone sign-in + realtime).
 * Database schema and server-side pricing live in /supabase at the repo root.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { categories, CategoryId, ErrandTypeId, merchants, products } from '../data/catalog';
import { spots } from '../data/places';
import { PRICING } from '../lib/pricing';
import type { Address, Backend, Order, OrderStatus, Rider } from './types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** "0803 123 4567" or "+234 803…" → "+2348031234567" */
export function toE164(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('234')) return '+' + d;
  if (d.startsWith('0')) return '+234' + d.slice(1);
  return '+234' + d;
}

const ORDER_SELECT = '*, order_items(*), order_errands(*), order_events(status, at), rider:riders(*)';

function toAddress(a: any): Address {
  return {
    id: a.id,
    label: a.label,
    estate: a.estate,
    street: a.street,
    houseNo: a.house_no,
    landmark: a.landmark,
    gateName: a.gate_name,
    gateCode: a.gate_code,
    gateNote: a.gate_note,
  };
}

function toRider(r: any): Rider | undefined {
  if (!r) return undefined;
  const checks = [r.nin_verified && 'NIN verified', r.guarantor_confirmed && 'Guarantor confirmed', r.address_visited && 'Home address visited'].filter(Boolean) as string[];
  return {
    name: r.display_name,
    phone: r.phone,
    vehicle: r.vehicle === 'bicycle' ? 'Bicycle' : 'Motorbike',
    plate: r.plate,
    rating: Number(r.rating),
    trips: r.trips,
    checks,
  };
}

function toOrder(o: any): Order {
  const statusTimes: Order['statusTimes'] = {};
  for (const e of o.order_events ?? []) statusTimes[e.status as OrderStatus] = new Date(e.at).getTime();
  return {
    id: o.id,
    code: o.code,
    createdAt: new Date(o.created_at).getTime(),
    lines: (o.order_items ?? []).map((i: any) => ({ productId: i.product_id, qty: i.qty })),
    errands: (o.order_errands ?? []).map((e: any) => ({
      id: String(e.id),
      type: e.type as ErrandTypeId,
      title: e.title,
      details: e.details,
      pickupSpotId: e.spot_id,
      estMin: e.est_min,
      budget: e.budget,
    })),
    address: o.address,
    quote: o.quote,
    bill: {
      items: o.items_total,
      errandPurchases: o.errand_purchases,
      errandFees: o.errand_fees,
      serviceCharge: o.service_charge,
      delivery: o.delivery_fee,
      smallOrderFee: o.small_order_fee,
      total: o.total,
    },
    payment: o.payment_method,
    status: o.status,
    statusTimes,
    rider: toRider(o.rider),
    etaMin: o.eta_min,
  };
}

/** Replace an array's contents in place so existing imports see the new data. */
function refill<T>(arr: T[], items: T[]) {
  arr.splice(0, arr.length, ...items);
}

function make(sb: SupabaseClient): Backend {
  const fetchOrder = async (id: string) => {
    const { data, error } = await sb.from('orders').select(ORDER_SELECT).eq('id', id).single();
    if (error) throw error;
    return toOrder(data);
  };

  return {
    mode: 'live',
    otpLength: Number(process.env.EXPO_PUBLIC_OTP_LENGTH ?? 6),

    async sendOtp(phone) {
      const { error } = await sb.auth.signInWithOtp({ phone: toE164(phone) });
      return error ? { ok: false, error: error.message } : { ok: true };
    },

    async verifyOtp(phone, code) {
      const { error } = await sb.auth.verifyOtp({ phone: toE164(phone), token: code, type: 'sms' });
      return error ? { ok: false, error: 'That code is not right or has expired. Try again.' } : { ok: true };
    },

    async restoreSession() {
      const { data } = await sb.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return null;
      const [{ data: prof }, { data: addr }] = await Promise.all([
        sb.from('profiles').select('phone, full_name').eq('id', uid).single(),
        sb.from('addresses').select('*').eq('user_id', uid).order('is_default', { ascending: false }).order('created_at', { ascending: false }).limit(1),
      ]);
      if (!prof?.full_name) return null; // signed in but never finished sign-up
      return { user: { phone: prof.phone ?? '', name: prof.full_name }, address: addr?.[0] ? toAddress(addr[0]) : null };
    },

    async saveProfile(user, a) {
      const { data: s } = await sb.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) throw new Error('Not signed in');
      const { error: pe } = await sb.from('profiles').update({ full_name: user.name }).eq('id', uid);
      if (pe) throw pe;
      const row = {
        user_id: uid,
        label: a.label,
        estate: a.estate,
        street: a.street,
        house_no: a.houseNo,
        landmark: a.landmark,
        gate_name: a.gateName,
        gate_code: a.gateCode,
        gate_note: a.gateNote,
      };
      const q = a.id ? sb.from('addresses').update(row).eq('id', a.id) : sb.from('addresses').insert(row);
      const { data, error } = await q.select('*').single();
      if (error) throw error;
      return toAddress(data);
    },

    async loadCatalog() {
      const [cats, mers, prods, sp, cfg] = await Promise.all([
        sb.from('categories').select('*').order('sort'),
        sb.from('merchants').select('*'),
        sb.from('products').select('*').order('popular', { ascending: false }).order('name'),
        sb.from('errand_spots').select('*').order('sort'),
        sb.from('pricing_config').select('config').eq('id', 1).single(),
      ]);
      const err = cats.error || mers.error || prods.error || sp.error || cfg.error;
      if (err) throw err;
      refill(categories, cats.data!.map((c) => ({ id: c.id as CategoryId, name: c.name, emoji: c.emoji })));
      refill(merchants, mers.data!.map((m) => ({ id: m.id, name: m.name, area: m.area, distanceKm: Number(m.distance_km), durationMin: m.duration_min })));
      refill(products, prods.data!.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category_id as CategoryId,
        price: p.price,
        unit: p.unit,
        weightKg: Number(p.weight_kg),
        longestSideCm: p.longest_side_cm ?? undefined,
        emoji: p.emoji,
        merchantId: p.merchant_id,
        rating: Number(p.rating),
        popular: p.popular,
        description: p.description,
      })));
      refill(spots, sp.data!.map((s) => ({ id: s.id, name: s.name, distanceKm: Number(s.distance_km), durationMin: s.duration_min })));
      // Prices shown in the app follow the server's settings.
      Object.assign(PRICING, cfg.data!.config);
    },

    async placeOrder(d) {
      if (!d.address.id) throw new Error('Address not saved');
      const { data, error } = await sb.rpc('place_order', {
        p_address_id: d.address.id,
        p_items: d.lines.map((l) => ({ product_id: l.productId, qty: l.qty })),
        p_errands: d.errands.map((e) => ({ type: e.type, title: e.title, details: e.details, spot_id: e.pickupSpotId, est_min: e.estMin, budget: e.budget })),
        p_payment: d.payment,
      });
      if (error) throw error;
      return fetchOrder((data as any).id);
    },

    async cancelOrder(o) {
      const { error } = await sb.rpc('set_order_status', { p_order_id: o.id, p_status: 'cancelled' });
      if (error) throw error;
      return fetchOrder(o.id);
    },

    async listOrders() {
      const { data, error } = await sb.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data.map(toOrder);
    },

    watchOrders(onChange) {
      const ch = sb
        .channel('my-orders')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, async (payload) => {
          try {
            onChange(await fetchOrder((payload.new as any).id));
          } catch {}
        })
        .subscribe();
      return () => {
        sb.removeChannel(ch);
      };
    },

    async advanceDemo(o) {
      const { error } = await sb.rpc('demo_advance_order', { p_order_id: o.id });
      if (error) return null;
      return fetchOrder(o.id);
    },

    async signOut() {
      await sb.auth.signOut();
    },
  };
}

export const supabaseBackend: Backend | null =
  url && anonKey
    ? make(
        createClient(url, anonKey, {
          auth: {
            storage: Platform.OS === 'web' ? undefined : AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
          },
        }),
      )
    : null;
