import * as FileSystem from 'expo-file-system/legacy';

const folder = `${FileSystem.documentDirectory ?? ''}chivago-adventure-evidence/`;

/** Copy a camera-cache file into app-owned storage so a restart cannot lose pending evidence. */
export async function persistOutboxPhoto(uri: string, requestId: string, index: number): Promise<string> {
  if (!FileSystem.documentDirectory || !uri.startsWith('file:')) return uri;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const extension = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(uri)?.[1]?.toLowerCase() ?? 'jpg';
  const safeId = requestId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  const target = `${folder}${safeId}-${index}.${extension}`;
  if (!(await FileSystem.getInfoAsync(target)).exists) await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

export async function deleteOutboxPhoto(uri: string): Promise<void> {
  if (FileSystem.documentDirectory && uri.startsWith(folder)) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}
