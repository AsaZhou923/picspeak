import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getReview } from '@/lib/api';
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

  const clearReplay = useCallback(() => {
    setSourceReviewId(null);
    setReplayPhotoId(null);
    setReplayPhotoUrl(null);
  }, []);

  useEffect(() => {
    if (!sourceReviewId || preview) return;
    let cancelled = false;
    ensureToken()
      .then((tok) => getReview(sourceReviewId, tok))
      .then((data) => {
        if (!cancelled) setReplayPhotoUrl(data.photo_url);
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to hydrate replay photo in workspace', err);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceReviewId, preview, ensureToken]);

  return {
    sourceReviewId,
    replayPhotoId,
    replayPhotoUrl,
    clearReplay,
    initialMode: searchParams.get('mode'),
    initialImageType: searchParams.get('image_type'),
  };
}
