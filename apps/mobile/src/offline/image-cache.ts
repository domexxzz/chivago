const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES = 30;
export { MAX_IMAGE_BYTES, MAX_IMAGES };

export function publicImageUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      || url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch { return null; }
}

/** Returns a local URI when a safe public cover can be saved, otherwise the original URL. */
export async function cachedImageUri(input: string): Promise<string> {
  const url = publicImageUrl(input);
  if (!url) return input;
  try {
    return typeof navigator !== 'undefined' && navigator.product === 'ReactNative'
      ? await (await import('./image-native.ts')).nativeImageUri(url)
      : await (await import('./image-web.ts')).webImageUri(url);
  } catch { return input; }
}

export async function clearCachedImages(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative')
    await (await import('./image-native.ts')).clearNativeImages();
  else await (await import('./image-web.ts')).clearWebImages();
}
