'use client';

const CACHE_NAME = 'ps-photo-previews-v1';
const CACHE_PATH = '/__cache__/photo-previews/';
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;

const objectUrlCache = new Map<string, string>();
const photoEvictionEpochs = new Map<string, number>();
let clearAllEpoch = 0;

function getPhotoEvictionEpoch(photoId: string): number {
  return photoEvictionEpochs.get(photoId) ?? 0;
}

function isPhotoEpochCurrent(photoId: string, clearSnap: number, photoSnap: number): boolean {
  return clearAllEpoch === clearSnap && getPhotoEvictionEpoch(photoId) === photoSnap;
}

function getCacheRequest(photoId: string): Request {
  return new Request(`${window.location.origin}${CACHE_PATH}${encodeURIComponent(photoId)}`);
}

async function openPhotoPreviewCache(): Promise<Cache | null> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return null;
  }
  return window.caches.open(CACHE_NAME);
}

function rememberObjectUrl(photoId: string, blob: Blob): string {
  const previousUrl = objectUrlCache.get(photoId);
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }

  const nextUrl = URL.createObjectURL(blob);
  objectUrlCache.set(photoId, nextUrl);
  return nextUrl;
}

function forgetObjectUrl(photoId: string): void {
  const existingUrl = objectUrlCache.get(photoId);
  if (!existingUrl) {
    return;
  }

  URL.revokeObjectURL(existingUrl);
  objectUrlCache.delete(photoId);
}

async function readCachedBlob(photoId: string): Promise<Blob | null> {
  const cache = await openPhotoPreviewCache();
  if (!cache) {
    return null;
  }

  const response = await cache.match(getCacheRequest(photoId));
  if (!response) {
    return null;
  }

  const cachedAtRaw = response.headers.get('X-PicSpeak-Cached-At');
  const cachedAt = cachedAtRaw ? Number(cachedAtRaw) : 0;
  if (!cachedAt || Date.now() - cachedAt > CACHE_TTL_MS) {
    await cache.delete(getCacheRequest(photoId));
    return null;
  }

  return response.blob();
}

export async function cacheUploadedPhotoPreview(photoId: string, blob: Blob): Promise<void> {
  if (!photoId) {
    return;
  }

  const clearSnap = clearAllEpoch;
  const photoSnap = getPhotoEvictionEpoch(photoId);
  const cache = await openPhotoPreviewCache();
  if (!cache || !isPhotoEpochCurrent(photoId, clearSnap, photoSnap)) {
    return;
  }

  await cache.put(
    getCacheRequest(photoId),
    new Response(blob, {
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'X-PicSpeak-Cached-At': String(Date.now()),
      },
    })
  );
  if (!isPhotoEpochCurrent(photoId, clearSnap, photoSnap)) {
    await cache.delete(getCacheRequest(photoId));
  }
}

export async function getUploadedPhotoPreviewSrc(photoId: string): Promise<string | null> {
  if (!photoId) {
    return null;
  }

  const clearSnap = clearAllEpoch;
  const photoSnap = getPhotoEvictionEpoch(photoId);
  const memoryUrl = objectUrlCache.get(photoId);
  if (memoryUrl) {
    return memoryUrl;
  }

  const cachedBlob = await readCachedBlob(photoId);
  if (!cachedBlob || !isPhotoEpochCurrent(photoId, clearSnap, photoSnap)) {
    return null;
  }

  return rememberObjectUrl(photoId, cachedBlob);
}

export async function refreshUploadedPhotoPreviewSrc(photoId: string): Promise<string | null> {
  if (!photoId) {
    return null;
  }

  const clearSnap = clearAllEpoch;
  const photoSnap = getPhotoEvictionEpoch(photoId);
  forgetObjectUrl(photoId);

  const cachedBlob = await readCachedBlob(photoId);
  if (!cachedBlob || !isPhotoEpochCurrent(photoId, clearSnap, photoSnap)) {
    return null;
  }

  return rememberObjectUrl(photoId, cachedBlob);
}

export async function evictPhotoPreviewCache(photoId: string): Promise<void> {
  if (!photoId) return;
  photoEvictionEpochs.set(photoId, getPhotoEvictionEpoch(photoId) + 1);
  forgetObjectUrl(photoId);
  const cache = await openPhotoPreviewCache();
  if (!cache) return;
  await cache.delete(getCacheRequest(photoId));
}

export async function clearPhotoPreviewCache(): Promise<void> {
  clearAllEpoch += 1;
  objectUrlCache.forEach((objectUrl) => {
    URL.revokeObjectURL(objectUrl);
  });
  objectUrlCache.clear();

  const cache = await openPhotoPreviewCache();
  if (!cache) {
    return;
  }

  const requests = await cache.keys();
  await Promise.all(requests.map((request) => cache.delete(request)));
}
