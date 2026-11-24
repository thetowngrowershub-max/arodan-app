import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { backend } from '../api';
import type { Job, Position, RiderProfile } from '../api/types';
import { currentPosition, ensureLocationPermission, watchPosition } from '../lib/location';
import { onNotification } from '../lib/push';

const OFFER_POLL_MS = 5000;
const JOB_POLL_MS = 15000;

interface RiderState {
  rider: RiderProfile | null;
  setRider: (r: RiderProfile | null) => void;
  activeJob: Job | null;
  setActiveJob: (j: Job | null) => void;
  offers: Job[];
  /** Last known position (null until the phone gives one). */
  position: Position | null;
  /** True when the rider refused location access. */
  locationDenied: boolean;
  setOnline: (online: boolean) => Promise<void>;
  refreshOffers: () => Promise<void>;
  dismissOffer: (id: string) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<RiderState | null>(null);

export function RiderProvider({ initialRider, initialJob, children }: { initialRider: RiderProfile | null; initialJob: Job | null; children: React.ReactNode }) {
  const [rider, setRider] = useState(initialRider);
  const [activeJob, setActiveJob] = useState(initialJob);
  const [offers, setOffers] = useState<Job[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [foreground, setForeground] = useState(true);
  const posRef = useRef<Position | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);

  const online = !!rider?.online;
  const sharing = online || !!activeJob;

  // Share live location while online or on a job.
  useEffect(() => {
    if (!sharing || !rider) return;
    let stop = () => {};
    let cancelled = false;
    (async () => {
      if (!(await ensureLocationPermission())) {
        setLocationDenied(true);
        return;
      }
      setLocationDenied(false);
      const unsub = await watchPosition((p) => {
        posRef.current = p;
        setPosition(p);
        backend.sendLocation(p).catch(() => {});
      });
      if (cancelled) unsub();
      else stop = unsub;
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [sharing, rider?.id]);

  const refreshOffers = useCallback(async () => {
    if (!online || activeJob) return setOffers([]);
    try {
      setOffers(await backend.openJobs());
    } catch {}
  }, [online, activeJob]);

  // New jobs: poll while online, free, and the app is open.
  useEffect(() => {
    if (!online || activeJob || !foreground) {
      if (!online || activeJob) setOffers([]);
      return;
    }
    refreshOffers();
    const t = setInterval(refreshOffers, OFFER_POLL_MS);
    return () => clearInterval(t);
  }, [online, activeJob, foreground, refreshOffers]);

  // A push notification (new job, job cancelled, order ready) refreshes straight away instead of waiting for the timer.
  useEffect(
    () =>
      onNotification(async (data) => {
        if (data.type !== 'job' || backend.mode === 'mock') return;
        refreshOffers();
        if (activeJob) {
          try {
            setActiveJob(await backend.currentJob());
          } catch {}
        }
      }),
    [refreshOffers, activeJob?.id],
  );

  // Keep the job in step with the server (e.g. ops cancelled it).
  useEffect(() => {
    if (!activeJob || !foreground || backend.mode === 'mock') return;
    const t = setInterval(async () => {
      try {
        const j = await backend.currentJob();
        setActiveJob(j);
      } catch {}
    }, JOB_POLL_MS);
    return () => clearInterval(t);
  }, [activeJob?.id, foreground]);

  const setOnline = useCallback(async (on: boolean) => {
    let pos: Position | null = null;
    if (on) {
      const ok = await ensureLocationPermission();
      setLocationDenied(!ok);
      if (!ok) throw new Error('Allow location access so customers and dispatch can see where you are.');
      pos = await currentPosition();
      if (pos) {
        posRef.current = pos;
        setPosition(pos);
      }
    }
    setRider(await backend.setOnline(on, pos));
  }, []);

  const dismissOffer = useCallback((id: string) => setOffers((xs) => xs.filter((x) => x.id !== id)), []);

  const signOut = useCallback(async () => {
    if (rider?.online) await backend.setOnline(false).catch(() => {});
    await backend.signOut();
    setRider(null);
    setActiveJob(null);
    setOffers([]);
  }, [rider?.online]);

  const value = useMemo(
    () => ({ rider, setRider, activeJob, setActiveJob, offers, position, locationDenied, setOnline, refreshOffers, dismissOffer, signOut }),
    [rider, activeJob, offers, position, locationDenied, setOnline, refreshOffers, dismissOffer, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRider = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRider outside RiderProvider');
  return v;
};
