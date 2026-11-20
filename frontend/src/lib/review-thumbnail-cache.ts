'use client';

import { canvasToBlob } from './canvas';
import { logClientWarning } from './client-log';

const CACHE_NAME = 'ps-review-thumbnails-v1';
const CACHE_PATH = '/__cache__/review-thumbnails/';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_CONCURRENT_LOADS = 4;

const objectUrlCache = new Map<string, string>();
const pendingLoads = new Map<string, Promise<string | null>>();
const photoEvictionEpochs = new Map<string, number>();
const taskQueue: Array<() => void> = [];
let activeLoads = 0;
let clearAllEpoch = 0;

function getPhotoEvictionEpoch(photoId: string): number {
  return photoEvictionEpochs.get(photoId) ?? 0;
}

function isPhotoEpochCurrent(photoId: string, clearSnap: number, photoSnap: number): boolean {
  return clearAllEpoch === clearSnap && getPhotoEvictionEpoch(photoId) === photoSnap;
}

function getEntryKey(photoId: string, size: number): string {
  return `${photoId}:${size}`;
}

function getCacheRequest(photoId: string, size: number): Request {
  return new Request(
    `${window.location.origin}${CACHE_PATH}${encodeURIComponent(photoId)}?size=${size}`
  );
}

async function openThumbnailCache(): Promise<Cache | null> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return null;
  }
  return window.caches.open(CACHE_NAME);
}

async function runWithQueue<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const startTask = () => {
      activeLoads += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeLoads = Math.max(0, activeLoads - 1);
          const nextTask = taskQueue.shift();
          if (nextTask) {
            nextTask();
          }
        });
    };

    if (activeLoads < MAX_CONCURRENT_LOADS) {
      startTask();
      return;
    }

    taskQueue.push(startTask);
  });
}

function rememberObjectUrl(entryKey: string, blob: Blob): string {
  const previousUrl = objectUrlCache.get(entryKey);
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }

  const nextUrl = URL.createObjectURL(blob);
  objectUrlCache.set(entryKey, nextUrl);
  return nextUrl;
}

async function readCachedBlob(photoId: string, size: number): Promise<Blob | null> {
  const cache = await openThumbnailCache();
  if (!cache) {
    return null;
  }

  const request = getCacheRequest(photoId, size);
  const response = await cache.match(request);
  if (!response) {
    return null;
  }

  const cachedAtRaw = response.headers.get('X-PicSpeak-Cached-At');
  const cachedAt = cachedAtRaw ? Number(cachedAtRaw) : 0;
  if (!cachedAt || Date.now() - cachedAt > CACHE_TTL_MS) {
    await cache.delete(request);
    return null;
  }

  return response.blob();
}

async function persistCachedBlob(photoId: string, size: number, blob: Blob): Promise<void> {
  const cache = await openThumbnailCache();
  if (!cache) {
    return;
  }

  await cache.put(
    getCacheRequest(photoId, size),
    new Response(blob, {
      headers: {
        'Content-Type': blob.type || 'image/webp',
        'X-PicSpeak-Cached-At': String(Date.now()),
      },
    })
  );
}

function getTargetDimensions(width: number, height: number, maxSize: number) {
  if (width <= 0 || height <= 0) {
    return { width: maxSize, height: maxSize };
  }

  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function createThumbnailBlob(source: Blob, maxSize: number): Promise<Blob> {
  if (typeof document === 'undefined' || !source.type.startsWith('image/')) {
    return source;
  }

  try {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(source);
      const target = getTargetDimensions(bitmap.width, bitmap.height, maxSize);
      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return source;
      }
      ctx.drawImage(bitmap, 0, 0, target.width, target.height);
      bitmap.close();
      const blob = await canvasToBlob(canvas, 'image/webp', 0.82);
      return blob ?? source;
    }

    const objectUrl = URL.createObjectURL(source);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('thumbnail decode failed'));
        img.src = objectUrl;
      });

      const target = getTargetDimensions(image.naturalWidth, image.naturalHeight, maxSize);
      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return source;
      }
      ctx.drawImage(image, 0, 0, target.width, target.height);
      const blob = await canvasToBlob(canvas, 'image/webp', 0.82);
      return blob ?? source;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return source;
  }
}

