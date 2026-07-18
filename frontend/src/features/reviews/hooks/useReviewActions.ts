import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createReviewShare, exportReview, updateReviewMeta } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { trackProductEvent } from '@/lib/product-analytics';
import {
  getExportSummaryCopy,
  getFavoriteActionCopy,
  getGalleryActionCopy,
  getReviewActionCopy,
} from '@/lib/review-page-copy';
import { buildReviewExportMarkdown, mergeReviewMeta, ReviewActionBusy } from './reviewActionSupport';

export function useReviewActions({
  review,
  setReview,
}: {
  review: ReviewGetResponse | null;
  setReview: Dispatch<SetStateAction<ReviewGetResponse | null>>;
}) {
  const router = useRouter();
  const { ensureToken, token } = useAuth();
  const { t, locale } = useI18n();
  const actionCopy = getReviewActionCopy(locale);
  const favoriteCopy = getFavoriteActionCopy(locale);
  const galleryActionCopy = getGalleryActionCopy(locale);
  const exportSummaryCopy = getExportSummaryCopy(locale);

  const [linkCopied, setLinkCopied] = useState(false);
  const [galleryConfirmOpen, setGalleryConfirmOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<ReviewActionBusy>(null);
  const [actionFeedback, setActionFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!galleryConfirmOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGalleryConfirmOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [galleryConfirmOpen]);

  const handleGalleryToggle = useCallback(async () => {
    if (!review || actionBusy) return;
    const plan = review.viewer_is_owner ? 'owner' : 'guest';
    if (!review.viewer_is_owner) {
      setActionError(galleryActionCopy.guestBlocked);
      setActionFeedback('');
      return;
    }
    const nextVisible = !Boolean(review.gallery_visible);
    if (nextVisible) {
      setGalleryConfirmOpen(true);
      return;
    }
    await submitGalleryToggle(false);
  }, [review, actionBusy, galleryActionCopy.guestBlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitGalleryToggle = useCallback(async (nextVisible: boolean) => {
    if (!review || actionBusy) return;
    setActionBusy('gallery');
    setActionError('');
    setActionFeedback(nextVisible ? galleryActionCopy.pendingAdd : galleryActionCopy.pendingRemove);
    try {
      setGalleryConfirmOpen(false);
      const tok = await ensureToken();
      const payload = await updateReviewMeta(review.review_id, { gallery_visible: nextVisible }, tok);
      setReview((prev) => mergeReviewMeta(prev, payload));
      if (!payload.gallery_visible) {
        setActionFeedback(galleryActionCopy.doneRemove);
      } else if (payload.gallery_audit_status === 'approved') {
        setActionFeedback(galleryActionCopy.doneApproved);
      } else {
        setActionFeedback(payload.gallery_rejected_reason || galleryActionCopy.doneRejected);
      }
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }, [review, actionBusy, galleryActionCopy, ensureToken, setReview, t]);

  const handleBackendShareLink = useCallback(async () => {
    if (!review || actionBusy || !review.viewer_is_owner) return;
    void trackProductEvent('share_clicked', {
      token: token ?? undefined,
      pagePath: `/reviews/${review.review_id}`,
      locale,
      metadata: { review_id: review.review_id, mode: review.mode },
    });
    setActionBusy('share');
    setActionError('');
    setActionFeedback(actionCopy.sharePending);
    try {
      const tok = await ensureToken();
      const payload = await createReviewShare(review.review_id, tok);
      const sharePageUrl = new URL(`/share/${payload.share_token}`, window.location.origin).toString();
      await navigator.clipboard.writeText(sharePageUrl);
      setLinkCopied(true);
      setActionFeedback(actionCopy.shareDone);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }, [review, actionBusy, token, locale, actionCopy, ensureToken, t]);

  const handleBackendExportSummary = useCallback(async () => {
    if (!review || actionBusy || !review.viewer_is_owner) return;
    void trackProductEvent('export_clicked', {
      token: token ?? undefined,
      pagePath: `/reviews/${review.review_id}`,
      locale,
      metadata: { review_id: review.review_id, mode: review.mode },
    });
    setActionBusy('export');
    setActionError('');
    setActionFeedback(actionCopy.exportPending);
    try {
      const tok = await ensureToken();
      const payload = await exportReview(review.review_id, tok);
      const markdown = buildReviewExportMarkdown({ payload, locale, t, exportSummaryCopy });
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportSummaryCopy.filePrefix}-${review.review_id.slice(0, 8)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionFeedback(actionCopy.exportDone);
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }, [review, actionBusy, token, locale, actionCopy, exportSummaryCopy, ensureToken, t]);

  const handleFavoriteToggle = useCallback(async () => {
    if (!review || actionBusy || !review.viewer_is_owner) return;
    const nextFavorite = !Boolean(review.favorite);
    setActionBusy('favorite');
    setActionError('');
    setActionFeedback(nextFavorite ? favoriteCopy.pendingAdd : favoriteCopy.pendingRemove);
    try {
      const tok = await ensureToken();
      const payload = await updateReviewMeta(review.review_id, { favorite: nextFavorite }, tok);
      setReview((prev) => mergeReviewMeta(prev, payload));
      setActionFeedback(payload.favorite ? favoriteCopy.doneAdd : favoriteCopy.doneRemove);
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }, [review, actionBusy, favoriteCopy, ensureToken, setReview, t]);

  const handleReplayReview = useCallback(() => {
    if (!review || actionBusy || !review.viewer_is_owner) return;
    void trackProductEvent('reanalysis_clicked', {
      token: token ?? undefined,
      pagePath: `/reviews/${review.review_id}`,
      locale,
      metadata: { review_id: review.review_id, photo_id: review.photo_id, mode: review.mode, retake_intent: 'same_photo_fix' },
    });
    setActionBusy('replay');
    setActionError('');
    setActionFeedback(actionCopy.replayPending);
    const nextParams = new URLSearchParams({
      source_review_id: review.review_id,
      photo_id: review.photo_id,
      mode: review.mode,
      image_type: review.image_type ?? review.result.image_type ?? 'default',
      retake_intent: 'same_photo_fix',
    });
    router.push(`/workspace?${nextParams.toString()}`);
  }, [review, actionBusy, token, locale, actionCopy, router]);

  return {
    linkCopied,
    galleryConfirmOpen,
    setGalleryConfirmOpen,
    actionBusy,
    actionFeedback,
    actionError,
    galleryActionCopy,
    favoriteCopy,
    handleGalleryToggle,
    submitGalleryToggle,
    handleBackendShareLink,
    handleBackendExportSummary,
    handleFavoriteToggle,
    handleReplayReview,
  };
}
