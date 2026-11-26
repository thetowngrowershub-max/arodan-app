import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchRoles } from './api';
import { NO_ROLES, type Mode, type Roles } from './types';

const MODE_KEY = 'arodan.mode';

export async function savedMode(): Promise<Mode> {
  const m = await AsyncStorage.getItem(MODE_KEY).catch(() => null);
  return m === 'ride' || m === 'sell' ? m : 'shop';
}

interface ModeState {
  mode: Mode;
  /** Show the shop, rider or merchant part of the app (remembered for next time). */
  setMode: (m: Mode) => void;
  /** Go back to the mode used before this one (e.g. leaving an application form). */
  back: () => void;
  roles: Roles;
  refreshRoles: () => Promise<Roles>;
  /** Start the app again from the beginning (after signing out). */
  restart: () => void;
}

const Ctx = createContext<ModeState | null>(null);

export function ModeProvider({ initialMode, initialRoles, restart, children }: { initialMode: Mode; initialRoles: Roles; restart: () => void; children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>(initialMode);
  const [roles, setRoles] = useState<Roles>(initialRoles);
  const prev = useRef<Mode>('shop');
  const current = useRef<Mode>(initialMode);
  const setMode = useCallback((m: Mode) => {
    if (m !== current.current) prev.current = current.current;
    current.current = m;
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
  }, []);
  const back = useCallback(() => setMode(prev.current === current.current ? 'shop' : prev.current), [setMode]);
  const refreshRoles = useCallback(async () => {
    const r = await fetchRoles();
    setRoles(r);
    return r;
  }, []);
  const value = useMemo(() => ({ mode, setMode, back, roles, refreshRoles, restart }), [mode, setMode, back, roles, refreshRoles, restart]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMode = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMode outside ModeProvider');
  return v;
};

/** Signing out clears the saved mode so the next person starts in the shop. */
export async function forgetMode() {
  await AsyncStorage.removeItem(MODE_KEY).catch(() => {});
}

export { NO_ROLES };
