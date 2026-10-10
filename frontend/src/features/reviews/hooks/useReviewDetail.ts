import { useEffect, useRef, useState } from 'react';
import { getReview, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { getUploadedPhotoPreviewSrc } from '@/lib/photo-preview-cache';
import { formatUserFacingError } from '@/lib/error-utils';
import { trackProductEvent } from '@/lib/product-analytics';

export function useReviewDetail(reviewId: string) {
  const { ensureToken, userInfo, isLoading: authLoading } = useAuth();
  const identity = userInfo?.user_id ?? null;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const { t, locale } = useI18n();
  const [review, setReview] = useState<ReviewGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [initialPhotoUrl, setInitialPhotoUrl] = useState<string | null>(null);
  const [loadedIdentity, setLoadedIdentity] = useState<string | null | undefined>(undefined);
  const [loadedReviewId, setLoadedReviewId] = useState<string | null>(null);
  const trackedReviewIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setReview(null);
    setInitialPhotoUrl(null);
    if (authLoading) return () => controller.abort();
    ensureToken()
      .then(async (token) => {
        if (controller.signal.aborted || identityRef.current !== identity) return;
        const data = await getReview(reviewId, token, controller.signal);
        const localPhotoUrl = await getUploadedPhotoPreviewSrc(data.photo_id);
        if (controller.signal.aborted || identityRef.current !== identity) return;
        setLoadedIdentity(identity);
        setLoadedReviewId(reviewId);
        setReview(data);
        setInitialPhotoUrl(localPhotoUrl || data.photo_url || null);
        setLoading(false);
        if (data.viewer_is_owner && !trackedReviewIdsRef.current.has(data.review_id)) {
          trackedReviewIdsRef.current.add(data.review_id);
          void trackProductEvent('review_result_viewed', {
            token,
            pagePath: `/reviews/${data.review_id}`,
            locale,
            metadata: {
              review_id: data.review_id,
              task_id: data.task_id ?? undefined,
              photo_id: data.photo_id,
            },
          });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || identityRef.current !== identity || isAbortError(err)) return;
        setLoading(false);
        setError(formatUserFacingError(t, err, t('review_err_fetch')));
      });
    return () => {
      controller.abort();
    };
  }, [reviewId, ensureToken, locale, t, identity, authLoading]);

  const matchesIdentity = !authLoading && loadedIdentity === identity && loadedReviewId === reviewId;
  return {
    review: matchesIdentity && !loading ? review : null,
    setReview,
    loading: authLoading || loading,
    error: authLoading ? '' : error,
    initialPhotoUrl: matchesIdentity && !loading ? initialPhotoUrl : null,
  };
}
