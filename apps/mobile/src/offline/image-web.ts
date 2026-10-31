import { MAX_IMAGE_BYTES, MAX_IMAGES } from './image-cache.ts';

const CACHE = 'chivago-public-covers-v1';
export async function clearWebImages(): Promise<void> { if (typeof caches !== 'undefined') await caches.delete(CACHE); }
export async function webImageUri(url: string): Promise<string> {
  if (typeof caches === 'undefined') return url;
  const cache = await caches.open(CACHE);
  let response = await cache.match(url);
  if (!response) {
    const fetched = await fetch(url);
    const size = Number(fetched.headers.get('content-length'));
    if (!fetched.ok || !/^image\/(jpeg|png|webp|gif)$/i.test(fetched.headers.get('content-type') ?? '')
      || (Number.isFinite(size) && size > MAX_IMAGE_BYTES)) return url;
    const blob = await fetched.blob();
    if (blob.size > MAX_IMAGE_BYTES) return url;
    const keys = await cache.keys();
    if (keys.length >= MAX_IMAGES) await cache.delete(keys[0]);
    await cache.put(url, new Response(blob, { headers: { 'content-type': blob.type } }));
    response = await cache.match(url);
  }
  return response ? URL.createObjectURL(await response.blob()) : url;
}
