import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { getReview, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse } from '@/lib/types';
import { refreshUploadedPhotoPreviewSrc } from '@/lib/photo-preview-cache';
import { logClientError } from '@/lib/client-log';

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
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomMounted, setZoomMounted] = useState(false);

  const didInitRef = useRef(false);
  const activeReviewIdRef = useRef(review?.review_id);
  const recoveryControllerRef = useRef<AbortController | null>(null);
  const recoveryStateRef = useRef({ attempted: false, inFlight: false });
  activeReviewIdRef.current = review?.review_id;
  useEffect(() => {
    didInitRef.current = false;
    setPhotoUrl(null);
    setPhotoError(false);
    setPhotoRecovering(false);
    recoveryStateRef.current = { attempted: false, inFlight: false };
    setImgNaturalSize(null);
    setZoomOpen(false);
    return () => recoveryControllerRef.current?.abort();
  }, [review?.review_id]);
  useEffect(() => {
    if (initialPhotoUrl && !didInitRef.current) {
      didInitRef.current = true;
      setPhotoError(false);
      setPhotoRecovering(false);
      setPhotoUrl(initialPhotoUrl);
    }
  }, [initialPhotoUrl, review?.review_id]);

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

    const controller = new AbortController();
    recoveryControllerRef.current?.abort();
    recoveryControllerRef.current = controller;
    const isCurrent = () => !controller.signal.aborted && activeReviewIdRef.current === review.review_id;

    try {
      const refreshedLocal = await refreshUploadedPhotoPreviewSrc(review.photo_id);
      if (!isCurrent()) return false;
      if (refreshedLocal) {
        setPhotoError(false);
        setPhotoRecovering(false);
        setPhotoUrl(refreshedLocal);
        return true;
      }

      const token = await ensureToken();
      if (!isCurrent()) return false;
      const latestReview = await getReview(review.review_id, token, controller.signal);
      if (!isCurrent()) return false;
      const refreshedRemote = latestReview.photo_url
        ? `${latestReview.photo_url}${latestReview.photo_url.includes('?') ? '&' : '?'}retry=${Date.now()}`
        : null;
      if (!refreshedRemote) return false;

      setReview(latestReview);
      setPhotoError(false);
      setPhotoRecovering(false);
      setPhotoUrl(refreshedRemote);
      return true;
    } catch (err) {
      if (isCurrent() && !isAbortError(err)) {
        logClientError('Failed to recover review photo after image error', err, { reviewId: review.review_id });
      }
      return false;
    }
  }, [ensureToken, review, setReview]);

  const handlePhotoError = useCallback(async () => {
    if (!review || photoRecovering || recoveryStateRef.current.inFlight) return;
    if (recoveryStateRef.current.attempted) {
      setPhotoRecovering(false);
      setPhotoError(true);
      return;
    }
    recoveryStateRef.current = { attempted: true, inFlight: true };
    setPhotoRecovering(true);
    const recovered = await recoverPhotoUrl();
    if (activeReviewIdRef.current !== review.review_id) return;
    recoveryStateRef.current.inFlight = false;
    if (!recovered) {
      setPhotoRecovering(false);
      setPhotoError(true);
    }
  }, [photoRecovering, recoverPhotoUrl, review]);

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
