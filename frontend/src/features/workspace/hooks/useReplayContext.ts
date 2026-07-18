import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getReview, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { logClientError } from '@/lib/client-log';

export function useReplayContext() {
  const { ensureToken } = useAuth();
  const searchParams = useSearchParams();

  const [sourceReviewId, setSourceReviewId] = useState<string | null>(
    searchParams.get('source_review_id')
  );
  const [replayPhotoId, setReplayPhotoId] = useState<string | null>(
    searchParams.get('photo_id')
  );
  const [replayPhotoUrl, setReplayPhotoUrl] = useState<string | null>(null);
  const [sourcePhotoError, setSourcePhotoError] = useState(false);

  const clearReplay = useCallback((options?: { clearSource?: boolean; preserveSourcePhoto?: boolean }) => {
    if (options?.clearSource) {
      setSourceReviewId(null);
      setSourcePhotoError(false);
    }
    setReplayPhotoId(null);
    if (!options?.preserveSourcePhoto) {
      setReplayPhotoUrl(null);
    }
  }, []);

  useEffect(() => {
    if (!sourceReviewId || replayPhotoUrl) return;
    const controller = new AbortController();
    setSourcePhotoError(false);
    ensureToken()
      .then((tok) => getReview(sourceReviewId, tok, controller.signal))
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.photo_url) {
          setReplayPhotoUrl(data.photo_url);
        } else {
          setSourcePhotoError(true);
        }
      })
      .catch((err) => {
        if (!isAbortError(err) && !controller.signal.aborted) {
          setSourcePhotoError(true);
          logClientError('Failed to hydrate replay photo in workspace', err, { sourceReviewId });
        }
      });
    return () => {
      controller.abort();
    };
  }, [sourceReviewId, replayPhotoUrl, ensureToken]);

  return {
    sourceReviewId,
    replayPhotoId,
    replayPhotoUrl,
    sourcePhotoError,
    sourcePhotoLoading: Boolean(sourceReviewId && !replayPhotoUrl && !sourcePhotoError),
    clearReplay,
    initialMode: searchParams.get('mode'),
    initialImageType: searchParams.get('image_type'),
    retakeIntent: searchParams.get('retake_intent'),
    nextShootAction: searchParams.get('next_shoot_action'),
    nextShootDimension: searchParams.get('next_shoot_dimension'),
    sourceGenerationId: searchParams.get('generation_id'),
    contentEntrypoint: searchParams.get('entrypoint'),
    contentSlug: searchParams.get('content_slug'),
    galleryReviewId: searchParams.get('gallery_review_id'),
    promptExampleId: searchParams.get('prompt_example_id'),
  };
}
