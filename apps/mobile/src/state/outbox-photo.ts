/**
 * Native camera results live in cache and may disappear after restart. Keep a
 * durable app-owned copy before queuing. Web object URLs cannot be made
 * durable without IndexedDB, so Phase 9's browser sync store owns that path.
 */
export async function persistEvidencePhotos(
  photos: { uri: string; mimeType?: string | null }[],
  requestId: string,
): Promise<{ uri: string; mimeType?: string | null }[]> {
  if (typeof navigator === 'undefined' || navigator.product !== 'ReactNative') return photos;
  const { persistOutboxPhoto } = await import('./outbox-photo-native.ts');
  return Promise.all(photos.map(async (photo, index) => ({
    ...photo, uri: await persistOutboxPhoto(photo.uri, requestId, index),
  })));
}

export async function deletePersistedEvidencePhotos(photos: { uri: string }[]): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.product !== 'ReactNative') return;
  const { deleteOutboxPhoto } = await import('./outbox-photo-native.ts');
  await Promise.all(photos.map((photo) => deleteOutboxPhoto(photo.uri)));
}
