import * as FileSystem from 'expo-file-system/legacy';
import { MAX_IMAGE_BYTES, MAX_IMAGES } from './image-cache.ts';

const folder = `${FileSystem.documentDirectory}chivago-public-covers/`;
export async function clearNativeImages(): Promise<void> {
  if (FileSystem.documentDirectory) await FileSystem.deleteAsync(folder, { idempotent: true });
}
function name(url: string, mime: string): string {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index++) hash = Math.imul(hash ^ url.charCodeAt(index), 16777619);
  const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
  return `${(hash >>> 0).toString(16)}-${url.length}.${extension}`;
}
export async function nativeImageUri(url: string): Promise<string> {
  if (!FileSystem.documentDirectory) return url;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const prefix = name(url, 'image/jpeg').replace(/\.jpg$/, '');
  for (const ext of ['jpg', 'png', 'webp', 'gif']) {
    const candidate = `${folder}${prefix}.${ext}`;
    if ((await FileSystem.getInfoAsync(candidate)).exists) return candidate;
  }
  const response = await fetch(url, { method: 'HEAD' });
  const mime = response.headers.get('content-type') ?? '';
  const declared = Number(response.headers.get('content-length'));
  if (!response.ok || !/^image\/(jpeg|png|webp|gif)(?:;|$)/i.test(mime)
    || !Number.isFinite(declared) || declared <= 0 || declared > MAX_IMAGE_BYTES) return url;
  const path = folder + name(url, mime);
  const temp = `${path}.part`;
  try {
    await FileSystem.downloadAsync(url, temp);
    const info = await FileSystem.getInfoAsync(temp);
    if (!info.exists || !info.size || info.size > MAX_IMAGE_BYTES) return url;
    await FileSystem.moveAsync({ from: temp, to: path });
    const names = await FileSystem.readDirectoryAsync(folder);
    if (names.length > MAX_IMAGES) for (const old of names.filter((item) => item !== name(url, mime)).slice(0, names.length - MAX_IMAGES))
      await FileSystem.deleteAsync(folder + old, { idempotent: true });
    return path;
  } finally { await FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => undefined); }
}
