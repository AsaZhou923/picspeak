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
import {
  cachePhoto,
  collectUploadMetrics,
  extractClientMeta,
  getCachedPhoto,
} from './uploadFlowSupport';

export type Stage = 'idle' | 'uploading' | 'confirming' | 'ready' | 'rejected' | 'reviewing' | 'error';

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
      const { imgWidth, imgHeight, checksumSha256, uploadMetrics } = await collectUploadMetrics(file, preprocessMetrics);

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