export async function getReviewThumbnailSrc(
  photoId: string,
  photoUrl: string,
  size = 128,
  sourceIsThumbnail = false
): Promise<string | null> {
  const entryKey = getEntryKey(photoId, size);
  const clearSnap = clearAllEpoch;
  const photoSnap = getPhotoEvictionEpoch(photoId);
  const isCurrent = () => isPhotoEpochCurrent(photoId, clearSnap, photoSnap);

  const memoryUrl = objectUrlCache.get(entryKey);
  if (memoryUrl) {
    return memoryUrl;
  }

  const cachedBlob = await readCachedBlob(photoId, size);
  if (!isCurrent()) {
    return null;
  }
  if (cachedBlob) {
    return rememberObjectUrl(entryKey, cachedBlob);
  }

  const existingLoad = pendingLoads.get(entryKey);
  if (existingLoad) {
    return existingLoad;
  }

  const loadPromise = runWithQueue(async () => {
    if (!isCurrent()) {
      return null;
    }

    const warmBlob = await readCachedBlob(photoId, size);
    if (!isCurrent()) {
      return null;
    }
    if (warmBlob) {
      return rememberObjectUrl(entryKey, warmBlob);
    }

    const response = await fetch(photoUrl, {
      credentials: 'include',
      mode: 'cors',
    });
    if (!isCurrent()) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`thumbnail request failed: ${response.status}`);
    }

    const sourceBlob = await response.blob();
    if (!isCurrent()) {
      return null;
    }
    const thumbnailBlob = sourceIsThumbnail
      ? sourceBlob
      : await createThumbnailBlob(sourceBlob, size);
    if (!isCurrent()) {
      return null;
    }
    await persistCachedBlob(photoId, size, thumbnailBlob);
    if (!isCurrent()) {
      const cache = await openThumbnailCache();
      if (cache) {
        await cache.delete(getCacheRequest(photoId, size));
      }
      return null;
    }
    return rememberObjectUrl(entryKey, thumbnailBlob);
  })
    .catch((error: unknown) => {
      if (!isCurrent()) {
        return null;
      }
      logClientWarning('Review thumbnail load failed', {
        photoId,
        size,
        error,
      });
      return null;
    })
    .finally(() => {
      if (pendingLoads.get(entryKey) === loadPromise) {
        pendingLoads.delete(entryKey);
      }
    });

  pendingLoads.set(entryKey, loadPromise);
  return loadPromise;
}

export async function evictReviewThumbnailCache(photoId: string): Promise<void> {
  if (!photoId) return;
  photoEvictionEpochs.set(photoId, getPhotoEvictionEpoch(photoId) + 1);
  const prefix = `${photoId}:`;
  objectUrlCache.forEach((objectUrl, key) => {
    if (key.startsWith(prefix)) {
      URL.revokeObjectURL(objectUrl);
      objectUrlCache.delete(key);
    }
  });
  pendingLoads.forEach((_promise, key) => {
    if (key.startsWith(prefix)) {
      pendingLoads.delete(key);
    }
  });

  const cache = await openThumbnailCache();
  if (!cache) return;
  const encodedPrefix = `${CACHE_PATH}${encodeURIComponent(photoId)}`;
  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((req) => new URL(req.url).pathname === encodedPrefix)
      .map((req) => cache.delete(req))
  );
}

export async function clearReviewThumbnailCache(): Promise<void> {
  clearAllEpoch += 1;
  objectUrlCache.forEach((objectUrl) => {
    URL.revokeObjectURL(objectUrl);
  });
  objectUrlCache.clear();
  pendingLoads.clear();
  taskQueue.length = 0;
  activeLoads = 0;

  const cache = await openThumbnailCache();
  if (!cache) {
    return;
  }

  const requests = await cache.keys();
  await Promise.all(requests.map((request) => cache.delete(request)));
}
