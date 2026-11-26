/**
 * Real backend: the Arodan API server in /server. Used when EXPO_PUBLIC_API_URL is set.
 */
import { api, baseUrl, clearToken, loadToken, registerPush, signOutEverywhere } from '../../lib/http';
import type { Backend, Category, Area, Merchant, Listing, MerchantOrder, Sales } from './types';


function make(): Backend {
  return {
    mode: 'live',
    async restoreSession() {
      if (!(await loadToken())) return null;
      try {
        const m = await api<any>('GET', '/merchant/me');
        void registerPush();
        return m;
      } catch (e: any) {
        if (e.status === 401) {
          await clearToken();
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
      await signOutEverywhere();
    },
  };
}

export const serverBackend: Backend | null = baseUrl ? make() : null;
