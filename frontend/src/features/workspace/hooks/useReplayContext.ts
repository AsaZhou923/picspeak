import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getReview, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export function useReplayContext({ preview }: { preview: string | null }) {
  const { ensureToken } = useAuth();
  const searchParams = useSearchParams();

  const [sourceReviewId, setSourceReviewId] = useState<string | null>(
    searchParams.get('source_review_id')
  );
  const [replayPhotoId, setReplayPhotoId] = useState<string | null>(
    searchParams.get('photo_id')
  );
  const [replayPhotoUrl, setReplayPhotoUrl] = useState<string | null>(null);

  const clearReplay = useCallback((options?: { clearSource?: boolean }) => {
    if (options?.clearSource) {
      setSourceReviewId(null);
    }
    setReplayPhotoId(null);
    setReplayPhotoUrl(null);
  }, []);

  useEffect(() => {
    if (!sourceReviewId || preview) return;
    const controller = new AbortController();
    ensureToken()
      .then((tok) => getReview(sourceReviewId, tok, controller.signal))
      .then((data) => {
        if (!controller.signal.aborted) setReplayPhotoUrl(data.photo_url);
      })
      .catch((err) => {
        if (!isAbortError(err) && !controller.signal.aborted) {
          console.error('Failed to hydrate replay photo in workspace', err);
        }
      });
    return () => {
      controller.abort();
    };
  }, [sourceReviewId, preview, ensureToken]);

  return {
    sourceReviewId,
    replayPhotoId,
    replayPhotoUrl,
    clearReplay,
    initialMode: searchParams.get('mode'),
    initialImageType: searchParams.get('image_type'),
    retakeIntent: searchParams.get('retake_intent'),
    nextShootAction: searchParams.get('next_shoot_action'),
    nextShootDimension: searchParams.get('next_shoot_dimension'),
    sourceGenerationId: searchParams.get('generation_id'),
  };
}
