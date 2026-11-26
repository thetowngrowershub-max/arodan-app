/**
 * Real backend: the Arodan API server in /server (Node.js + PostgreSQL).
 * Used when EXPO_PUBLIC_API_URL is set.
 */
import { api, baseUrl, clearToken, loadToken, registerPush, signOutEverywhere } from '../../lib/http';
import { NotRiderError } from './types';
import type { Bank, Earnings, Job, RiderBackend, RiderProfile, Wallet } from './types';


function make(): RiderBackend {
  return {
    mode: 'live',

    async apply(input) {
      const r = await api<{ rider: RiderProfile }>('POST', '/rider/apply', input);
      return r.rider;
    },

    async restoreSession() {
      if (!(await loadToken())) return null;
      try {
        const s = await api<{ rider: RiderProfile; activeJob: Job | null }>('GET', '/rider/me');
        void registerPush();
        return s;
      } catch (e: any) {
        if (e.status === 401) {
          await clearToken();
          return null;
        }
        if (e.status === 400) throw new NotRiderError(e.message);
        throw e;
      }
    },

    async setOnline(online, pos) {
      const r = await api<{ rider: RiderProfile }>('POST', '/rider/online', { online, lat: pos?.lat, lng: pos?.lng });
      return r.rider;
    },
    async sendLocation(pos) {
      await api('POST', '/rider/location', pos);
    },
    openJobs: () => api<Job[]>('GET', '/rider/jobs'),
    currentJob: async () => (await api<{ job: Job | null }>('GET', '/rider/job')).job,
    accept: (j) => api<Job>('POST', `/rider/jobs/${j.id}/accept`, {}),
    decline: async (j) => {
      await api('POST', `/rider/jobs/${j.id}/decline`, {});
    },
    release: async (j) => {
      await api('POST', `/rider/jobs/${j.id}/release`, {});
    },
    advance: (j, status) => api<Job>('POST', `/rider/jobs/${j.id}/status`, { status }),
    deliver: (j, proof, extra) =>
      api<{ earned: number; job: Job }>('POST', `/rider/jobs/${j.id}/deliver`, {
        ...proof, cashCollected: extra.cashCollected, lat: extra.pos?.lat, lng: extra.pos?.lng,
      }),
    earnings: () => api<Earnings>('GET', '/rider/earnings'),
    wallet: () => api<Wallet>('GET', '/rider/wallet'),
    banks: () => api<Bank[]>('GET', '/rider/banks'),
    checkBankAccount: (bankCode, accountNumber) =>
      api<{ bankName: string; accountName: string }>('POST', '/rider/bank-account/check', { bankCode, accountNumber }),
    saveBankAccount: (bankCode, accountNumber) => api<Wallet>('PUT', '/rider/bank-account', { bankCode, accountNumber }),
    withdraw: () => api('POST', '/rider/payouts', {}),

    async signOut() {
      await signOutEverywhere();
    },
  };
}

export const serverBackend: RiderBackend | null = baseUrl ? make() : null;
