/**
 * One sign-in for the whole app: the shop, rider and merchant parts all call the
 * Arodan API server through here, with the same saved token and push registration.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getPushToken, PUSH_APP } from './push';

export const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const TOKEN_KEY = 'arodan.token';

let token: string | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
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

export const hasToken = () => !!token;

/** Loads the saved token (once). Returns false when signed out. */
export async function loadToken() {
  token = token ?? (await AsyncStorage.getItem(TOKEN_KEY));
  return !!token;
}

export async function setToken(t: string) {
  token = t;
  await AsyncStorage.setItem(TOKEN_KEY, t);
  void registerPush();
}

export async function clearToken() {
  token = null;
  await AsyncStorage.removeItem(TOKEN_KEY);
}

// ── Push notifications: one token per phone covers shopping, riding and selling ──
let pushToken: string | null = null;
let pushRegistered = false;
export async function registerPush() {
  if (pushRegistered) return;
  try {
    pushToken = await getPushToken();
    if (pushToken && token) {
      await api('POST', '/push/register', { token: pushToken, app: PUSH_APP, platform: Platform.OS });
      pushRegistered = true;
    }
  } catch {
    // Not fatal: the app still refreshes on a timer.
  }
}

export async function signOutEverywhere() {
  if (pushToken && token) await api('POST', '/push/unregister', { token: pushToken }).catch(() => {});
  pushRegistered = false;
  await clearToken();
}
