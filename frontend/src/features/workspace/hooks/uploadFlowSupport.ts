import { PhotoCreateResponse } from '@/lib/types';
import type { UploadPreprocessMetrics } from '@/components/upload/ImageUploader';

type CachedPhotoEntry = { photo: PhotoCreateResponse; cached_at: number };

export type UploadFlowMetrics = UploadPreprocessMetrics & {
  bitmap_decode_ms?: number;
  sha256_ms?: number;
  frontend_preprocess_ms?: number;
  presign_request_ms?: number;
  object_upload_ms?: number;
  confirm_request_ms?: number;
  total_upload_flow_ms?: number;
};

type ClientMetaOptions = {
  width?: number;
  height?: number;
  original_size?: number;
  upload_metrics?: UploadFlowMetrics;
};

export type UploadMetricsSnapshot = {
  imgWidth: number;
  imgHeight: number;
  checksumSha256: string | null;
  uploadMetrics: UploadFlowMetrics;
};

const PHOTO_UPLOAD_CACHE_KEY = 'ps_uploaded_photos_v1';
const PHOTO_UPLOAD_CACHE_LIMIT = 20;

export function extractClientMeta(file: File, extra?: ClientMetaOptions): Record<string, unknown> {
  return {
    original_filename: file.name,
    mime: file.type,
    size_bytes: file.size,
    last_modified: new Date(file.lastModified).toISOString(),
    ...(extra?.width ? { width: extra.width } : {}),
    ...(extra?.height ? { height: extra.height } : {}),
    ...(extra?.original_size ? { original_size: extra.original_size } : {}),
    ...(extra?.upload_metrics ? { upload_metrics: extra.upload_metrics } : {}),
  };
}

function logUploadMetrics(stage: string, metrics: Record<string, unknown>): void {
  console.info(`[upload-metrics] ${stage}`, metrics);
}

async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function readCachedPhotos(): Record<string, CachedPhotoEntry> {
  try {
    const raw = window.sessionStorage.getItem(PHOTO_UPLOAD_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CachedPhotoEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getCachedPhoto(sha256: string): PhotoCreateResponse | null {
  return readCachedPhotos()[sha256]?.photo ?? null;
}

export function cachePhoto(sha256: string, photo: PhotoCreateResponse): void {
  try {
    const cache = readCachedPhotos();
    const nextEntries = Object.entries({ ...cache, [sha256]: { photo, cached_at: Date.now() } })
      .sort(([, left], [, right]) => right.cached_at - left.cached_at)
      .slice(0, PHOTO_UPLOAD_CACHE_LIMIT);
    window.sessionStorage.setItem(PHOTO_UPLOAD_CACHE_KEY, JSON.stringify(Object.fromEntries(nextEntries)));
  } catch {
    // best-effort
  }
}

export async function collectUploadMetrics(
  file: File,
  preprocessMetrics?: UploadPreprocessMetrics
): Promise<UploadMetricsSnapshot> {
  const uploadMetrics: UploadFlowMetrics = {
    exif_extract_ms: preprocessMetrics?.exif_extract_ms ?? 0,
    compression_ms: preprocessMetrics?.compression_ms ?? 0,
    file_read_ms: preprocessMetrics?.file_read_ms ?? 0,
    preprocess_total_ms: preprocessMetrics?.preprocess_total_ms ?? 0,
    compressed: preprocessMetrics?.compressed ?? false,
    original_size_bytes: preprocessMetrics?.original_size_bytes ?? file.size,
    final_size_bytes: preprocessMetrics?.final_size_bytes ?? file.size,
  };

  let imgWidth = 0;
  let imgHeight = 0;
  let checksumSha256: string | null = null;

  const bitmapDecodeStartedAt = performance.now();
  try {
    const bmp = await createImageBitmap(file);
    imgWidth = bmp.width;
    imgHeight = bmp.height;
    bmp.close();
  } catch {
    // non-critical
  }
  uploadMetrics.bitmap_decode_ms = Math.round(performance.now() - bitmapDecodeStartedAt);

  const sha256StartedAt = performance.now();
  try {
    checksumSha256 = await computeFileSha256(file);
  } catch {
    checksumSha256 = null;
  }
  uploadMetrics.sha256_ms = Math.round(performance.now() - sha256StartedAt);
  uploadMetrics.frontend_preprocess_ms =
    uploadMetrics.preprocess_total_ms + uploadMetrics.bitmap_decode_ms + uploadMetrics.sha256_ms;

  logUploadMetrics('preprocess', {
    file_name: file.name,
    file_size_bytes: file.size,
    ...uploadMetrics,
  });

  return { imgWidth, imgHeight, checksumSha256, uploadMetrics };
}
