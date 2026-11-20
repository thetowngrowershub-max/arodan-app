/**
 * Real backend: the Arodan API server in /server (Node.js + PostgreSQL).
 * Used when EXPO_PUBLIC_API_URL is set.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotRiderError } from './types';
import type { Earnings, Job, RiderBackend, RiderProfile } from './types';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const TOKEN_KEY = 'arodan.rider.token';

let token: string | null = null;
let otpLength = 6;

class ApiError extends Error {
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

function make(): RiderBackend {
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
        return await api<{ rider: RiderProfile; activeJob: Job | null }>('GET', '/rider/me');
      } catch (e: any) {
        if (e.status === 401) {
          token = null;
          await AsyncStorage.removeItem(TOKEN_KEY);
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

    async signOut() {
      token = null;
      await AsyncStorage.removeItem(TOKEN_KEY);
    },
  };
}

export const serverBackend: RiderBackend | null = baseUrl ? make() : null;
