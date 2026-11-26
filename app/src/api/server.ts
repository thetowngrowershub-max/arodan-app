/**
 * Real backend: the Arodan API server in /server (Node.js + PostgreSQL).
 * Used when EXPO_PUBLIC_API_URL is set.
 */
import { api, baseUrl, clearToken, loadToken, registerPush, setToken, signOutEverywhere } from '../lib/http';
import { categories, merchants, products } from '../data/catalog';
import { spots } from '../data/places';
import { PRICING } from '../lib/pricing';
import type { Backend, Order } from './types';

const POLL_MS = 6000;
let otpLength = 6;
let demoMode = false;

/** Replace an array's contents in place so existing imports see the new data. */
function refill<T>(arr: T[], items: T[]) {
  arr.splice(0, arr.length, ...items);
}


function make(): Backend {
  return {
    mode: 'live',
    get otpLength() {
      return otpLength;
    },

    async sendOtp(phone) {
      try {
        const r = await api<{ otpLength: number }>('POST', '/auth/otp', { phone });
        otpLength = r.otpLength ?? otpLength;
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    },

    async verifyOtp(phone, code) {
      try {
        const r = await api<{ token: string }>('POST', '/auth/verify', { phone, code });
        await setToken(r.token);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    },

    async restoreSession() {
      if (!(await loadToken())) return null;
      try {
        const me = await api<{ user: { phone: string; name: string } | null; address: any }>('GET', '/me');
        if (!me.user?.name) return null; // signed in but never finished sign-up
        void registerPush();
        return { user: { phone: me.user.phone, name: me.user.name }, address: me.address };
      } catch (e: any) {
        if (e.status === 401) {
          await clearToken();
          return null;
        }
        throw e;
      }
    },

    async saveProfile(user, address) {
      await api('PUT', '/me', { name: user.name });
      return api('PUT', '/me/address', address);
    },

    async loadCatalog() {
      const c = await api<any>('GET', '/catalog');
      refill(categories, c.categories);
      refill(merchants, c.merchants);
      // Photos uploaded in the merchant app come as /images/<id> on this server.
      refill(products, c.products.map((p: any) => ({ ...p, imageUrl: p.imageUrl?.startsWith('/') ? baseUrl + p.imageUrl : p.imageUrl })));
      refill(spots, c.spots);
      if (c.pricing) Object.assign(PRICING, c.pricing); // prices shown follow the server's settings
      demoMode = !!c.demoMode;
    },

    async placeOrder(d) {
      if (!d.address.id) throw new Error('Please save your address first.');
      return api<Order>('POST', '/orders', { addressId: d.address.id, items: d.lines, errands: d.errands, payment: d.payment });
    },

    cancelOrder: (o) => api<Order>('POST', `/orders/${o.id}/cancel`, {}),
    listOrders: () => api<Order[]>('GET', '/orders'),

    // Live tracking by polling orders still in progress.
    watchOrders(onChange) {
      const t = setInterval(async () => {
        try {
          (await api<Order[]>('GET', '/orders?active=true')).forEach(onChange);
        } catch {}
      }, POLL_MS);
      return () => clearInterval(t);
    },

    async advanceDemo(o) {
      if (!demoMode) return null;
      try {
        return await api<Order>('POST', `/orders/${o.id}/demo-advance`, {});
      } catch {
        return null;
      }
    },

    async signOut() {
      await signOutEverywhere();
    },
  };
}

export const serverBackend: Backend | null = baseUrl ? make() : null;
