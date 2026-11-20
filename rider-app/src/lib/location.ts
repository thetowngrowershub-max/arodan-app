import * as Location from 'expo-location';
import type { Position } from '../api/types';

/** Ask for location permission (while the app is in use). Returns false if the rider says no. */
export async function ensureLocationPermission(): Promise<boolean> {
  try {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.granted) return true;
    const r = await Location.requestForegroundPermissionsAsync();
    return r.granted;
  } catch {
    return false;
  }
}

export async function currentPosition(): Promise<Position | null> {
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading, speed: p.coords.speed };
  } catch {
    return null;
  }
}

/**
 * Follow the rider's position while the app is open. Calls back at most every `minMs`.
 * (Sharing while the phone is locked needs a development build with background location; see README.)
 */
export async function watchPosition(onPos: (p: Position) => void, minMs = 15000): Promise<() => void> {
  let last = 0;
  try {
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 20 },
      (p) => {
        const now = Date.now();
        if (now - last < minMs) return;
        last = now;
        onPos({ lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading, speed: p.coords.speed });
      },
    );
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
