import { useCallback, useState } from 'react';
import { createPresign, putObjectStorage, confirmPhoto } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { ApiException, PhotoCreateResponse } from '@/lib/types';
import type { UploadPreprocessMetrics } from '@/components/upload/ImageUploader';
import type { ExifData } from '@/lib/exif';
import { formatUserFacingError } from '@/lib/error-utils';
import { cacheUploadedPhotoPreview } from '@/lib/photo-preview-cache';
import { trackProductEvent } from '@/lib/product-analytics';

export type Stage = 'idle' | 'uploading' | 'confirming' | 'ready' | 'rejected' | 'reviewing' | 'error';

type CachedPhotoEntry = { photo: PhotoCreateResponse; cached_at: number };

type UploadFlowMetrics = UploadPreprocessMetrics & {
  bitmap_decode_ms?: number;
  sha256_ms?: number;
  frontend_preprocess_ms?: number;
  presign_request_ms?: number;
  object_upload_ms?: number;
  confirm_request_ms?: number;
  total_upload_flow_ms?: number;
};

const PHOTO_UPLOAD_CACHE_KEY = 'ps_uploaded_photos_v1';
const PHOTO_UPLOAD_CACHE_LIMIT = 20;

function extractClientMeta(
  file: File,
  extra?: { width?: number; height?: number; original_size?: number; upload_metrics?: UploadFlowMetrics }
): Record<string, unknown> {
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

function getCachedPhoto(sha256: string): PhotoCreateResponse | null {
  return readCachedPhotos()[sha256]?.photo ?? null;
}

function cachePhoto(sha256: string, photo: PhotoCreateResponse): void {
  try {
    const cache = readCachedPhotos();
    const nextEntries = Object.entries({ ...cache, [sha256]: { photo, cached_at: Date.now() } })
      .sort(([, l], [, r]) => r.cached_at - l.cached_at)
      .slice(0, PHOTO_UPLOAD_CACHE_LIMIT);
    window.sessionStorage.setItem(PHOTO_UPLOAD_CACHE_KEY, JSON.stringify(Object.fromEntries(nextEntries)));
  } catch {
    // best-effort
  }
}

export function useUploadFlow({ fetchUsage }: { fetchUsage: () => void }) {
  const { token, ensureToken } = useAuth();
  const { t, locale } = useI18n();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [exifData, setExifData] = useState<ExifData>({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [stage, setStage] = useState<Stage>('idle');
  const [photo, setPhoto] = useState<PhotoCreateResponse | null>(null);
  const [errMessage, setErrMessage] = useState('');

  const handleFileSelected = useCallback(
    async (file: File, dataUrl: string, exif: ExifData = {}, preprocessMetrics?: UploadPreprocessMetrics) => {
      setSelectedFile(file);
      setPreview(dataUrl);
      setExifData(exif);
      setStage('uploading');
      setUploadProgress(0);
      setErrMessage('');
      void trackProductEvent('image_selected', {
        token: token ?? undefined,
        pagePath: '/workspace',
        locale,
        metadata: { file_size_bytes: file.size, mime: file.type || 'application/octet-stream' },
      });

      let imgWidth = 0;
      let imgHeight = 0;
      let checksumSha256: string | null = null;
      const uploadMetrics: UploadFlowMetrics = {
        exif_extract_ms: preprocessMetrics?.exif_extract_ms ?? 0,
        compression_ms: preprocessMetrics?.compression_ms ?? 0,
        file_read_ms: preprocessMetrics?.file_read_ms ?? 0,
        preprocess_total_ms: preprocessMetrics?.preprocess_total_ms ?? 0,
        compressed: preprocessMetrics?.compressed ?? false,
        original_size_bytes: preprocessMetrics?.original_size_bytes ?? file.size,
        final_size_bytes: preprocessMetrics?.final_size_bytes ?? file.size,
      };
      const bitmapDecodeStartedAt = performance.now();
      try {
        const bmp = await createImageBitmap(file);
        imgWidth = bmp.width;
        imgHeight = bmp.height;
        bmp.close();
      } catch { /* non-critical */ }
      uploadMetrics.bitmap_decode_ms = Math.round(performance.now() - bitmapDecodeStartedAt);

      const sha256StartedAt = performance.now();
      try { checksumSha256 = await computeFileSha256(file); } catch { checksumSha256 = null; }
      uploadMetrics.sha256_ms = Math.round(performance.now() - sha256StartedAt);
      uploadMetrics.frontend_preprocess_ms =
        uploadMetrics.preprocess_total_ms + uploadMetrics.bitmap_decode_ms + uploadMetrics.sha256_ms;
      logUploadMetrics('preprocess', { file_name: file.name, file_size_bytes: file.size, ...uploadMetrics });

      try {
        const tok = await ensureToken();

        if (checksumSha256) {
          const cachedPhoto = getCachedPhoto(checksumSha256);
          if (cachedPhoto) {
            void cacheUploadedPhotoPreview(cachedPhoto.photo_id, file);
            setPhoto(cachedPhoto);
            if (cachedPhoto.status === 'READY') {
              setStage('ready');
              void trackProductEvent('upload_succeeded', {
                token: tok ?? undefined,
                pagePath: '/workspace',
                locale,
                metadata: { cached_photo: true, photo_id: cachedPhoto.photo_id },
              });
              fetchUsage();
            } else if (cachedPhoto.status === 'REJECTED') {
              setStage('rejected');
              setErrMessage(t('photo_rejected_msg'));
            } else {
              setStage('error');
              setErrMessage(t('status_photo_error') + cachedPhoto.status);
            }
            return;
          }
        }

        const presign = await createPresign(
          {
            filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
            ...(checksumSha256 ? { sha256: checksumSha256 } : {}),
          },
          tok
        );

        await putObjectStorage(presign.put_url, file, presign.headers, (pct) => setUploadProgress(pct));

        setStage('confirming');
        const photoData = await confirmPhoto(
          presign.upload_id,
          exif as Record<string, unknown>,
          extractClientMeta(file, {
            width: imgWidth,
            height: imgHeight,
            original_size: preprocessMetrics?.original_size_bytes,
            upload_metrics: uploadMetrics,
          }),
          tok
        );

        setPhoto(photoData);
        if (checksumSha256) cachePhoto(checksumSha256, photoData);
        void cacheUploadedPhotoPreview(photoData.photo_id, file);

        if (photoData.status === 'READY') {
          setStage('ready');
          void trackProductEvent('upload_succeeded', {
            token: tok ?? undefined,
            pagePath: '/workspace',
            locale,
            metadata: { cached_photo: false, photo_id: photoData.photo_id },
          });
          fetchUsage();
        } else if (photoData.status === 'REJECTED') {
          setStage('rejected');
          setErrMessage(t('photo_rejected_msg'));
        } else {
          setStage('error');
          setErrMessage(t('status_photo_error') + photoData.status);
        }
      } catch (err) {
        setStage('error');
        if (err instanceof ApiException) {
          if (err.status === 429) {
            setErrMessage(formatUserFacingError(t, err, t('err_rate_limit')));
          } else if (err.status === 402 || err.code === 'QUOTA_EXCEEDED') {
            setErrMessage(formatUserFacingError(t, err, t('err_quota')));
          } else {
            setErrMessage(formatUserFacingError(t, err, err.message));
          }
        } else {
          setErrMessage(formatUserFacingError(t, err, t('err_upload')));
        }
      }
    },
    [ensureToken, fetchUsage, locale, t, token]
  );

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setPreview(null);
    setPhoto(null);
    setStage('idle');
    setErrMessage('');
    setUploadProgress(0);
  }, []);

  return {
    selectedFile,
    preview,
    exifData,
    uploadProgress,
    stage,
    setStage,
    photo,
    errMessage,
    setErrMessage,
    handleFileSelected,
    handleReset,
  };
}
