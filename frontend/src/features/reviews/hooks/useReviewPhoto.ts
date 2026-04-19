import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { getReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse } from '@/lib/types';
import { refreshUploadedPhotoPreviewSrc } from '@/lib/photo-preview-cache';

export function useReviewPhoto({
  review,
  setReview,
  initialPhotoUrl,
}: {
  review: ReviewGetResponse | null;
  setReview: Dispatch<SetStateAction<ReviewGetResponse | null>>;
  initialPhotoUrl: string | null;
}) {
  const { ensureToken } = useAuth();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [photoRecovering, setPhotoRecovering] = useState(false);
  const [photoRecoveryAttempted, setPhotoRecoveryAttempted] = useState(false);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomMounted, setZoomMounted] = useState(false);

  const didInitRef = useRef(false);
  useEffect(() => {
    if (initialPhotoUrl && !didInitRef.current) {
      didInitRef.current = true;
      setPhotoError(false);
      setPhotoRecovering(false);
      setPhotoRecoveryAttempted(false);
      setPhotoUrl(initialPhotoUrl);
    }
  }, [initialPhotoUrl]);

  useEffect(() => {
    if (!zoomOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoomOpen]);

  const recoverPhotoUrl = useCallback(async (): Promise<boolean> => {
    if (!review) return false;

    const refreshedLocal = await refreshUploadedPhotoPreviewSrc(review.photo_id);
    if (refreshedLocal) {
      setPhotoError(false);
      setPhotoRecovering(false);
      setPhotoRecoveryAttempted(false);
      setPhotoUrl(refreshedLocal);
      return true;
    }

    try {
      const token = await ensureToken();
      const latestReview = await getReview(review.review_id, token);
      const refreshedRemote = latestReview.photo_url
        ? `${latestReview.photo_url}${latestReview.photo_url.includes('?') ? '&' : '?'}retry=${Date.now()}`
        : null;
      if (!refreshedRemote) return false;

      setReview(latestReview);
      setPhotoError(false);
      setPhotoRecovering(false);
      setPhotoRecoveryAttempted(false);
      setPhotoUrl(refreshedRemote);
      return true;
    } catch (err) {
      console.error('Failed to recover review photo after image error', err);
      return false;
    }
  }, [ensureToken, review, setReview]);

  const handlePhotoError = useCallback(async () => {
    if (!review || photoRecovering) return;
    if (photoRecoveryAttempted) {
      setPhotoRecovering(false);
      setPhotoError(true);
      return;
    }
    setPhotoRecovering(true);
    setPhotoRecoveryAttempted(true);
    const recovered = await recoverPhotoUrl();
    if (!recovered) {
      setPhotoRecovering(false);
      setPhotoError(true);
    }
  }, [photoRecovering, photoRecoveryAttempted, recoverPhotoUrl, review]);

  return {
    photoUrl,
    photoError,
    imgNaturalSize,
    setImgNaturalSize,
    handlePhotoError,
    zoomOpen,
    setZoomOpen,
    zoomMounted,
    setZoomMounted,
  };
}
