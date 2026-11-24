import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Take a proof-of-delivery photo and shrink it to a small JPEG (about 100–250 KB)
 * so it uploads quickly on mobile data. Returns null if cancelled or not allowed.
 */
export async function takeProofPhoto(): Promise<{ uri: string; base64: string } | { error: string } | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { error: 'Allow camera access in your phone settings to take the delivery photo.' };
  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
  if (shot.canceled || !shot.assets?.[0]) return null;
  const a = shot.assets[0];
  const resize = (a.width ?? 0) > (a.height ?? 0) ? { width: 1280 } : { height: 1280 };
  const small = await manipulateAsync(a.uri, [{ resize }], { compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!small.base64) return { error: 'Could not read the photo. Try again.' };
  return { uri: small.uri, base64: small.base64 };
}
