import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Lets the merchant take or choose a product photo, then shrinks it to a square-ish JPEG about
 * 1000 px wide (usually 100–250 KB) so it uploads quickly on mobile data.
 * Returns base64 JPEG data, or null if they cancelled.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<{ base64: string; uri: string } | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(source === 'camera' ? 'Allow camera access in Settings to take photos.' : 'Allow photo access in Settings to choose photos.');
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const ctx = ImageManipulator.manipulate(a.uri);
  if ((a.width ?? 0) > 1000) ctx.resize({ width: 1000 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('Could not read that photo. Try another.');
  return { base64: out.base64, uri: out.uri };
}
