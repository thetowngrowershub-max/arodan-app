/**
 * Push notifications through Expo's push service.
 *
 * Works in a development or store build of the app with an EAS project id in app.json
 * (extra.eas.projectId, added by `eas init`). Expo Go, the web preview and simulators can't receive
 * push notifications, so there this quietly does nothing and the app keeps refreshing on a timer.
 * Setup steps: docs/push-and-payouts-setup.md.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';

export const PUSH_APP = 'merchant' as const;

if (Platform.OS !== 'web') {
  // Show notifications even while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function setUpChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Order updates',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

/**
 * Asks for permission (once) and returns this phone's Expo push token,
 * or null when push isn't possible here or the user said no.
 */
export async function getPushToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return null;
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null; // Expo Go
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    await setUpChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/** Calls fn when a notification arrives while the app is open, or when one is tapped. Returns an unsubscribe function. */
export function onNotification(fn: (data: Record<string, unknown>) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const a = Notifications.addNotificationReceivedListener((n) => fn((n.request.content.data ?? {}) as Record<string, unknown>));
  const b = Notifications.addNotificationResponseReceivedListener((r) => fn((r.notification.request.content.data ?? {}) as Record<string, unknown>));
  return () => {
    a.remove();
    b.remove();
  };
}
