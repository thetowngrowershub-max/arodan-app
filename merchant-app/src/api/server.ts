/**
 * Real backend: the Arodan API server in /server. Used when EXPO_PUBLIC_API_URL is set.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Backend, Category, Area, Merchant, Listing, MerchantOrder, Sales } from './types';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const TOKEN_KEY = 'arodan.merchant.token';

let token: string | null = null;
let otpLength = 6;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No internet connection. Check your network and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong. Try again.');
  return data as T;
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
        token = r.token;
        await AsyncStorage.setItem(TOKEN_KEY, r.token);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    },
    async restoreSession() {
      token = token ?? (await AsyncStorage.getItem(TOKEN_KEY));
      if (!token) return null;
      try {
        return await api('GET', '/merchant/me');
      } catch (e: any) {
        if (e.status === 401) {
          token = null;
          await AsyncStorage.removeItem(TOKEN_KEY);
          return null;
        }
        throw e;
      }
    },
    async loadReference() {
      const [cat, areas] = await Promise.all([api<{ categories: Category[] }>('GET', '/catalog'), api<Area[]>('GET', '/merchant/areas')]);
      return { categories: cat.categories, areas };
    },
    register: (input) => api<Merchant>('POST', '/merchant/register', input),
    updateMerchant: (patch) => api<Merchant>('PUT', '/merchant/me', patch),
    listListings: () => api<Listing[]>('GET', '/merchant/products'),
    createListing: (input) => api<Listing>('POST', '/merchant/products', input),
    updateListing: (id, patch) => api<Listing>('PUT', `/merchant/products/${encodeURIComponent(id)}`, patch),
    async uploadImage(base64) {
      return (await api<{ url: string }>('POST', '/merchant/images', { data: base64 })).url;
    },
    imageSrc: (url) => (!url ? undefined : url.startsWith('/') ? baseUrl + url : url),
    listOrders: (activeOnly) => api<MerchantOrder[]>('GET', `/merchant/orders${activeOnly ? '?active=true' : ''}`),
    orderAction: (id, action, reason) => api<MerchantOrder>('POST', `/merchant/orders/${id}/${action}`, { reason }),
    sales: (days) => api<Sales>('GET', `/merchant/sales?days=${days}`),
    async signOut() {
      token = null;
      await AsyncStorage.removeItem(TOKEN_KEY);
    },
  };
}

export const serverBackend: Backend | null = baseUrl ? make() : null;
