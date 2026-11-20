import { Linking, Platform } from 'react-native';
import type { Dropoff, Pickup } from '../api/types';

// Merchants and addresses don't have map pins yet, so we search by name and area in Lagos.
export const pickupQuery = (p: Pickup) => [p.name, p.area, 'Lagos'].filter(Boolean).join(', ');
export const dropoffQuery = (d: Dropoff) =>
  [d.houseNo && `${d.houseNo} ${d.street}`, !d.houseNo && d.street, d.estate, 'Lagos'].filter(Boolean).join(', ');

/** Open turn-by-turn directions in Google Maps (or Apple Maps on iPhone if Google Maps is missing). */
export async function navigateTo(query: string) {
  const q = encodeURIComponent(query);
  const google = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
  if (Platform.OS === 'ios') {
    const app = `comgooglemaps://?daddr=${q}&directionsmode=driving`;
    if (await Linking.canOpenURL(app).catch(() => false)) return Linking.openURL(app);
    return Linking.openURL(`http://maps.apple.com/?daddr=${q}`);
  }
  return Linking.openURL(google);
}

export const call = (phone: string) => Linking.openURL('tel:' + phone.replace(/[^\d+]/g, ''));
