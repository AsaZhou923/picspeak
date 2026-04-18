import { useEffect, useState } from 'react';
import { getReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { getUploadedPhotoPreviewSrc } from '@/lib/photo-preview-cache';
import { formatUserFacingError } from '@/lib/error-utils';

export function useReviewDetail(reviewId: string) {
  const { ensureToken } = useAuth();
  const { t } = useI18n();
  const [review, setReview] = useState<ReviewGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [initialPhotoUrl, setInitialPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureToken()
      .then((token) => getReview(reviewId, token))
      .then(async (data) => {
        const localPhotoUrl = await getUploadedPhotoPreviewSrc(data.photo_id);
        if (cancelled) return;
        setReview(data);
        setInitialPhotoUrl(localPhotoUrl || data.photo_url || null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        setError(formatUserFacingError(t, err, t('review_err_fetch')));
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId, ensureToken, t]);

  return { review, setReview, loading, error, initialPhotoUrl };
}
